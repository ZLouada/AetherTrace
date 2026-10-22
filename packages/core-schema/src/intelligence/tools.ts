import type { TraceSpan } from '../schema.js';
import type { ToolChain, ToolChainStep } from './types.js';

function parsePayload(str?: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Derives tool-chain intelligence from execution spans.
 * Groups tool calls and their associated retries/results into coherent tool interaction chains.
 */
export function deriveToolChainIntelligence(spans: TraceSpan[]): ToolChain[] {
  if (!spans || spans.length === 0) return [];

  const toolSpans: TraceSpan[] = [];
  const retrySpansByTarget = new Map<string, TraceSpan[]>();

  for (const s of spans) {
    if (s.span_type === 'tool_call' || (s.span_type as string) === 'tool_execution') {
      toolSpans.push(s);
    } else if (s.span_type === 'retry') {
      const payload = parsePayload(s.request_payload);
      const targetId = payload?.original_span_id || s.parent_span_id;
      if (targetId) {
        if (!retrySpansByTarget.has(targetId)) {
          retrySpansByTarget.set(targetId, []);
        }
        retrySpansByTarget.get(targetId)!.push(s);
      }
    }
  }

  if (toolSpans.length === 0) return [];

  // Group tool calls by agent and tool sequence
  const chains: ToolChain[] = [];

  for (let i = 0; i < toolSpans.length; i++) {
    const s = toolSpans[i];
    const req = parsePayload(s.request_payload) || {};
    const res = parsePayload(s.response_payload) || {};

    const toolName = req.tool_name || req.name || req.function?.name || s.model || 'unknown_tool';
    const isError = res.status === 'error' || Boolean(res.error) || Boolean(res.is_error);
    const errorMessage = res.error?.message || (typeof res.error === 'string' ? res.error : undefined);

    const steps: ToolChainStep[] = [
      {
        spanId: s.id,
        toolName,
        arguments: req.arguments !== undefined ? req.arguments : req,
        result: res.result !== undefined ? res.result : res,
        durationMs: Math.max(0, s.latency_ms || 0),
        status: isError ? 'error' : 'success',
        errorMessage,
        isRetry: false
      }
    ];

    // Check if retries exist for this tool call
    const retries = retrySpansByTarget.get(s.id) || [];
    let retryCount = 0;
    for (const r of retries) {
      retryCount++;
      const rReq = parsePayload(r.request_payload) || {};
      const rRes = parsePayload(r.response_payload) || {};
      const rIsError = rRes.status === 'error' || Boolean(rRes.error) || r.span_type === 'guardrail_block';
      steps.push({
        spanId: r.id,
        toolName,
        arguments: rReq.arguments !== undefined ? rReq.arguments : rReq,
        result: rRes.result !== undefined ? rRes.result : rRes,
        durationMs: Math.max(0, r.latency_ms || 0),
        status: rIsError ? 'error' : 'success',
        errorMessage: rRes.error?.message || rReq.reason || undefined,
        isRetry: true,
        attempt: rReq.attempt || retryCount
      });
    }

    const spanIds = [s.id, ...retries.map((r) => r.id)];
    const totalDurationMs = steps.reduce((sum, st) => sum + st.durationMs, 0);
    const finalStep = steps[steps.length - 1];
    const hasFailures = steps.some((st) => st.status === 'error');

    chains.push({
      id: `tc_${s.id}`,
      agentName: s.agent_name || 'default-agent',
      toolName,
      spanIds,
      steps,
      totalDurationMs,
      finalStatus: finalStep.status,
      retryCount,
      hasFailures
    });
  }

  return chains;
}
