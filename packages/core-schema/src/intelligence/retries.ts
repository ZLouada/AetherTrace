import type { TraceSpan } from '../schema.js';
import type { IntelligentRetryChain, RetryAttempt, FailureHotspots } from './types.js';

function parsePayload(str?: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Derives retry chains and failure hotspots from execution spans.
 */
export function deriveRetryIntelligence(spans: TraceSpan[]): {
  retryChains: IntelligentRetryChain[];
  failureHotspots: FailureHotspots;
} {
  if (!spans || spans.length === 0) {
    return {
      retryChains: [],
      failureHotspots: {
        mostRetriedOperation: null,
        mostFailedTool: null,
        longestRetryChainCount: 0,
        highestRetryCostUsd: 0,
        totalErrors: 0
      }
    };
  }

  const spanById = new Map<string, TraceSpan>();
  for (const s of spans) {
    spanById.set(s.id, s);
  }

  const rootSpanIdCache = new Map<string, string>();
  function findRootOriginalSpanId(spanId: string): string {
    const cached = rootSpanIdCache.get(spanId);
    if (cached) return cached;

    let currId = spanId;
    const seen = new Set<string>();
    while (currId && !seen.has(currId)) {
      seen.add(currId);
      const span = spanById.get(currId);
      if (!span || span.span_type !== 'retry') {
        rootSpanIdCache.set(spanId, currId);
        return currId;
      }
      const payload = parsePayload(span.request_payload);
      const nextId = payload?.original_span_id || span.parent_span_id;
      if (!nextId) {
        rootSpanIdCache.set(spanId, currId);
        return currId;
      }
      currId = nextId;
    }
    rootSpanIdCache.set(spanId, currId);
    return currId;
  }

  // 1. Group retry spans by their original failed span ID
  const retriesByTarget = new Map<string, TraceSpan[]>();

  for (const s of spans) {
    if (s.span_type === 'retry') {
      const payload = parsePayload(s.request_payload);
      const rawTargetId = payload?.original_span_id || s.parent_span_id;
      if (rawTargetId) {
        const rootTargetId = findRootOriginalSpanId(rawTargetId);
        if (!retriesByTarget.has(rootTargetId)) {
          retriesByTarget.set(rootTargetId, []);
        }
        retriesByTarget.get(rootTargetId)!.push(s);
      }
    }
  }

  const retryChains: IntelligentRetryChain[] = [];

  for (const [origId, retryList] of retriesByTarget.entries()) {
    const origSpan = spanById.get(origId);
    const origReq = parsePayload(origSpan?.request_payload) || {};
    const operationName =
      origReq.tool_name ||
      origReq.name ||
      origReq.function?.name ||
      origSpan?.model ||
      origSpan?.span_type ||
      'operation';
    const agentName = origSpan?.agent_name || 'default-agent';

    const attempts: RetryAttempt[] = [];

    // Attempt 0: Original invocation
    if (origSpan) {
      attempts.push({
        spanId: origSpan.id,
        attempt: 0,
        durationMs: Math.max(0, origSpan.latency_ms || 0),
        status: 'error',
        costUsd: origSpan.cost_usd || 0,
        errorReason: 'Original failed attempt'
      });
    }

    // Sort retries by created_at or attempt number
    const sortedRetries = [...retryList].sort((a, b) => {
      const pA = parsePayload(a.request_payload);
      const pB = parsePayload(b.request_payload);
      const attA = pA?.attempt || 0;
      const attB = pB?.attempt || 0;
      if (attA !== attB) return attA - attB;
      return a.created_at - b.created_at;
    });

    let totalRetryDurationMs = origSpan ? Math.max(0, origSpan.latency_ms || 0) : 0;
    let totalRetryCostUsd = origSpan ? (origSpan.cost_usd || 0) : 0;
    let failedAttemptsCount = origSpan ? 1 : 0;
    let successfulAttemptIndex: number | undefined = undefined;

    for (let i = 0; i < sortedRetries.length; i++) {
      const r = sortedRetries[i];
      const pReq = parsePayload(r.request_payload) || {};
      const pRes = parsePayload(r.response_payload) || {};

      const isError =
        r.span_type === 'guardrail_block' ||
        pRes.status === 'error' ||
        Boolean(pRes.error) ||
        Boolean(pRes.is_error);

      const attemptNum = pReq.attempt || (i + 1);
      const cost = r.cost_usd || 0;
      const duration = Math.max(0, r.latency_ms || 0);

      totalRetryDurationMs += duration;
      totalRetryCostUsd += cost;

      if (isError) {
        failedAttemptsCount++;
      } else if (successfulAttemptIndex === undefined) {
        successfulAttemptIndex = attemptNum;
      }

      attempts.push({
        spanId: r.id,
        attempt: attemptNum,
        durationMs: duration,
        status: isError ? 'error' : 'success',
        costUsd: cost,
        errorReason: isError ? (pRes.error?.message || pReq.reason || 'retry error') : undefined
      });
    }

    const finalAttempt = attempts[attempts.length - 1];
    const finalStatus = finalAttempt ? finalAttempt.status : 'error';

    retryChains.push({
      id: `rc_${origId}`,
      originalSpanId: origId,
      operationName,
      agentName,
      attempts,
      retryCount: retryList.length,
      failedAttemptsCount,
      successfulAttemptIndex,
      totalRetryDurationMs,
      totalRetryCostUsd: Number(totalRetryCostUsd.toFixed(6)),
      finalStatus: finalStatus === 'success' ? 'success' : 'failed'
    });
  }

  // 2. Compute Failure Hotspots
  let totalErrors = 0;
  const operationRetryCount = new Map<string, number>();
  const toolFailureCount = new Map<string, number>();
  let longestRetryChainCount = 0;
  let highestRetryCostUsd = 0;

  for (const s of spans) {
    const isExplicitError = s.span_type === 'guardrail_block';
    let isPayloadError = false;
    if (s.response_payload && (s.response_payload.includes('error') || s.response_payload.includes('failed') || s.response_payload.includes('Error'))) {
      const res = parsePayload(s.response_payload);
      if (typeof res === 'object' && res !== null) {
        isPayloadError = res.status === 'error' || Boolean(res.error) || Boolean(res.is_error);
      } else if (typeof res === 'string') {
        isPayloadError = res.includes('error') || res.includes('Error') || res.includes('failed');
      }
    }

    if (isExplicitError || isPayloadError) {
      totalErrors++;
      if (s.span_type === 'tool_call' || (s.span_type as string) === 'tool_execution') {
        const req = parsePayload(s.request_payload);
        const tName = req?.tool_name || req?.name || s.model || 'unknown_tool';
        toolFailureCount.set(tName, (toolFailureCount.get(tName) || 0) + 1);
      }
    }
  }

  for (const rc of retryChains) {
    operationRetryCount.set(
      rc.operationName,
      (operationRetryCount.get(rc.operationName) || 0) + rc.retryCount
    );

    if (rc.retryCount > longestRetryChainCount) {
      longestRetryChainCount = rc.retryCount;
    }
    if (rc.totalRetryCostUsd > highestRetryCostUsd) {
      highestRetryCostUsd = rc.totalRetryCostUsd;
    }
  }

  let mostRetriedOperation: string | null = null;
  let maxRetries = 0;
  for (const [op, cnt] of operationRetryCount.entries()) {
    if (cnt > maxRetries) {
      maxRetries = cnt;
      mostRetriedOperation = op;
    }
  }

  let mostFailedTool: string | null = null;
  let maxFailed = 0;
  for (const [t, cnt] of toolFailureCount.entries()) {
    if (cnt > maxFailed) {
      maxFailed = cnt;
      mostFailedTool = t;
    }
  }

  return {
    retryChains,
    failureHotspots: {
      mostRetriedOperation,
      mostFailedTool,
      longestRetryChainCount,
      highestRetryCostUsd: Number(highestRetryCostUsd.toFixed(6)),
      totalErrors
    }
  };
}
