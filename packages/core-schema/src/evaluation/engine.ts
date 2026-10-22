/**
 * AetherTrace — Master Evaluation & Optimization Engine (Phase 13)
 */

import { eq, desc, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema.js';
import {
  evaluations,
  trace_runs,
  trace_spans,
  experiments,
  experiment_variants,
  type Evaluation,
  type TraceRun,
  type TraceSpan
} from '../schema.js';
import type {
  EvaluationReport,
  EvaluationTargetType,
  EvaluationStatus,
  AssertionRule,
  AssertionResult,
  RegressionSummary
} from './types.js';
import { extractEvaluationMetrics } from './metrics.js';
import { evaluateAssertion } from './assertions.js';
import { analyzeFailures } from './failures.js';
import { clusterErrors } from './clustering.js';
import { analyzeRootCauses } from './root-cause.js';
import { detectOptimizationSignals } from './optimization.js';
import { evaluateRegression } from './regression.js';
import { analyzeExecutionIntelligence } from '../intelligence/engine.js';

export interface RunEvaluationParams {
  targetType: EvaluationTargetType;
  targetId: string;
  name?: string;
  description?: string | null;
  rules?: (string | AssertionRule)[];
  baselineRunId?: string | null;
}

/**
 * Executes a deterministic evaluation against a Run, Experiment, or Variant.
 */
export async function runEvaluation(
  db: BetterSQLite3Database<typeof schema>,
  params: RunEvaluationParams
): Promise<EvaluationReport> {
  const now = Date.now();
  const evaluationId = `eval_${randomUUID()}`;

  let targetRun: TraceRun | null = null;
  let targetSpans: TraceSpan[] = [];
  let baselineRun: TraceRun | null = null;
  let baselineSpans: TraceSpan[] = [];
  let targetName = params.name;

  // 1. Resolve Target Data
  if (params.targetType === 'run') {
    targetRun = db.select().from(trace_runs).where(eq(trace_runs.id, params.targetId)).get() || null;
    if (!targetRun) {
      throw new Error(`Target run '${params.targetId}' not found`);
    }
    targetSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, params.targetId)).orderBy(asc(trace_spans.created_at)).all();
    targetName = targetName || `Evaluation of ${targetRun.name}`;

    // If target run is a fork/replay and baselineRunId is not specified, attempt to infer from parent_run_id
    const baseId = params.baselineRunId || targetRun.parent_run_id;
    if (baseId) {
      baselineRun = db.select().from(trace_runs).where(eq(trace_runs.id, baseId)).get() || null;
      if (baselineRun) {
        baselineSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, baseId)).orderBy(asc(trace_spans.created_at)).all();
      }
    }
  } else if (params.targetType === 'variant') {
    const variant = db.select().from(experiment_variants).where(eq(experiment_variants.id, params.targetId)).get();
    if (!variant) {
      throw new Error(`Target variant '${params.targetId}' not found`);
    }
    const replayId = variant.replay_run_id;
    if (!replayId) {
      throw new Error(`Variant '${params.targetId}' has not been replayed yet (status: ${variant.status})`);
    }
    targetRun = db.select().from(trace_runs).where(eq(trace_runs.id, replayId)).get() || null;
    if (!targetRun) {
      throw new Error(`Replay run '${replayId}' for variant '${variant.name}' not found`);
    }
    targetSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, replayId)).orderBy(asc(trace_spans.created_at)).all();
    targetName = targetName || `Variant Evaluation: ${variant.name}`;

    // Baseline is the source run of the experiment variant
    const sourceRunId = variant.source_run_id;
    if (sourceRunId) {
      baselineRun = db.select().from(trace_runs).where(eq(trace_runs.id, sourceRunId)).get() || null;
      if (baselineRun) {
        baselineSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, sourceRunId)).orderBy(asc(trace_spans.created_at)).all();
      }
    }
  } else if (params.targetType === 'experiment') {
    const exp = db.select().from(experiments).where(eq(experiments.id, params.targetId)).get();
    if (!exp) {
      throw new Error(`Target experiment '${params.targetId}' not found`);
    }
    targetName = targetName || `Experiment Evaluation: ${exp.name}`;

    // Evaluate the source run of the experiment as primary baseline
    targetRun = db.select().from(trace_runs).where(eq(trace_runs.id, exp.source_run_id)).get() || null;
    if (!targetRun) {
      throw new Error(`Experiment source run '${exp.source_run_id}' not found`);
    }
    targetSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, exp.source_run_id)).orderBy(asc(trace_spans.created_at)).all();
  } else {
    throw new Error(`Unsupported evaluation target type '${params.targetType}'`);
  }

  // 2. Default Rules if none provided
  const rulesToEvaluate: (string | AssertionRule)[] =
    params.rules && params.rules.length > 0
      ? params.rules
      : [
          'status == completed',
          'errors.count == 0',
          'retries.count <= 2',
          'cost <= 0.10',
          'duration <= 10000ms'
        ];

  // 3. Extract Execution Intelligence
  const intel = analyzeExecutionIntelligence(targetSpans, targetRun || undefined);

  // 4. Extract Evaluation Metrics
  const metrics = extractEvaluationMetrics(targetSpans, targetRun, baselineSpans, baselineRun, intel);

  // 5. Evaluate Deterministic Assertions
  const assertionResults: AssertionResult[] = [];
  for (const r of rulesToEvaluate) {
    try {
      const res = evaluateAssertion(r, metrics, targetSpans);
      assertionResults.push(res);
    } catch (err: any) {
      assertionResults.push({
        id: `err_${randomUUID().slice(0, 8)}`,
        name: typeof r === 'string' ? r : r.name || 'Assertion Error',
        expression: typeof r === 'string' ? r : r.expression || '',
        status: 'failed',
        expected: 'valid expression',
        actual: err.message,
        operator: '==',
        field: 'error',
        message: `Evaluation error: ${err.message}`
      });
    }
  }

  // 6. Structured Failure Analysis
  const failures = analyzeFailures(assertionResults, targetSpans, intel, targetRun?.id || params.targetId);

  // 7. Deterministic Error Clustering
  const errorClusters = clusterErrors(targetSpans);

  // 8. Causal Root-Cause Analysis
  const rootCauses = analyzeRootCauses(targetSpans, intel);

  // 9. Optimization Signals
  const optimizationSignals = detectOptimizationSignals(metrics, intel, targetSpans);

  // 10. Optional Regression Evaluation
  let regression: RegressionSummary | null = null;
  if (baselineRun && baselineSpans.length > 0) {
    regression = evaluateRegression(baselineRun, targetRun!, baselineSpans, targetSpans);
  }

  // 11. Compile Transparent Score
  const assertionsTotal = assertionResults.length;
  const assertionsPassed = assertionResults.filter((a) => a.status === 'passed').length;
  const assertionsFailed = assertionsTotal - assertionsPassed;
  const passPercentage = assertionsTotal > 0 ? (assertionsPassed / assertionsTotal) * 100 : 100;
  const criticalFailures = failures.filter((f) => f.severity === 'critical').length;

  const evaluationStatus: EvaluationStatus =
    assertionsFailed === 0 ? 'passed' : 'failed';

  const report: EvaluationReport = {
    id: evaluationId,
    name: targetName || 'Evaluation Report',
    description: params.description || null,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: targetRun?.name,
    status: evaluationStatus,
    score: {
      assertionsTotal,
      assertionsPassed,
      assertionsFailed,
      passPercentage,
      criticalFailures
    },
    metrics,
    assertions: assertionResults,
    failures,
    errorClusters,
    rootCauses,
    optimizationSignals,
    regression,
    createdAt: now,
    completedAt: Date.now()
  };

  // 12. Persist to SQLite
  const evalRow: Evaluation = {
    id: evaluationId,
    name: report.name,
    description: report.description || null,
    target_type: report.targetType,
    target_id: report.targetId,
    status: report.status,
    assertions_total: assertionsTotal,
    assertions_passed: assertionsPassed,
    assertions_failed: assertionsFailed,
    metrics: JSON.stringify(metrics),
    assertions: JSON.stringify(assertionResults),
    failures: JSON.stringify(failures),
    error_clusters: JSON.stringify(errorClusters),
    root_causes: JSON.stringify(rootCauses),
    optimization_signals: JSON.stringify(optimizationSignals),
    regression: regression ? JSON.stringify(regression) : null,
    created_at: now,
    completed_at: report.completedAt
  };

  db.insert(evaluations).values(evalRow).run();

  return report;
}

/**
 * Retrieves a saved evaluation report by its ID.
 */
export function getEvaluation(
  db: BetterSQLite3Database<typeof schema>,
  evaluationId: string
): EvaluationReport | null {
  const row = db.select().from(evaluations).where(eq(evaluations.id, evaluationId)).get();
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetType: row.target_type as EvaluationTargetType,
    targetId: row.target_id,
    status: row.status as EvaluationStatus,
    score: {
      assertionsTotal: row.assertions_total,
      assertionsPassed: row.assertions_passed,
      assertionsFailed: row.assertions_failed,
      passPercentage: row.assertions_total > 0 ? (row.assertions_passed / row.assertions_total) * 100 : 100,
      criticalFailures: 0
    },
    metrics: JSON.parse(row.metrics || '{}'),
    assertions: JSON.parse(row.assertions || '[]'),
    failures: JSON.parse(row.failures || '[]'),
    errorClusters: JSON.parse(row.error_clusters || '[]'),
    rootCauses: JSON.parse(row.root_causes || '[]'),
    optimizationSignals: JSON.parse(row.optimization_signals || '[]'),
    regression: row.regression ? JSON.parse(row.regression) : null,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

/**
 * Lists evaluations with optional target filtering.
 */
export function listEvaluations(
  db: BetterSQLite3Database<typeof schema>,
  options: { targetType?: string; targetId?: string; limit?: number } = {}
): Evaluation[] {
  let query = db.select().from(evaluations);

  if (options.targetType && options.targetId) {
    return query
      .where(eq(evaluations.target_type, options.targetType as any))
      .orderBy(desc(evaluations.created_at))
      .limit(options.limit || 50)
      .all()
      .filter((e) => e.target_id === options.targetId);
  }

  return query.orderBy(desc(evaluations.created_at)).limit(options.limit || 50).all();
}

/**
 * Deletes an evaluation from the database.
 */
export function deleteEvaluation(
  db: BetterSQLite3Database<typeof schema>,
  evaluationId: string
): boolean {
  const res = db.delete(evaluations).where(eq(evaluations.id, evaluationId)).run();
  return res.changes > 0;
}
