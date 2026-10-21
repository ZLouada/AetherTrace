import { eq, asc } from 'drizzle-orm';
import { trace_runs, trace_spans, type TraceRun, type TraceSpan } from './schema.js';
import type {
  RunDiffResult,
  SpanDiffItem,
  RunDiffSummary,
  SpanDiffClassification
} from './types.js';

/**
 * Computes a deterministic side-by-side diff between two trace runs (e.g. Base vs Forked Run)
 */
export function computeRunDiff(
  db: any,
  baseRunId: string,
  targetRunId: string
): RunDiffResult | null {
  const baseRuns = db.select().from(trace_runs).where(eq(trace_runs.id, baseRunId)).limit(1).all();
  if (baseRuns.length === 0) return null;
  const baseRun: TraceRun = baseRuns[0];

  const targetRuns = db.select().from(trace_runs).where(eq(trace_runs.id, targetRunId)).limit(1).all();
  if (targetRuns.length === 0) return null;
  const targetRun: TraceRun = targetRuns[0];

  const baseSpans: TraceSpan[] = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, baseRunId))
    .orderBy(asc(trace_spans.created_at))
    .all();

  const targetSpans: TraceSpan[] = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, targetRunId))
    .orderBy(asc(trace_spans.created_at))
    .all();

  // Aggregate metrics
  const baseCostUsd = baseRun.total_cost_usd || 0;
  const targetCostUsd = targetRun.total_cost_usd || 0;
  const costDeltaUsd = Number((targetCostUsd - baseCostUsd).toFixed(6));

  // Positive savings = target saved money relative to base
  let costSavingsPercent = 0;
  if (baseCostUsd > 0) {
    costSavingsPercent = Number((((baseCostUsd - targetCostUsd) / baseCostUsd) * 100).toFixed(2));
  } else if (targetCostUsd === 0) {
    costSavingsPercent = 0;
  } else {
    costSavingsPercent = -100;
  }

  const baseTokens = baseRun.total_tokens || 0;
  const targetTokens = targetRun.total_tokens || 0;
  const tokenDelta = targetTokens - baseTokens;

  const baseLatencyMs = baseSpans.reduce((acc, s) => acc + (s.latency_ms || 0), 0);
  const targetLatencyMs = targetSpans.reduce((acc, s) => acc + (s.latency_ms || 0), 0);
  const latencyDeltaMs = targetLatencyMs - baseLatencyMs;

  const maxLen = Math.max(baseSpans.length, targetSpans.length);
  const steps: SpanDiffItem[] = [];
  const forkedSpanId = targetRun.forked_at_span_id;
  let foundFork = false;
  let identicalCount = 0;
  let divergedCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const b: TraceSpan | null = baseSpans[i] || null;
    const t: TraceSpan | null = targetSpans[i] || null;

    let status: SpanDiffClassification;

    if (!foundFork) {
      if (b && forkedSpanId && b.id === forkedSpanId) {
        status = 'modified_fork';
        foundFork = true;
      } else if (b && t && b.request_hash === t.request_hash) {
        status = 'identical_cached';
      } else {
        status = 'modified_fork';
        foundFork = true;
      }
    } else {
      status = 'diverged_downstream';
    }

    if (status === 'identical_cached') {
      identicalCount++;
    } else {
      divergedCount++;
    }

    const bCost = b?.cost_usd || 0;
    const tCost = t?.cost_usd || 0;
    const stepCostDelta = Number((tCost - bCost).toFixed(6));
    let stepSavingsPercent = 0;
    if (bCost > 0) {
      stepSavingsPercent = Number((((bCost - tCost) / bCost) * 100).toFixed(2));
    }

    const bTokens = (b?.prompt_tokens || 0) + (b?.completion_tokens || 0);
    const tTokens = (t?.prompt_tokens || 0) + (t?.completion_tokens || 0);
    const stepTokenDelta = tTokens - bTokens;

    const bLat = b?.latency_ms || 0;
    const tLat = t?.latency_ms || 0;
    const stepLatDelta = tLat - bLat;

    const modelChanged = b?.model !== t?.model;
    const promptChanged = b?.request_hash !== t?.request_hash;

    steps.push({
      stepIndex: i + 1,
      status,
      agentName: t?.agent_name || b?.agent_name || `step-${i + 1}`,
      baseSpan: b,
      targetSpan: t,
      deltas: {
        costDeltaUsd: stepCostDelta,
        costSavingsPercent: stepSavingsPercent,
        tokenDelta: stepTokenDelta,
        latencyDeltaMs: stepLatDelta,
        modelChanged,
        promptChanged
      }
    });
  }

  const summary: RunDiffSummary = {
    baseRunId: baseRun.id,
    baseRunName: baseRun.name,
    targetRunId: targetRun.id,
    targetRunName: targetRun.name,
    baseCostUsd,
    targetCostUsd,
    costDeltaUsd,
    costSavingsPercent,
    baseTokens,
    targetTokens,
    tokenDelta,
    baseLatencyMs,
    targetLatencyMs,
    latencyDeltaMs,
    identicalStepsCount: identicalCount,
    divergedStepsCount: divergedCount
  };

  return { summary, steps };
}
