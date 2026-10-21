import { eq, desc } from 'drizzle-orm';
import { getDatabase, trace_runs, trace_spans } from '@aethertrace/core-schema';

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
 * Evaluates whether the current request breaches defined safety boundaries:
 * 1. Financial circuit breaker (X-Max-Budget-USD)
 * 2. Repetitive semantic loop circuit breaker (identical request_hash threshold)
 */
export async function checkCircuitBreakers(options: BreakerCheckOptions): Promise<BreakerResult> {
  const { runId, requestHash, maxBudgetUsd, loopThreshold = 3 } = options;
  const { db } = getDatabase();

  // 1. Budget Circuit Breaker Check
  if (typeof maxBudgetUsd === 'number' && maxBudgetUsd > 0) {
    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      if (run.total_cost >= maxBudgetUsd) {
        return {
          allowed: false,
          type: 'budget_exceeded',
          message: `Run budget limit exceeded: current spend $${run.total_cost.toFixed(6)} >= limit $${maxBudgetUsd.toFixed(6)}`,
          details: {
            currentCost: run.total_cost,
            maxBudgetUsd,
            runId
          }
        };
      }
    }
  }

  // 2. Semantic Loop Circuit Breaker Check
  if (loopThreshold > 0 && requestHash) {
    // Fetch the most recent spans for this run
    const recentSpans = db
      .select({ id: trace_spans.id, request_hash: trace_spans.request_hash, created_at: trace_spans.created_at })
      .from(trace_spans)
      .where(eq(trace_spans.run_id, runId))
      .orderBy(desc(trace_spans.started_at))
      .limit(loopThreshold)
      .all();

    if (recentSpans.length >= loopThreshold - 1) {
      // Check if all recent spans match the incoming request_hash
      const matchingCount = recentSpans.filter((s) => s.request_hash === requestHash).length;
      if (matchingCount >= loopThreshold - 1) {
        return {
          allowed: false,
          type: 'loop_detected',
          message: `Semantic infinite loop detected: Request hash '${requestHash.substring(0, 12)}...' repeated ${matchingCount + 1} times consecutively`,
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
