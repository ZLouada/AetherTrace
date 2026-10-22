import type { TraceRun, TraceSpan } from '../schema.js';

export interface AgentSummary {
  agentName: string;
  parentAgentName: string | null;
  depth: number;
  spanCount: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'running' | 'paused';
  startTime: number;
  endTime: number;
  childAgentCount: number;
  toolCallCount: number;
  llmCallCount: number;
  retryCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
  spanIds: string[];
}

export interface AgentHierarchyNode {
  agent: AgentSummary;
  children: AgentHierarchyNode[];
}

export interface ToolChainStep {
  spanId: string;
  toolName: string;
  arguments: any;
  result: any;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  isRetry: boolean;
  attempt?: number;
}

export interface ToolChain {
  id: string;
  agentName: string;
  toolName: string;
  spanIds: string[];
  steps: ToolChainStep[];
  totalDurationMs: number;
  finalStatus: 'success' | 'error';
  retryCount: number;
  hasFailures: boolean;
}

export interface ParallelBranch {
  branchIndex: number;
  rootSpanId: string;
  agentName: string;
  spanIds: string[];
  durationMs: number;
  startTime: number;
  endTime: number;
  status: 'completed' | 'failed' | 'running';
}

export interface ParallelGroup {
  id: string;
  parentSpanId: string | null;
  branches: ParallelBranch[];
  branchCount: number;
  totalSpanCount: number;
  wallClockDurationMs: number;
  longestBranchDurationMs: number;
  shortestBranchDurationMs: number;
  slowestBranchIndex: number;
  synchronizationSpanId?: string | null;
}

export interface RetryAttempt {
  spanId: string;
  attempt: number;
  durationMs: number;
  status: 'success' | 'error';
  costUsd: number;
  errorReason?: string;
}

export interface IntelligentRetryChain {
  id: string;
  originalSpanId: string;
  operationName: string;
  agentName: string;
  attempts: RetryAttempt[];
  retryCount: number;
  failedAttemptsCount: number;
  successfulAttemptIndex?: number;
  totalRetryDurationMs: number;
  totalRetryCostUsd: number;
  finalStatus: 'success' | 'failed';
}

export interface CriticalPathSpan {
  spanId: string;
  agentName: string;
  spanType: string;
  label: string;
  startTime: number;
  durationMs: number;
  percentageOfCriticalPath: number;
}

export interface CriticalPathAnalysis {
  durationMs: number;
  runDurationMs: number;
  coveragePercentage: number;
  spanIds: string[];
  spans: CriticalPathSpan[];
  longestSpan: CriticalPathSpan | null;
}

export type CausalRelationType =
  | 'child_of'
  | 'caused_by'
  | 'depends_on'
  | 'retry_of'
  | 'continues'
  | 'parallel_with'
  | 'synchronizes_with';

export type CausalClass = 'CAUSAL' | 'TEMPORAL' | 'STRUCTURAL';

export interface CausalRelation {
  sourceSpanId: string;
  targetSpanId: string;
  relationType: CausalRelationType;
  classification: CausalClass;
  explanation: string;
}

export interface FailureHotspots {
  mostRetriedOperation: string | null;
  mostFailedTool: string | null;
  longestRetryChainCount: number;
  highestRetryCostUsd: number;
  totalErrors: number;
}

export interface ExecutionIntelligence {
  runId: string;
  analyzedAt: number;
  agents: AgentSummary[];
  agentHierarchy: AgentHierarchyNode[];
  toolChains: ToolChain[];
  parallelGroups: ParallelGroup[];
  retryChains: IntelligentRetryChain[];
  criticalPath: CriticalPathAnalysis;
  causalRelations: CausalRelation[];
  failureHotspots: FailureHotspots;
}
