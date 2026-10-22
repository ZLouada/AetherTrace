/**
 * AetherTrace — Regression Evaluation Engine (Phase 13)
 */

import type { TraceRun, TraceSpan } from '../schema.js';
import type { RegressionSummary } from './types.js';
import { computeRunDiff } from '../diff.js';

export function evaluateRegression(
  baseRun: TraceRun,
  targetRun: TraceRun,
  baseSpans: TraceSpan[],
  targetSpans: TraceSpan[]
): RegressionSummary {
  const diff = computeRunDiff(baseRun.id, targetRun.id);

  const baseCost = baseRun.total_cost_usd || 0;
  const targetCost = targetRun.total_cost_usd || 0;
  const costDeltaUsd = targetCost - baseCost;
  const costDeltaPercent = baseCost > 0 ? (costDeltaUsd / baseCost) * 100 : 0;

  const baseEarliest = Math.min(...baseSpans.map((s) => s.created_at));
  const baseLatest = Math.max(...baseSpans.map((s) => s.created_at + (s.latency_ms || 0)));
  const baseDuration = Math.max(0, baseLatest - baseEarliest);

  const targetEarliest = Math.min(...targetSpans.map((s) => s.created_at));
  const targetLatest = Math.max(...targetSpans.map((s) => s.created_at + (s.latency_ms || 0)));
  const targetDuration = Math.max(0, targetLatest - targetEarliest);

  const durationDeltaMs = targetDuration - baseDuration;
  const durationDeltaPercent = baseDuration > 0 ? (durationDeltaMs / baseDuration) * 100 : 0;

  const baseTokens = baseRun.total_tokens || 0;
  const targetTokens = targetRun.total_tokens || 0;
  const tokenDelta = targetTokens - baseTokens;

  // Calculate error delta
  const baseErrors = baseSpans.filter((s) => s.span_type === 'guardrail_block' || (s.response_payload && /"error"/i.test(s.response_payload))).length;
  const targetErrors = targetSpans.filter((s) => s.span_type === 'guardrail_block' || (s.response_payload && /"error"/i.test(s.response_payload))).length;
  const errorDelta = targetErrors - baseErrors;

  return {
    baselineRunId: baseRun.id,
    targetRunId: targetRun.id,
    costDeltaUsd,
    costDeltaPercent,
    durationDeltaMs,
    durationDeltaPercent,
    tokenDelta,
    errorDelta,
    diffSummary: diff?.summary
  };
}

