/**
 * AetherTrace — Deterministic Optimization Signals Engine (Phase 13)
 */

import type { TraceSpan } from '../schema.js';
import type { EvaluationMetrics, OptimizationSignal } from './types.js';
import type { ExecutionIntelligence } from '../intelligence/types.js';

import { analyzeExecutionIntelligence } from '../intelligence/engine.js';

export function detectOptimizationSignals(
  metricsOrSpans: EvaluationMetrics | TraceSpan[],
  intelOrMetrics?: ExecutionIntelligence | EvaluationMetrics,
  spansOrNothing?: TraceSpan[]
): OptimizationSignal[] {
  let metrics: EvaluationMetrics;
  let intel: ExecutionIntelligence;
  let spans: TraceSpan[];

  if (Array.isArray(metricsOrSpans)) {
    spans = metricsOrSpans;
    metrics = intelOrMetrics as EvaluationMetrics;
    intel = analyzeExecutionIntelligence(spans);
  } else {
    metrics = metricsOrSpans;
    spans = spansOrNothing || [];
    intel = (intelOrMetrics && typeof intelOrMetrics === 'object' && 'criticalPath' in intelOrMetrics)
      ? (intelOrMetrics as ExecutionIntelligence)
      : analyzeExecutionIntelligence(spans);
  }

  const signals: OptimizationSignal[] = [];

  // 1. Cost Hotspots: Model Dominance
  const totalCost = metrics.cost.totalCostUsd;
  if (totalCost > 0) {
    for (const [model, modelSpend] of Object.entries(metrics.cost.byModel)) {
      const percentage = (modelSpend / totalCost) * 100;
      if (percentage >= 60 && modelSpend > 0.001) {
        // High model spend dominance
        const potentialSavings = modelSpend * 0.7; // ~70% savings typical for mini models
        signals.push({
          id: `opt_cost_${model.replace(/[^a-zA-Z0-9]/g, '_')}`,
          category: 'cost',
          title: `Model Spend Dominance (${model})`,
          description: `Model '${model}' accounts for ${percentage.toFixed(1)}% of total execution spend ($${modelSpend.toFixed(6)} of $${totalCost.toFixed(6)}).`,
          priority: percentage > 80 ? 'high' : 'medium',
          potentialSavingsUsd: potentialSavings,
          recommendation: `Evaluate substituting '${model}' with a smaller variant (e.g., 'gpt-4o-mini' or equivalent) for intermediate reasoning steps.`
        });
      }
    }
  }

  // 2. Latency Bottleneck: Critical Path Dominance
  if (intel.criticalPath.longestSpan && intel.criticalPath.durationMs > 0) {
    const longest = intel.criticalPath.longestSpan;
    if (longest.percentageOfCriticalPath >= 35 && longest.durationMs > 500) {
      signals.push({
        id: `opt_lat_${longest.spanId.slice(0, 8)}`,
        category: 'latency',
        title: `Critical Path Bottleneck (${longest.label})`,
        description: `Span '${longest.label}' accounts for ${longest.percentageOfCriticalPath}% of total critical path latency (${(longest.durationMs / 1000).toFixed(2)}s of ${(intel.criticalPath.durationMs / 1000).toFixed(2)}s).`,
        priority: longest.percentageOfCriticalPath > 60 ? 'high' : 'medium',
        potentialLatencySavingsMs: Math.round(longest.durationMs * 0.5),
        targetSpans: [longest.spanId],
        recommendation: `Optimize upstream prompts, stream responses earlier, or apply lower max_tokens to reduce generation latency.`
      });
    }
  }

  // 3. Retry Hotspots
  if (intel.retryChains.length > 0 || intel.failureHotspots.totalErrors > 0) {
    const retryCost = intel.failureHotspots.highestRetryCostUsd;
    const retryCount = metrics.reliability.retryCount;

    if (retryCount >= 2 || retryCost > 0.0005) {
      signals.push({
        id: `opt_retry_hotspot`,
        category: 'retry',
        title: `Retry Hotspot (${intel.failureHotspots.mostRetriedOperation || 'Operations'})`,
        description: `Detected ${retryCount} retried operation(s). Most retried: '${intel.failureHotspots.mostRetriedOperation || 'unknown'}'. Financial overhead: $${retryCost.toFixed(6)}.`,
        priority: retryCount >= 3 ? 'high' : 'medium',
        potentialSavingsUsd: retryCost,
        targetTool: intel.failureHotspots.mostFailedTool || undefined,
        recommendation: `Inspect tool argument schemas, improve error handling feedback in agent system prompts, or lower tool timeout ceilings.`
      });
    }
  }

  // 4. Token Hotspots: Prompt Bloat
  const totalTokens = metrics.tokens.totalTokens;
  if (totalTokens > 1000) {
    const promptRatio = metrics.tokens.promptTokens / totalTokens;
    if (promptRatio >= 0.85) {
      signals.push({
        id: `opt_token_prompt_bloat`,
        category: 'token',
        title: `Prompt Token Bloat (${(promptRatio * 100).toFixed(1)}% of total)`,
        description: `Input/prompt tokens account for ${(promptRatio * 100).toFixed(1)}% of total tokens (${metrics.tokens.promptTokens} of ${totalTokens}).`,
        priority: 'medium',
        recommendation: `Compress agent history, truncate previous tool outputs, or implement sliding context windowing.`
      });
    }
  }

  // 5. Parallelism Opportunities
  // Find sequential tool calls under the same agent that execute one after another without overlap
  for (const ag of intel.agents) {
    const agentSpans = spans.filter((s) => (s.agent_name || 'default-agent') === ag.agentName && s.span_type === 'tool_call');
    if (agentSpans.length >= 2) {
      // Check if they are executed sequentially
      let sequentialCount = 0;
      const candidates: string[] = [];
      for (let i = 0; i < agentSpans.length - 1; i++) {
        const currEnd = agentSpans[i].created_at + (agentSpans[i].latency_ms || 0);
        const nextStart = agentSpans[i + 1].created_at;
        if (nextStart >= currEnd && nextStart - currEnd < 1000) {
          sequentialCount++;
          candidates.push(agentSpans[i].id);
          candidates.push(agentSpans[i + 1].id);
        }
      }

      if (sequentialCount >= 1) {
        const uniqueSpans = Array.from(new Set(candidates));
        signals.push({
          id: `opt_parallel_${ag.agentName}`,
          category: 'parallelism',
          title: `Potential Parallelism in '${ag.agentName}'`,
          description: `Found ${uniqueSpans.length} sequential tool invocations that execute back-to-back. If tool calls have no mutual input dependencies, concurrent dispatch could reduce wall-clock time.`,
          priority: 'low',
          targetAgent: ag.agentName,
          targetSpans: uniqueSpans,
          recommendation: `Use Promise.all() or parallel tool call calling in ${ag.agentName} to execute independent tools concurrently.`
        });
      }
    }
  }

  return signals;
}
