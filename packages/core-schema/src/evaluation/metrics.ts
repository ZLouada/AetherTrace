/**
 * AetherTrace — Deterministic Metrics Extraction Engine (Phase 13)
 */

import type { TraceRun, TraceSpan } from '../schema.js';
import type { EvaluationMetrics } from './types.js';
import { analyzeExecutionIntelligence } from '../intelligence/engine.js';
import type { ExecutionIntelligence } from '../intelligence/types.js';

export function extractEvaluationMetrics(
  spans: TraceSpan[],
  run?: TraceRun | null,
  baselineSpans?: TraceSpan[] | null,
  baselineRun?: TraceRun | null,
  cachedIntelligence?: ExecutionIntelligence | null
): EvaluationMetrics {
  const intel = cachedIntelligence || analyzeExecutionIntelligence(spans, run || undefined);

  // 1. Cost Calculations
  let totalCostUsd = run?.total_cost_usd ?? 0;
  if (totalCostUsd === 0 && spans.length > 0) {
    totalCostUsd = spans.reduce((sum, s) => sum + (s.cost_usd || 0), 0);
  }

  const byModel: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  let modelCostUsd = 0;
  let cachedSavingsUsd = 0;

  for (const s of spans) {
    const cost = s.cost_usd || 0;
    if (s.model) {
      byModel[s.model] = (byModel[s.model] || 0) + cost;
    }
    const agent = s.agent_name || 'default-agent';
    byAgent[agent] = (byAgent[agent] || 0) + cost;

    if (s.span_type === 'llm_call') {
      modelCostUsd += cost;
    }
    if (s.cache_hit || s.execution_origin === 'cached_replay') {
      // Approximate theoretical cached savings
      cachedSavingsUsd += cost > 0 ? cost : 0.005;
    }
  }

  // Cost deltas if baseline is provided
  let costDeltaUsd: number | undefined;
  let costDeltaPercent: number | undefined;
  if (baselineRun || (baselineSpans && baselineSpans.length > 0)) {
    const baseCost = baselineRun?.total_cost_usd ?? baselineSpans!.reduce((sum, s) => sum + (s.cost_usd || 0), 0);
    costDeltaUsd = totalCostUsd - baseCost;
    costDeltaPercent = baseCost > 0 ? (costDeltaUsd / baseCost) * 100 : 0;
  }

  // 2. Latency Calculations
  let totalDurationMs = 0;
  let modelLatencyMs = 0;
  let toolLatencyMs = 0;

  if (spans.length > 0) {
    const earliestStart = Math.min(...spans.map((s) => s.created_at));
    const latestEnd = Math.max(...spans.map((s) => s.created_at + (s.latency_ms || 0)));
    totalDurationMs = Math.max(0, latestEnd - earliestStart);

    for (const s of spans) {
      const lat = s.latency_ms || 0;
      if (s.span_type === 'llm_call') modelLatencyMs += lat;
      if (s.span_type === 'tool_call') toolLatencyMs += lat;
    }
  }

  const criticalPathMs = intel.criticalPath.durationMs;

  let durationDeltaMs: number | undefined;
  let durationDeltaPercent: number | undefined;
  if (baselineSpans && baselineSpans.length > 0) {
    const baseEarliest = Math.min(...baselineSpans.map((s) => s.created_at));
    const baseLatest = Math.max(...baselineSpans.map((s) => s.created_at + (s.latency_ms || 0)));
    const baseDuration = Math.max(0, baseLatest - baseEarliest);
    durationDeltaMs = totalDurationMs - baseDuration;
    durationDeltaPercent = baseDuration > 0 ? (durationDeltaMs / baseDuration) * 100 : 0;
  }

  // 3. Token Calculations
  let totalTokens = run?.total_tokens ?? 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedTokens = 0;
  let reportedTokens = 0;

  for (const s of spans) {
    const pTok = s.prompt_tokens || 0;
    const cTok = s.completion_tokens || 0;
    promptTokens += pTok;
    completionTokens += cTok;

    if (s.usage_status === 'estimated') {
      estimatedTokens += pTok + cTok;
    } else {
      reportedTokens += pTok + cTok;
    }
  }

  if (totalTokens === 0) {
    totalTokens = promptTokens + completionTokens;
  }

  let tokenDelta: number | undefined;
  if (baselineRun || (baselineSpans && baselineSpans.length > 0)) {
    const baseTokens = baselineRun?.total_tokens ?? baselineSpans!.reduce((sum, s) => sum + (s.prompt_tokens || 0) + (s.completion_tokens || 0), 0);
    tokenDelta = totalTokens - baseTokens;
  }

  // 4. Reliability Calculations
  let errorCount = 0;
  let failedSpansCount = 0;
  let breakersTrippedCount = 0;

  for (const s of spans) {
    const isError =
      s.span_type === 'guardrail_block' ||
      (s.response_payload && /"error"/i.test(s.response_payload)) ||
      (s.response_payload && /"statusCode":\s*[45][0-9]{2}/i.test(s.response_payload));

    if (isError) {
      errorCount++;
      failedSpansCount++;
    }
    if (s.span_type === 'guardrail_block' || (run?.status === 'breaker_tripped')) {
      breakersTrippedCount++;
    }
  }

  // Include errors discovered by intelligence failure hotspots
  if (intel.failureHotspots.totalErrors > errorCount) {
    errorCount = intel.failureHotspots.totalErrors;
  }

  const failureRate = spans.length > 0 ? failedSpansCount / spans.length : 0;
  const retryCount = intel.retryChains.reduce((sum, r) => sum + r.attempts.length - 1, 0);
  const retryRate = spans.length > 0 ? retryCount / spans.length : 0;

  // 5. Execution Metrics
  const byAgentCount: Record<string, number> = {};
  const byToolCount: Record<string, number> = {};
  let toolCallCount = 0;

  for (const s of spans) {
    const agent = s.agent_name || 'default-agent';
    byAgentCount[agent] = (byAgentCount[agent] || 0) + 1;

    if (s.span_type === 'tool_call') {
      toolCallCount++;
      let toolName = 'unknown_tool';
      try {
        const payload = JSON.parse(s.request_payload || '{}');
        toolName = payload.tool_name || payload.function?.name || payload.name || s.model || 'tool';
      } catch {}
      byToolCount[toolName] = (byToolCount[toolName] || 0) + 1;
    }
  }

  const successSpansCount = spans.length - failedSpansCount;
  const agentCount = intel.agents.length;
  const agentMaxDepth = intel.agents.reduce((max, a) => Math.max(max, a.depth), 0);
  const parallelBranchCount = intel.parallelGroups.reduce((sum, p) => sum + p.branchCount, 0);

  // 6. Build Raw Field Map for Fast Zero-Eval Property Lookup
  const rawFieldMap: Record<string, any> = {
    // Status
    'status': run?.status || 'completed',

    // Cost
    'cost.totalCostUsd': totalCostUsd,
    'cost.modelCostUsd': modelCostUsd,
    'cost.cachedSavingsUsd': cachedSavingsUsd,
    'cost.costDeltaUsd': costDeltaUsd ?? 0,
    'cost.costDeltaPercent': costDeltaPercent ?? 0,

    // Latency
    'latency.totalDurationMs': totalDurationMs,
    'latency.criticalPathMs': criticalPathMs,
    'latency.modelLatencyMs': modelLatencyMs,
    'latency.toolLatencyMs': toolLatencyMs,
    'latency.durationDeltaMs': durationDeltaMs ?? 0,
    'latency.durationDeltaPercent': durationDeltaPercent ?? 0,

    // Tokens
    'tokens.totalTokens': totalTokens,
    'tokens.promptTokens': promptTokens,
    'tokens.completionTokens': completionTokens,
    'tokens.estimatedTokens': estimatedTokens,
    'tokens.reportedTokens': reportedTokens,
    'tokens.tokenDelta': tokenDelta ?? 0,

    // Reliability
    'reliability.errorCount': errorCount,
    'reliability.failedSpansCount': failedSpansCount,
    'reliability.failureRate': failureRate,
    'reliability.retryCount': retryCount,
    'reliability.retryRate': retryRate,
    'reliability.breakersTrippedCount': breakersTrippedCount,

    // Execution
    'execution.spanCount': spans.length,
    'execution.successSpansCount': successSpansCount,
    'execution.agentCount': agentCount,
    'execution.agentMaxDepth': agentMaxDepth,
    'execution.toolCallCount': toolCallCount,
    'execution.parallelBranchCount': parallelBranchCount
  };

  // Add byToolCount paths
  for (const [tool, count] of Object.entries(byToolCount)) {
    rawFieldMap[`execution.byToolCount.${tool}`] = count;
  }

  // Add byAgentCount paths
  for (const [agent, count] of Object.entries(byAgentCount)) {
    rawFieldMap[`execution.byAgentCount.${agent}`] = count;
  }

  return {
    cost: {
      totalCostUsd,
      modelCostUsd,
      cachedSavingsUsd,
      costDeltaUsd,
      costDeltaPercent,
      byModel,
      byAgent
    },
    latency: {
      totalDurationMs,
      criticalPathMs,
      modelLatencyMs,
      toolLatencyMs,
      durationDeltaMs,
      durationDeltaPercent
    },
    tokens: {
      totalTokens,
      promptTokens,
      completionTokens,
      estimatedTokens,
      reportedTokens,
      tokenDelta
    },
    reliability: {
      errorCount,
      failedSpansCount,
      failureRate,
      retryCount,
      retryRate,
      breakersTrippedCount
    },
    execution: {
      spanCount: spans.length,
      successSpansCount,
      agentCount,
      agentMaxDepth,
      toolCallCount,
      parallelBranchCount,
      byAgentCount,
      byToolCount
    },
    rawFieldMap
  };
}
