import { eq, desc } from 'drizzle-orm';
import { getDatabase, trace_runs, trace_spans, type TraceSpan } from '@aethertrace/core-schema';
import { randomUUID } from 'node:crypto';
import { broadcastEvent } from '../broadcaster.js';

export interface BreakerCheckOptions {
  runId: string;
  requestHash: string;
  maxBudgetUsd?: number;
  loopThreshold?: number;
}

export interface BreakerResult {
  allowed: boolean;
  type?: 'budget_exceeded' | 'loop_detected';
  message?: string;
  details?: Record<string, any>;
}

export class CircuitBreakerError extends Error {
  public code: string;
  public details?: Record<string, any>;

  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Checks whether current request breaches defined safety boundaries:
 * 1. Financial limit: total_cost_usd >= X-Max-Budget-USD
 * 2. Infinite loop detection: identical request_hash called loopThreshold times in a row in the same run
 */
export async function checkCircuitBreakers(options: BreakerCheckOptions): Promise<BreakerResult> {
  const { runId, requestHash, maxBudgetUsd, loopThreshold = 3 } = options;
  const { db } = getDatabase();

  // 1. Budget Circuit Breaker Check
  if (typeof maxBudgetUsd === 'number' && maxBudgetUsd > 0) {
    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      if (run.total_cost_usd >= maxBudgetUsd) {
        return {
          allowed: false,
          type: 'budget_exceeded',
          message: `Run budget limit exceeded: current spend $${run.total_cost_usd.toFixed(6)} >= limit $${maxBudgetUsd.toFixed(6)}`,
          details: {
            currentCostUsd: run.total_cost_usd,
            maxBudgetUsd,
            runId
          }
        };
      }
    }
  }

  // 2. Semantic Infinite Loop Check
  if (loopThreshold > 0 && requestHash) {
    const recentSpans = db
      .select({ id: trace_spans.id, request_hash: trace_spans.request_hash, created_at: trace_spans.created_at })
      .from(trace_spans)
      .where(eq(trace_spans.run_id, runId))
      .orderBy(desc(trace_spans.created_at))
      .limit(loopThreshold)
      .all();

    if (recentSpans.length >= loopThreshold - 1) {
      const matchingCount = recentSpans.filter((s) => s.request_hash === requestHash).length;
      if (matchingCount >= loopThreshold - 1) {
        return {
          allowed: false,
          type: 'loop_detected',
          message: `Circuit Breaker Tripped: Infinite loop detected. Request hash '${requestHash.substring(0, 12)}...' repeated ${matchingCount + 1} times consecutively`,
          details: {
            requestHash,
            consecutiveRepeats: matchingCount + 1,
            loopThreshold,
            runId
          }
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Handles actions required when circuit breaker trips:
 * 1. Update trace_runs.status = 'breaker_tripped'
 * 2. Insert a 'guardrail_block' span
 * 3. Broadcast a WebSocket alert
 */
export function tripCircuitBreaker(params: {
  runId: string;
  parentSpanId?: string | null;
  agentName?: string;
  model?: string;
  requestPayload?: string;
  requestHash: string;
  breakerResult: BreakerResult;
}): TraceSpan {
  const { db } = getDatabase();
  const now = Date.now();
  const spanId = `span_${randomUUID()}`;

  // 1. Update trace_runs status
  db.update(trace_runs)
    .set({ status: 'breaker_tripped' })
    .where(eq(trace_runs.id, params.runId))
    .run();

  // 2. Insert guardrail_block span
  const blockSpan: TraceSpan = {
    id: spanId,
    run_id: params.runId,
    parent_span_id: params.parentSpanId || null,
    span_type: 'guardrail_block',
    agent_name: params.agentName || 'default-agent',
    model: params.model || 'unknown',
    request_payload: params.requestPayload || null,
    response_payload: JSON.stringify({
      error: {
        message: params.breakerResult.message,
        type: 'circuit_breaker_tripped',
        code: params.breakerResult.type,
        details: params.breakerResult.details
      }
    }),
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0.0,
    latency_ms: 0,
    cache_hit: 0,
    request_hash: params.requestHash,
    created_at: now
  };

  db.insert(trace_spans).values(blockSpan).run();

  // 3. Broadcast WebSocket alert
  broadcastEvent({
    type: 'CIRCUIT_BREAKER_TRIPPED',
    data: {
      runId: params.runId,
      spanId,
      reason: params.breakerResult.type,
      message: params.breakerResult.message,
      details: params.breakerResult.details,
      span: blockSpan
    }
  });

  return blockSpan;
}
