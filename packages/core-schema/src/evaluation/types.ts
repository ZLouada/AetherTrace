/**
 * AetherTrace — Evaluation & Optimization Engine Domain Types (Phase 13)
 */

import type { RunDiffResult } from '../types.js';

export type EvaluationTargetType = 'run' | 'experiment' | 'variant';

export type EvaluationStatus = 'passed' | 'failed' | 'error';

export type AssertionOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists';

export interface AssertionRule {
  id?: string;
  name?: string;
  expression?: string;
  field?: string;
  operator?: AssertionOperator;
  expected?: any;
  description?: string;
}

export interface AssertionEvidence {
  spanIds?: string[];
  eventTypes?: string[];
  metric?: string;
  timestamp?: number;
  sampleText?: string;
}

export interface AssertionResult {
  id: string;
  name: string;
  expression: string;
  status: 'passed' | 'failed';
  expected: any;
  actual: any;
  operator: string;
  field: string;
  message: string;
  evidence?: AssertionEvidence;
}

export interface CostMetrics {
  totalCostUsd: number;
  modelCostUsd: number;
  cachedSavingsUsd: number;
  costDeltaUsd?: number;
  costDeltaPercent?: number;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
}

export interface LatencyMetrics {
  totalDurationMs: number;
  criticalPathMs: number;
  modelLatencyMs: number;
  toolLatencyMs: number;
  durationDeltaMs?: number;
  durationDeltaPercent?: number;
}

export interface TokenMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedTokens: number;
  reportedTokens: number;
  tokenDelta?: number;
}

export interface ReliabilityMetrics {
  errorCount: number;
  failedSpansCount: number;
  failureRate: number; // failedSpans / totalSpans
  retryCount: number;
  retryRate: number;
  breakersTrippedCount: number;
}

export interface ExecutionMetrics {
  spanCount: number;
  successSpansCount: number;
  agentCount: number;
  agentMaxDepth: number;
  toolCallCount: number;
  parallelBranchCount: number;
  byAgentCount: Record<string, number>;
  byToolCount: Record<string, number>;
}

export interface EvaluationMetrics {
  cost: CostMetrics;
  latency: LatencyMetrics;
  tokens: TokenMetrics;
  reliability: ReliabilityMetrics;
  execution: ExecutionMetrics;
  rawFieldMap: Record<string, any>;
}

export interface FailureItem {
  id: string;
  assertionId: string;
  assertionName: string;
  rule: string;
  actualValue: any;
  expectedValue: any;
  runId: string;
  spanIds: string[];
  eventTypes: string[];
  explanation: string;
  severity: 'critical' | 'warning';
}

export interface ErrorCluster {
  id: string;
  errorType: string;
  normalizedMessage: string;
  occurrences: number;
  affectedRuns: string[];
  affectedSpans: string[];
  affectedTools: string[];
  affectedModels: string[];
  earliestOccurrence: number;
  samplePayload?: any;
}

export interface RootCauseCandidate {
  id: string;
  candidateType: 'primary' | 'secondary' | 'contributing';
  spanId: string;
  agentName: string;
  spanType: string;
  eventType: string;
  errorSummary?: string;
  explanation: string;
  impact: {
    retryCount: number;
    delayMs: number;
    downstreamFailuresCount: number;
    costImpactUsd: number;
  };
  downstreamSpanIds: string[];
}

export interface OptimizationSignal {
  id: string;
  category: 'cost' | 'latency' | 'retry' | 'token' | 'parallelism';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  potentialSavingsUsd?: number;
  potentialLatencySavingsMs?: number;
  targetSpans?: string[];
  targetAgent?: string;
  targetTool?: string;
  recommendation: string;
}

export interface RegressionSummary {
  baselineRunId: string;
  targetRunId: string;
  costDeltaUsd: number;
  costDeltaPercent: number;
  durationDeltaMs: number;
  durationDeltaPercent: number;
  tokenDelta: number;
  errorDelta: number;
  diffSummary?: RunDiffResult['summary'];
}

export interface EvaluationReport {
  id: string;
  name: string;
  description?: string | null;
  targetType: EvaluationTargetType;
  targetId: string;
  targetName?: string;
  status: EvaluationStatus;
  score: {
    assertionsTotal: number;
    assertionsPassed: number;
    assertionsFailed: number;
    passPercentage: number;
    criticalFailures: number;
  };
  metrics: EvaluationMetrics;
  assertions: AssertionResult[];
  failures: FailureItem[];
  errorClusters: ErrorCluster[];
  rootCauses: RootCauseCandidate[];
  optimizationSignals: OptimizationSignal[];
  regression?: RegressionSummary | null;
  createdAt: number;
  completedAt: number;
}

export interface EvaluationRecord {
  id: string;
  name: string;
  description: string | null;
  target_type: EvaluationTargetType;
  target_id: string;
  status: EvaluationStatus;
  assertions_total: number;
  assertions_passed: number;
  assertions_failed: number;
  metrics: string;
  assertions: string;
  failures: string;
  error_clusters: string;
  root_causes: string;
  optimization_signals: string;
  regression: string | null;
  created_at: number;
  completed_at: number;
}
