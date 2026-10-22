import { eq, asc } from 'drizzle-orm';
import { trace_runs, trace_spans, type TraceRun, type TraceSpan } from './schema.js';
import { getDatabase } from './db.js';
import type {
  RunDiffResult,
  SpanDiffItem,
  RunDiffSummary,
  SpanDiffClassification
} from './types.js';
import { compareRunProvenance, type RunProvenance } from './provenance.js';

export interface AlignedPair {
  base: TraceSpan | null;
  target: TraceSpan | null;
}

export function alignSpanSequences(baseSpans: TraceSpan[], targetSpans: TraceSpan[]): AlignedPair[] {
  const n = baseSpans.length;
  const m = targetSpans.length;

  if (n === 0) {
    return targetSpans.map((t) => ({ base: null, target: t }));
  }
  if (m === 0) {
    return baseSpans.map((b) => ({ base: b, target: null }));
  }

  function matchScore(b: TraceSpan, t: TraceSpan): number {
    if (b.request_hash === t.request_hash) {
      return 3.0;
    }
    // Matching tool calls by tool_name
    if (b.span_type === 'tool_call' && t.span_type === 'tool_call') {
      try {
        const bPayload = JSON.parse(b.request_payload || '{}');
        const tPayload = JSON.parse(t.request_payload || '{}');
        if (bPayload.tool_name && bPayload.tool_name === tPayload.tool_name) {
          return 2.5; // Same tool, possibly modified arguments
        }
      } catch {}
    }
    if (b.agent_name === t.agent_name) {
      if (b.span_type === t.span_type) {
        if (b.model === t.model) return 2.0;
        return 1.5; // Agent match with substituted model
      }
      return 1.0;
    }
    if (b.span_type === t.span_type) {
      return 0.5;
    }
    return -1.0;
  }

  const gapPenalty = -0.5;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) dp[i][0] = i * gapPenalty;
  for (let j = 1; j <= m; j++) dp[0][j] = j * gapPenalty;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const score = matchScore(baseSpans[i - 1], targetSpans[j - 1]);
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + score,
        dp[i - 1][j] + gapPenalty,
        dp[i][j - 1] + gapPenalty
      );
    }
  }

  const aligned: AlignedPair[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const score = matchScore(baseSpans[i - 1], targetSpans[j - 1]);
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + score)) < 1e-6) {
        aligned.unshift({ base: baseSpans[i - 1], target: targetSpans[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (j > 0 && Math.abs(dp[i][j] - (dp[i][j - 1] + gapPenalty)) < 1e-6) {
      aligned.unshift({ base: null, target: targetSpans[j - 1] });
      j--;
    } else {
      aligned.unshift({ base: baseSpans[i - 1], target: null });
      i--;
    }
  }

  return aligned;
}

/**
 * Computes a deterministic side-by-side diff between two trace runs (e.g. Base vs Forked Run)
 */
export function computeRunDiff(
  dbOrBaseId: any,
  baseRunIdOrTargetId: string,
  maybeTargetRunId?: string
): RunDiffResult | null {
  let db: any;
  let baseRunId: string;
  let targetRunId: string;

  if (typeof dbOrBaseId === 'string' && typeof baseRunIdOrTargetId === 'string' && !maybeTargetRunId) {
    db = getDatabase().db;
    baseRunId = dbOrBaseId;
    targetRunId = baseRunIdOrTargetId;
  } else {
    db = dbOrBaseId;
    baseRunId = baseRunIdOrTargetId;
    targetRunId = maybeTargetRunId!;
  }

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

  const alignedPairs = alignSpanSequences(baseSpans, targetSpans);
  const steps: SpanDiffItem[] = [];
  const forkedSpanId = targetRun.forked_at_span_id;
  let diverged = false;
  let identicalCount = 0;
  let divergedCount = 0;

  for (let i = 0; i < alignedPairs.length; i++) {
    const b = alignedPairs[i].base;
    const t = alignedPairs[i].target;

    let status: SpanDiffClassification;

    if (b === null && t !== null) {
      status = 'inserted';
      divergedCount++;
    } else if (b !== null && t === null) {
      status = 'removed';
      divergedCount++;
    } else if (b !== null && t !== null) {
      if (diverged) {
        status = 'diverged_downstream';
        divergedCount++;
      } else if (b.id === forkedSpanId) {
        status = 'modified_fork';
        diverged = true;
        divergedCount++;
      } else if (b.request_hash === t.request_hash) {
        status = 'identical_cached';
        identicalCount++;
      } else {
        status = forkedSpanId ? 'modified_fork' : 'modified';
        diverged = true;
        divergedCount++;
      }
    } else {
      continue;
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

    const modelChanged = Boolean(b && t && b.model !== t.model);
    const promptChanged = Boolean(b && t && b.request_hash !== t.request_hash);

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

  let baseProv: RunProvenance | null = null;
  let targetProv: RunProvenance | null = null;
  try {
    if (baseRun.provenance) baseProv = JSON.parse(baseRun.provenance);
  } catch {}
  try {
    if (targetRun.provenance) targetProv = JSON.parse(targetRun.provenance);
  } catch {}

  const provenanceDiff = compareRunProvenance(baseProv, targetProv);

  return { summary, steps, provenanceDiff };
}
