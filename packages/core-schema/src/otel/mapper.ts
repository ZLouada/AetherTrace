import { calculateCost } from '@aethertrace/pricing-engine';
import { redactValue } from '../security/redaction.js';
import { computeRequestHash } from '../hash.js';
import type { SpanType, TokenUsageStatus, ExecutionOrigin } from '../types.js';
import type { InsertTraceRun, InsertTraceSpan } from '../schema.js';
import {
  type OtlpExportTraceServiceRequest,
  type OtlpSpan,
  otlpAttributesToRecord
} from './types.js';

/**
 * Normalizes an OTel 32-hex trace ID to a deterministic AetherTrace run ID.
 */
export function otlpTraceIdToRunId(traceId?: string): string {
  if (!traceId) {
    return `run_otel_unknown_${Date.now()}`;
  }
  if (traceId.startsWith('run_')) {
    return traceId;
  }
  // Standard 32-character hex traceId
  const clean = traceId.toLowerCase().replace(/[^a-f0-9]/g, '');
  return clean ? `run_otel_${clean}` : `run_otel_${traceId}`;
}

/**
 * Normalizes an OTel 16-hex span ID to a deterministic AetherTrace span ID.
 */
export function otlpSpanIdToSpanId(spanId?: string): string {
  if (!spanId) {
    return `span_otel_unknown_${Date.now()}`;
  }
  if (spanId.startsWith('span_')) {
    return spanId;
  }
  // Standard 16-character hex spanId
  const clean = spanId.toLowerCase().replace(/[^a-f0-9]/g, '');
  return clean ? `span_otel_${clean}` : `span_otel_${spanId}`;
}

/**
 * Converts nanoseconds (string or number) to integer milliseconds.
 */
export function otlpNanoToMs(nano?: string | number): number {
  if (!nano) return Date.now();
  if (typeof nano === 'number') {
    return Math.floor(nano / 1_000_000);
  }
  try {
    const big = BigInt(nano);
    return Number(big / 1_000_000n);
  } catch {
    return Math.floor(Number(nano) / 1_000_000) || Date.now();
  }
}

/**
 * Classifies an OTel span into AetherTrace's standard Event Taxonomy.
 */
export function classifyOtlpSpanType(attrs: Record<string, any>, spanName: string): SpanType {
  const customType = attrs['aethertrace.span_type'] || attrs['span_type'];
  if (customType && ['llm_call', 'tool_call', 'agent_state', 'guardrail_block', 'http_call', 'user_input', 'system_event', 'retry'].includes(customType)) {
    return customType as SpanType;
  }

  // 1. Tool Call
  if (
    attrs['gen_ai.tool.name'] ||
    attrs['tool.name'] ||
    attrs['function.name'] ||
    attrs['gen_ai.operation.name'] === 'tool' ||
    spanName.toLowerCase().startsWith('tool:') ||
    spanName.toLowerCase().startsWith('tool ') ||
    spanName.toLowerCase().includes('execute_tool')
  ) {
    return 'tool_call';
  }

  // 2. Retry
  if (
    attrs['retry.attempt'] !== undefined ||
    attrs['retry_count'] !== undefined ||
    spanName.toLowerCase().includes('retry')
  ) {
    return 'retry';
  }

  // 3. HTTP Call
  if (
    attrs['http.request.method'] ||
    attrs['http.method'] ||
    attrs['url.full'] ||
    attrs['http.url'] ||
    spanName.toLowerCase().startsWith('http ')
  ) {
    return 'http_call';
  }

  // 4. Agent State
  if (
    attrs['agent.name'] ||
    attrs['agent.role'] ||
    attrs['gen_ai.agent.name'] ||
    spanName.toLowerCase().startsWith('agent:')
  ) {
    return 'agent_state';
  }

  // 5. LLM Call (Default for GenAI spans)
  if (
    attrs['gen_ai.system'] ||
    attrs['gen_ai.request.model'] ||
    attrs['gen_ai.response.model'] ||
    attrs['llm.provider'] ||
    attrs['model'] ||
    attrs['gen_ai.usage.input_tokens'] !== undefined
  ) {
    return 'llm_call';
  }

  return 'llm_call';
}

/**
 * Converts an OTLP JSON ExportTraceServiceRequest into native AetherTrace run and spans.
 */
export function mapOtlpToAetherTrace(
  request: OtlpExportTraceServiceRequest,
  options: { runNameOverride?: string; runIdOverride?: string } = {}
): { run: InsertTraceRun; spans: InsertTraceSpan[] } {
  const resourceSpans = request.resourceSpans || [];
  const rawSpans: Array<{ span: OtlpSpan; scopeName?: string; resourceAttrs: Record<string, any> }> = [];

  for (const rs of resourceSpans) {
    const resourceAttrs = otlpAttributesToRecord(rs.resource?.attributes);
    const scopeSpans = rs.scopeSpans || [];
    for (const ss of scopeSpans) {
      const scopeName = ss.scope?.name;
      const spans = ss.spans || [];
      for (const s of spans) {
        rawSpans.push({ span: s, scopeName, resourceAttrs });
      }
    }
  }

  if (rawSpans.length === 0) {
    const fallbackId = options.runIdOverride || `run_otel_empty_${Date.now()}`;
    return {
      run: {
        id: fallbackId,
        name: options.runNameOverride || 'empty-otel-trace',
        status: 'completed',
        total_tokens: 0,
        total_cost_usd: 0,
        created_at: Date.now()
      },
      spans: []
    };
  }

  // Determine Primary Trace ID
  const firstSpan = rawSpans[0].span;
  const rawTraceId = firstSpan.traceId;
  const runId = options.runIdOverride || otlpTraceIdToRunId(rawTraceId);

  // Determine Run Name
  let runName = options.runNameOverride;
  if (!runName) {
    const serviceName = rawSpans[0].resourceAttrs['service.name'];
    if (serviceName) {
      runName = `otel-${serviceName}`;
    } else {
      runName = `otel-trace-${rawTraceId ? rawTraceId.slice(0, 8) : 'run'}`;
    }
  }

  let totalTokens = 0;
  let totalCostUsd = 0;
  let hasFailure = false;
  let earliestCreatedAt = Number.MAX_SAFE_INTEGER;

  const translatedSpans: InsertTraceSpan[] = [];

  for (const item of rawSpans) {
    const { span, scopeName, resourceAttrs } = item;
    const spanAttrs = otlpAttributesToRecord(span.attributes);
    const mergedAttrs = { ...resourceAttrs, ...spanAttrs };

    const spanId = otlpSpanIdToSpanId(span.spanId);
    let parentSpanId: string | null = null;
    if (span.parentSpanId && span.parentSpanId !== '0000000000000000' && span.parentSpanId.trim() !== '') {
      parentSpanId = otlpSpanIdToSpanId(span.parentSpanId);
    }

    const spanType = classifyOtlpSpanType(mergedAttrs, span.name);

    // Agent name resolution
    const agentName =
      mergedAttrs['aethertrace.agent_name'] ||
      mergedAttrs['gen_ai.agent.name'] ||
      mergedAttrs['agent.name'] ||
      mergedAttrs['service.name'] ||
      scopeName ||
      'default-agent';

    // Model resolution
    const model =
      mergedAttrs['gen_ai.response.model'] ||
      mergedAttrs['gen_ai.request.model'] ||
      mergedAttrs['model'] ||
      mergedAttrs['llm.model'] ||
      null;

    // Tokens resolution
    const promptTokens = Number(
      mergedAttrs['gen_ai.usage.input_tokens'] ??
      mergedAttrs['prompt_tokens'] ??
      mergedAttrs['llm.usage.prompt_tokens'] ??
      0
    );
    const completionTokens = Number(
      mergedAttrs['gen_ai.usage.output_tokens'] ??
      mergedAttrs['completion_tokens'] ??
      mergedAttrs['llm.usage.completion_tokens'] ??
      0
    );
    const spanTokens = promptTokens + completionTokens;
    totalTokens += spanTokens;

    // Cost derivation
    let costUsd = 0;
    let usageStatus: TokenUsageStatus = 'unavailable';

    if (mergedAttrs['aethertrace.cost_usd'] !== undefined) {
      costUsd = Number(mergedAttrs['aethertrace.cost_usd']) || 0;
      usageStatus = 'reported';
    } else if (model && spanTokens > 0) {
      const pricing = calculateCost(model, promptTokens, completionTokens);
      costUsd = Number(pricing.totalCost.toFixed(6));
      usageStatus = 'estimated';
    } else if (spanTokens > 0) {
      usageStatus = 'reported';
    }
    totalCostUsd += costUsd;

    // Timing
    const createdAt = otlpNanoToMs(span.startTimeUnixNano);
    const endAt = otlpNanoToMs(span.endTimeUnixNano);
    const latencyMs = Math.max(0, endAt - createdAt);

    if (createdAt < earliestCreatedAt) {
      earliestCreatedAt = createdAt;
    }

    // Status & Error
    const isError = span.status?.code === 2;
    if (isError) {
      hasFailure = true;
    }

    // Payloads
    const toolName =
      mergedAttrs['gen_ai.tool.name'] ||
      mergedAttrs['tool.name'] ||
      mergedAttrs['function.name'] ||
      (spanType === 'tool_call' ? span.name.replace(/^tool[:\s]*/i, '') : undefined);

    const requestPayloadObj: any = {
      span_name: span.name,
      trace_id: span.traceId,
      span_id: span.spanId,
      tool_name: toolName,
      name: toolName || span.name,
      prompt: mergedAttrs['gen_ai.prompt'] || mergedAttrs['messages'] || mergedAttrs['prompt'],
      arguments: mergedAttrs['gen_ai.tool.call.arguments'] || mergedAttrs['tool.arguments'],
      http_method: mergedAttrs['http.request.method'] || mergedAttrs['http.method'],
      url: mergedAttrs['url.full'] || mergedAttrs['http.url'],
      attributes: mergedAttrs
    };

    const responsePayloadObj: any = {
      status: isError ? 'error' : 'success',
      completion: mergedAttrs['gen_ai.completion'] || mergedAttrs['response'],
      result: mergedAttrs['gen_ai.tool.call.result'] || mergedAttrs['tool.result'],
      status_message: span.status?.message,
      events: span.events?.map((ev) => ({
        name: ev.name,
        time_ms: otlpNanoToMs(ev.timeUnixNano),
        attributes: otlpAttributesToRecord(ev.attributes)
      }))
    };

    // Redaction
    const safeRequest = redactValue(requestPayloadObj);
    const safeResponse = redactValue(responsePayloadObj);

    const requestPayloadStr = JSON.stringify(safeRequest);
    const responsePayloadStr = JSON.stringify(safeResponse);
    const requestHash = computeRequestHash(safeRequest);

    const executionOrigin: ExecutionOrigin = (mergedAttrs['aethertrace.execution_origin'] as ExecutionOrigin) || 'original';
    const sourceSpanId = mergedAttrs['aethertrace.source_span_id'] || null;

    translatedSpans.push({
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: spanType,
      agent_name: agentName,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
      latency_ms: latencyMs,
      cache_hit: mergedAttrs['aethertrace.cache_hit'] ? 1 : 0,
      execution_origin: executionOrigin,
      source_span_id: sourceSpanId,
      usage_status: usageStatus,
      request_payload: requestPayloadStr,
      response_payload: responsePayloadStr,
      request_hash: requestHash,
      created_at: createdAt
    });
  }

  // Sort chronologically
  translatedSpans.sort((a, b) => a.created_at - b.created_at);

  const finalRun: InsertTraceRun = {
    id: runId,
    name: runName,
    status: hasFailure ? 'failed' : 'completed',
    total_tokens: totalTokens,
    total_cost_usd: Number(totalCostUsd.toFixed(6)),
    parent_run_id: null,
    forked_at_span_id: null,
    mutations: null,
    created_at: earliestCreatedAt !== Number.MAX_SAFE_INTEGER ? earliestCreatedAt : Date.now()
  };

  return {
    run: finalRun,
    spans: translatedSpans
  };
}
