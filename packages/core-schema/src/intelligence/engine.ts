import type { TraceRun, TraceSpan } from '../schema.js';
import type { ExecutionIntelligence } from './types.js';
import { deriveAgentIntelligence } from './agents.js';
import { deriveToolChainIntelligence } from './tools.js';
import { deriveParallelIntelligence } from './parallel.js';
import { deriveRetryIntelligence } from './retries.js';
import { deriveCriticalPathIntelligence } from './critical-path.js';
import { deriveCausalIntelligence } from './causality.js';

// In-memory cache for completed runs to avoid re-analyzing immutable execution data
const intelligenceCache = new Map<string, { runId: string; spanCount: number; intelligence: ExecutionIntelligence }>();
const MAX_CACHE_SIZE = 100;

/**
 * Top-level execution intelligence analyzer.
 * Deterministically turns raw execution traces into structured agent intelligence.
 * Highly optimized for large traces up to 10k+ spans.
 */
export function analyzeExecutionIntelligence(
  spans: TraceSpan[],
  run?: TraceRun
): ExecutionIntelligence {
  const runId = run?.id || spans[0]?.run_id || 'unknown_run';

  // Check cache if run is completed and span count matches
  if (run && (run.status === 'completed' || run.status === 'failed' || run.status === 'breaker_tripped')) {
    const cached = intelligenceCache.get(runId);
    if (cached && cached.spanCount === spans.length) {
      return cached.intelligence;
    }
  }

  // 1. Agents & Sub-Agents
  const { agents, agentHierarchy } = deriveAgentIntelligence(spans, run);

  // 2. Tool Chains
  const toolChains = deriveToolChainIntelligence(spans);

  // 3. Parallel Execution
  const parallelGroups = deriveParallelIntelligence(spans);

  // 4. Retry & Failure Chains
  const { retryChains, failureHotspots } = deriveRetryIntelligence(spans);

  // 5. Critical Path
  const criticalPath = deriveCriticalPathIntelligence(spans);

  // 6. Causal Relationships
  const causalRelations = deriveCausalIntelligence(spans);

  const intelligence: ExecutionIntelligence = {
    runId,
    analyzedAt: Date.now(),
    agents,
    agentHierarchy,
    toolChains,
    parallelGroups,
    retryChains,
    criticalPath,
    causalRelations,
    failureHotspots
  };

  // Cache if completed
  if (run && (run.status === 'completed' || run.status === 'failed' || run.status === 'breaker_tripped')) {
    if (intelligenceCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = intelligenceCache.keys().next().value;
      if (oldestKey) intelligenceCache.delete(oldestKey);
    }
    intelligenceCache.set(runId, { runId, spanCount: spans.length, intelligence });
  }

  return intelligence;
}

/**
 * Clears the intelligence cache (useful for test resets).
 */
export function clearIntelligenceCache(): void {
  intelligenceCache.clear();
}
