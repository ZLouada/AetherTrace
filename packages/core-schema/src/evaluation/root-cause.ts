/**
 * AetherTrace — Causal Root-Cause Analysis Engine (Phase 13)
 */

import type { TraceSpan } from '../schema.js';
import type { RootCauseCandidate } from './types.js';
import type { ExecutionIntelligence } from '../intelligence/types.js';

import { analyzeExecutionIntelligence } from '../intelligence/engine.js';

export function analyzeRootCauses(
  spans: TraceSpan[],
  intelOrOther?: ExecutionIntelligence | any
): RootCauseCandidate[] {
  const candidates: RootCauseCandidate[] = [];
  const intel: ExecutionIntelligence =
    intelOrOther && typeof intelOrOther === 'object' && 'retryChains' in intelOrOther
      ? intelOrOther
      : analyzeExecutionIntelligence(spans);

  // 1. Identify all failed spans with timestamps and error descriptions
  const failedSpans: Array<{
    span: TraceSpan;
    errorType: string;
    errorSummary: string;
  }> = [];

  for (const s of spans) {
    let isError = false;
    let errorType = 'Error';
    let errorSummary = '';

    if (s.span_type === 'guardrail_block') {
      isError = true;
      errorType = 'GuardrailBlock';
      errorSummary = 'Blocked by safety guardrail';
    } else if (s.response_payload) {
      try {
        const parsed = JSON.parse(s.response_payload);
        if (parsed.error) {
          isError = true;
          errorType = parsed.error.type || 'ExecutionError';
          errorSummary = parsed.error.message || JSON.stringify(parsed.error);
        } else if (parsed.statusCode && parsed.statusCode >= 400) {
          isError = true;
          errorType = `HTTP_${parsed.statusCode}`;
          errorSummary = `HTTP ${parsed.statusCode}`;
        }
      } catch {
        if (/"error"/i.test(s.response_payload)) {
          isError = true;
          errorSummary = s.response_payload.slice(0, 100);
        }
      }
    }

    if (isError) {
      failedSpans.push({ span: s, errorType, errorSummary });
    }
  }

  if (failedSpans.length === 0 && intel.retryChains.length === 0) {
    return [];
  }

  // Sort chronologically
  failedSpans.sort((a, b) => a.span.created_at - b.span.created_at);

  // 2. Cross-reference with retry chains from intelligence
  // If a retry chain exists, the original failed attempt is the prime root cause candidate
  const processedSpanIds = new Set<string>();

  for (const rc of intel.retryChains) {
    const originSpanId = rc.originalSpanId;
    const originSpan = spans.find((s) => s.id === originSpanId);
    if (!originSpan) continue;

    processedSpanIds.add(originSpanId);

    // Collect downstream attempts and children
    const downstreamSpanIds = rc.attempts.slice(1).map((a) => a.spanId);
    const downstreamFailures = rc.attempts.filter((a) => a.status === 'error').length;

    candidates.push({
      id: `root_rc_${originSpan.id.slice(0, 8)}`,
      candidateType: 'primary',
      spanId: originSpan.id,
      agentName: originSpan.agent_name || 'default-agent',
      spanType: originSpan.span_type,
      eventType: originSpan.span_type,
      errorSummary: rc.attempts[0]?.errorReason || rc.operationName || 'Operation failed triggering retry sequence',
      explanation: `Observed causal root failure in ${originSpan.agent_name} (${originSpan.span_type}) which triggered ${rc.attempts.length - 1} subsequent retries and added ${rc.totalRetryDurationMs}ms execution delay.`,
      impact: {
        retryCount: rc.attempts.length - 1,
        delayMs: rc.totalRetryDurationMs,
        downstreamFailuresCount: downstreamFailures,
        costImpactUsd: rc.attempts.reduce((sum, a) => sum + (spans.find((s) => s.id === a.spanId)?.cost_usd || 0), 0)
      },
      downstreamSpanIds
    });
  }


  // 3. Evaluate remaining failed spans
  if (failedSpans.length > 0) {
    const earliest = failedSpans[0];
    if (!processedSpanIds.has(earliest.span.id)) {
      processedSpanIds.add(earliest.span.id);

      // Find downstream spans caused by earliest
      const downstreamSpanIds = failedSpans.slice(1).map((f) => f.span.id);
      const downstreamDelay = failedSpans.reduce((sum, f) => sum + (f.span.latency_ms || 0), 0);
      const downstreamCost = failedSpans.reduce((sum, f) => sum + (f.span.cost_usd || 0), 0);

      candidates.unshift({
        id: `root_earliest_${earliest.span.id.slice(0, 8)}`,
        candidateType: candidates.length === 0 ? 'primary' : 'secondary',
        spanId: earliest.span.id,
        agentName: earliest.span.agent_name || 'default-agent',
        spanType: earliest.span.span_type,
        eventType: earliest.errorType,
        errorSummary: earliest.errorSummary || 'Earliest recorded failure',
        explanation: `Chronologically earliest failure occurred in ${earliest.span.agent_name} [${earliest.errorType}]. Preceded ${downstreamSpanIds.length} subsequent failure(s).`,
        impact: {
          retryCount: 0,
          delayMs: earliest.span.latency_ms || 0,
          downstreamFailuresCount: downstreamSpanIds.length,
          costImpactUsd: downstreamCost
        },
        downstreamSpanIds
      });
    }

    // Add remaining failed spans as secondary/contributing
    for (let i = 1; i < failedSpans.length; i++) {
      const f = failedSpans[i];
      if (processedSpanIds.has(f.span.id)) continue;
      processedSpanIds.add(f.span.id);

      candidates.push({
        id: `root_downstream_${f.span.id.slice(0, 8)}`,
        candidateType: 'contributing',
        spanId: f.span.id,
        agentName: f.span.agent_name || 'default-agent',
        spanType: f.span.span_type,
        eventType: f.errorType,
        errorSummary: f.errorSummary,
        explanation: `Downstream failure observed in ${f.span.agent_name} [${f.errorType}]. Likely consequence of preceding root cause.`,
        impact: {
          retryCount: 0,
          delayMs: f.span.latency_ms || 0,
          downstreamFailuresCount: 0,
          costImpactUsd: f.span.cost_usd || 0
        },
        downstreamSpanIds: []
      });
    }
  }

  // 4. Critical path bottleneck contributor
  if (intel.criticalPath.longestSpan && candidates.length === 0) {
    const longest = intel.criticalPath.longestSpan;
    if (longest.percentageOfCriticalPath > 50) {
      candidates.push({
        id: `root_bottleneck_${longest.spanId.slice(0, 8)}`,
        candidateType: 'primary',
        spanId: longest.spanId,
        agentName: 'System',
        spanType: 'llm_call',
        eventType: 'LatencyBottleneck',
        errorSummary: `Latency bottleneck (${longest.durationMs}ms)`,
        explanation: `Execution bottleneck: ${longest.label} accounted for ${longest.percentageOfCriticalPath}% of total critical path latency.`,
        impact: {
          retryCount: 0,
          delayMs: longest.durationMs,
          downstreamFailuresCount: 0,
          costImpactUsd: 0
        },
        downstreamSpanIds: []
      });
    }
  }

  return candidates;
}
