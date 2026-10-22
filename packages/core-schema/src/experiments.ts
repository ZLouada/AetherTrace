import { eq, desc, asc, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import {
  experiments,
  experiment_variants,
  trace_runs,
  trace_spans,
  type Experiment,
  type ExperimentVariant,
  type TraceRun,
  type TraceSpan
} from './schema.js';
import type {
  ExperimentStatus,
  ReplayMode,
  ExperimentMutation,
  ExperimentSummary,
  ExperimentWithVariants,
  MultiVariantComparisonResult,
  MultiVariantScorecardItem,
  ReplayHistoryItem
} from './types.js';
import { computeRunDiff } from './diff.js';
import { deriveCriticalPathIntelligence } from './intelligence/critical-path.js';
import { deriveToolChainIntelligence } from './intelligence/tools.js';

export function createExperiment(
  db: BetterSQLite3Database<typeof schema>,
  params: {
    name: string;
    description?: string | null;
    sourceRunId: string;
    metadata?: Record<string, any> | string | null;
  }
): Experiment {
  const sourceRun = db.select().from(trace_runs).where(eq(trace_runs.id, params.sourceRunId)).get();
  if (!sourceRun) {
    throw new Error(`Source run '${params.sourceRunId}' not found`);
  }

  const now = Date.now();
  const id = `exp_${randomUUID()}`;
  const metadataStr = typeof params.metadata === 'object' && params.metadata !== null
    ? JSON.stringify(params.metadata)
    : (params.metadata || null);

  const exp: Experiment = {
    id,
    name: params.name,
    description: params.description || null,
    source_run_id: params.sourceRunId,
    status: 'draft',
    metadata: metadataStr,
    created_at: now,
    updated_at: now
  };

  db.insert(experiments).values(exp).run();
  return exp;
}

export function getExperiment(
  db: BetterSQLite3Database<typeof schema>,
  experimentId: string
): ExperimentWithVariants | null {
  const exp = db.select().from(experiments).where(eq(experiments.id, experimentId)).get();
  if (!exp) return null;

  const sourceRun = db.select().from(trace_runs).where(eq(trace_runs.id, exp.source_run_id)).get() || null;
  const variants = db
    .select()
    .from(experiment_variants)
    .where(eq(experiment_variants.experiment_id, experimentId))
    .orderBy(asc(experiment_variants.created_at))
    .all();

  return {
    ...exp,
    sourceRun,
    variants
  };
}

export function listExperiments(
  db: BetterSQLite3Database<typeof schema>
): ExperimentSummary[] {
  const allExp = db.select().from(experiments).orderBy(desc(experiments.created_at)).all();
  if (allExp.length === 0) return [];

  const allVariants = db.select().from(experiment_variants).all();
  const allRuns = db.select().from(trace_runs).all();
  const runMap = new Map<string, TraceRun>();
  for (const r of allRuns) runMap.set(r.id, r);

  const variantsByExp = new Map<string, ExperimentVariant[]>();
  for (const v of allVariants) {
    if (!variantsByExp.has(v.experiment_id)) {
      variantsByExp.set(v.experiment_id, []);
    }
    variantsByExp.get(v.experiment_id)!.push(v);
  }

  return allExp.map((exp) => {
    const vars = variantsByExp.get(exp.id) || [];
    const completedCount = vars.filter((v) => v.status === 'completed').length;
    const sRun = runMap.get(exp.source_run_id);

    return {
      id: exp.id,
      name: exp.name,
      description: exp.description,
      source_run_id: exp.source_run_id,
      source_run_name: sRun?.name,
      status: exp.status as ExperimentStatus,
      variant_count: vars.length,
      completed_variant_count: completedCount,
      created_at: exp.created_at,
      updated_at: exp.updated_at
    };
  });
}

export function deleteExperiment(
  db: BetterSQLite3Database<typeof schema>,
  experimentId: string
): boolean {
  const res = db.delete(experiments).where(eq(experiments.id, experimentId)).run();
  return (res.changes ?? 0) > 0;
}

export function createVariant(
  db: BetterSQLite3Database<typeof schema>,
  params: {
    experimentId: string;
    name: string;
    description?: string | null;
    forkSpanId?: string | null;
    mutations?: ExperimentMutation[] | string;
    replayMode?: ReplayMode;
  }
): ExperimentVariant {
  const exp = db.select().from(experiments).where(eq(experiments.id, params.experimentId)).get();
  if (!exp) {
    throw new Error(`Experiment '${params.experimentId}' not found`);
  }

  const mutationsStr = typeof params.mutations === 'string'
    ? params.mutations
    : JSON.stringify(params.mutations || []);

  const now = Date.now();
  const variant: ExperimentVariant = {
    id: `var_${randomUUID()}`,
    experiment_id: params.experimentId,
    name: params.name,
    description: params.description || null,
    source_run_id: exp.source_run_id,
    replay_run_id: null,
    fork_span_id: params.forkSpanId || null,
    mutations: mutationsStr,
    replay_mode: params.replayMode || 'cache_only',
    status: 'draft',
    error_message: null,
    created_at: now,
    completed_at: null
  };

  db.insert(experiment_variants).values(variant).run();
  db.update(experiments).set({ updated_at: now }).where(eq(experiments.id, params.experimentId)).run();

  return variant;
}

export function updateVariant(
  db: BetterSQLite3Database<typeof schema>,
  variantId: string,
  updates: Partial<Omit<ExperimentVariant, 'id' | 'experiment_id' | 'created_at'>>
): ExperimentVariant {
  const existing = db.select().from(experiment_variants).where(eq(experiment_variants.id, variantId)).get();
  if (!existing) {
    throw new Error(`Variant '${variantId}' not found`);
  }

  const now = Date.now();
  db.update(experiment_variants)
    .set(updates)
    .where(eq(experiment_variants.id, variantId))
    .run();

  db.update(experiments)
    .set({ updated_at: now })
    .where(eq(experiments.id, existing.experiment_id))
    .run();

  return db.select().from(experiment_variants).where(eq(experiment_variants.id, variantId)).get()!;
}

export function deleteVariant(
  db: BetterSQLite3Database<typeof schema>,
  variantId: string
): boolean {
  const variant = db.select().from(experiment_variants).where(eq(experiment_variants.id, variantId)).get();
  if (!variant) return false;

  const res = db.delete(experiment_variants).where(eq(experiment_variants.id, variantId)).run();
  db.update(experiments).set({ updated_at: Date.now() }).where(eq(experiments.id, variant.experiment_id)).run();
  return (res.changes ?? 0) > 0;
}

export function getVariant(
  db: BetterSQLite3Database<typeof schema>,
  variantId: string
): ExperimentVariant | null {
  return db.select().from(experiment_variants).where(eq(experiment_variants.id, variantId)).get() || null;
}

/**
 * Multi-Variant Comparison Matrix
 * Evaluates source run and all executed variants side-by-side using semantic diff.
 */
export function compareExperimentVariants(
  db: BetterSQLite3Database<typeof schema>,
  experimentId: string
): MultiVariantComparisonResult {
  const exp = db.select().from(experiments).where(eq(experiments.id, experimentId)).get();
  if (!exp) {
    throw new Error(`Experiment '${experimentId}' not found`);
  }

  const sourceRun = db.select().from(trace_runs).where(eq(trace_runs.id, exp.source_run_id)).get();
  if (!sourceRun) {
    throw new Error(`Source run '${exp.source_run_id}' not found`);
  }

  const sourceSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, sourceRun.id))
    .orderBy(asc(trace_spans.created_at))
    .all();

  const sourceStart = sourceSpans[0]?.created_at || sourceRun.created_at;
  const sourceEnd = sourceSpans.reduce(
    (max, s) => Math.max(max, s.created_at + (s.latency_ms || 0)),
    sourceStart
  );
  const sourceDurationMs = Math.max(1, sourceEnd - sourceStart);

  const variants = db
    .select()
    .from(experiment_variants)
    .where(eq(experiment_variants.experiment_id, experimentId))
    .orderBy(asc(experiment_variants.created_at))
    .all();

  const scorecard: MultiVariantScorecardItem[] = [];
  const diffsAgainstSource: Record<string, any> = {};

  for (const v of variants) {
    let mutations: ExperimentMutation[] = [];
    try {
      mutations = JSON.parse(v.mutations || '[]');
    } catch {}

    if (!v.replay_run_id || v.status !== 'completed') {
      scorecard.push({
        variantId: v.id,
        variantName: v.name,
        status: v.status as ExperimentStatus,
        replayRunId: v.replay_run_id,
        costUsd: 0,
        costSavingsPercent: 0,
        costDeltaUsd: 0,
        durationMs: 0,
        durationDeltaMs: 0,
        tokenCount: 0,
        tokenDelta: 0,
        spanCount: 0,
        mutationCount: mutations.length,
        mutations,
        cacheHitPercent: 0,
        criticalPathDurationMs: 0,
        slowestToolName: null
      });
      continue;
    }

    const replayedRun = db.select().from(trace_runs).where(eq(trace_runs.id, v.replay_run_id)).get();
    const replayedSpans = db
      .select()
      .from(trace_spans)
      .where(eq(trace_spans.run_id, v.replay_run_id))
      .orderBy(asc(trace_spans.created_at))
      .all();

    const repStart = replayedSpans[0]?.created_at || replayedRun?.created_at || 0;
    const repEnd = replayedSpans.reduce(
      (max, s) => Math.max(max, s.created_at + (s.latency_ms || 0)),
      repStart
    );
    const repDurationMs = Math.max(0, repEnd - repStart);

    // Compute pairwise diff against source
    const diff = computeRunDiff(db, sourceRun.id, v.replay_run_id);
    if (diff) {
      diffsAgainstSource[v.id] = diff;
    }

    // Critical path analysis
    const cp = deriveCriticalPathIntelligence(replayedSpans);
    // Tool chain analysis
    const tools = deriveToolChainIntelligence(replayedSpans);
    const slowestTool = tools.length > 0
      ? [...tools].sort((a, b) => b.totalDurationMs - a.totalDurationMs)[0].toolName
      : null;

    const vCost = replayedRun?.total_cost_usd ?? 0;
    const vTokens = replayedRun?.total_tokens ?? 0;
    const costDelta = vCost - sourceRun.total_cost_usd;
    const tokenDelta = vTokens - sourceRun.total_tokens;
    const durationDelta = repDurationMs - sourceDurationMs;

    const costSavingsPercent = sourceRun.total_cost_usd > 0
      ? Number((((sourceRun.total_cost_usd - vCost) / sourceRun.total_cost_usd) * 100).toFixed(2))
      : 0;

    const cacheHits = replayedSpans.filter((s) => s.cache_hit === 1).length;
    const cacheHitPercent = replayedSpans.length > 0
      ? Number(((cacheHits / replayedSpans.length) * 100).toFixed(1))
      : 0;

    scorecard.push({
      variantId: v.id,
      variantName: v.name,
      status: v.status as ExperimentStatus,
      replayRunId: v.replay_run_id,
      costUsd: Number(vCost.toFixed(6)),
      costSavingsPercent,
      costDeltaUsd: Number(costDelta.toFixed(6)),
      durationMs: repDurationMs,
      durationDeltaMs: durationDelta,
      tokenCount: vTokens,
      tokenDelta,
      spanCount: replayedSpans.length,
      mutationCount: mutations.length,
      mutations,
      cacheHitPercent,
      criticalPathDurationMs: cp.durationMs,
      slowestToolName: slowestTool
    });
  }

  return {
    experimentId: exp.id,
    experimentName: exp.name,
    sourceRun: {
      id: sourceRun.id,
      name: sourceRun.name,
      costUsd: sourceRun.total_cost_usd,
      durationMs: sourceDurationMs,
      tokenCount: sourceRun.total_tokens,
      spanCount: sourceSpans.length
    },
    scorecard,
    diffsAgainstSource
  };
}

/**
 * Persistent Replay History across all executed experiment variants
 */
export function getReplayHistory(
  db: BetterSQLite3Database<typeof schema>,
  limit: number = 50
): ReplayHistoryItem[] {
  const executedVariants = db
    .select()
    .from(experiment_variants)
    .where(eq(experiment_variants.status, 'completed'))
    .orderBy(desc(experiment_variants.completed_at))
    .limit(limit)
    .all();

  if (executedVariants.length === 0) return [];

  const expIds = [...new Set(executedVariants.map((v) => v.experiment_id))];
  const allExp = db.select().from(experiments).where(inArray(experiments.id, expIds)).all();
  const expMap = new Map<string, Experiment>();
  for (const e of allExp) expMap.set(e.id, e);

  const runIds = executedVariants.map((v) => v.replay_run_id).filter(Boolean) as string[];
  const allRuns = runIds.length > 0
    ? db.select().from(trace_runs).where(inArray(trace_runs.id, runIds)).all()
    : [];
  const runMap = new Map<string, TraceRun>();
  for (const r of allRuns) runMap.set(r.id, r);

  return executedVariants.map((v) => {
    const exp = expMap.get(v.experiment_id);
    const rRun = v.replay_run_id ? runMap.get(v.replay_run_id) : null;
    let mutationsCount = 0;
    try {
      mutationsCount = JSON.parse(v.mutations || '[]').length;
    } catch {}

    return {
      id: `hist_${v.id}`,
      variantId: v.id,
      variantName: v.name,
      experimentId: v.experiment_id,
      experimentName: exp?.name || 'Experiment',
      sourceRunId: v.source_run_id,
      replayRunId: v.replay_run_id || '',
      status: v.status as ExperimentStatus,
      durationMs: 0, // Enriched if needed
      costUsd: rRun?.total_cost_usd || 0.0,
      tokens: rRun?.total_tokens || 0,
      mutationsCount,
      timestamp: v.completed_at || v.created_at
    };
  });
}
