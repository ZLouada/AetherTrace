/**
 * Resolves the base URL for the AetherTrace API.
 * In server-side runtime functions, uses the PROXY_SERVER_URL service binding injected by Vercel.
 * In browser runtime, uses NEXT_PUBLIC_API_URL or defaults to the current window origin
 * (or localhost:4000 fallback).
 */
export function getApiBase(): string {
  if (typeof window === 'undefined') {
    return (process.env.PROXY_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return window.location.origin;
}

export function getWsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://localhost:4000/ws';
}

export function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): URL {
  const base = getApiBase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(cleanPath, base);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val));
      }
    }
  }
  return url;
}

export const API_BASE = typeof window === 'undefined'
  ? (process.env.PROXY_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
  : (process.env.NEXT_PUBLIC_API_URL || '');
export const WS_BASE = getWsBase();

export interface TraceRun {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'breaker_tripped';
  total_tokens: number;
  total_cost_usd: number;
  parent_run_id: string | null;
  forked_at_span_id: string | null;
  mutations?: string | null;
  provenance?: string | null;
  created_at: number;
}

export interface TraceSpan {
  id: string;
  run_id: string;
  parent_span_id: string | null;
  span_type:
    | 'llm_call'
    | 'tool_call'
    | 'agent_state'
    | 'guardrail_block'
    | 'http_call'
    | 'user_input'
    | 'system_event'
    | 'retry';
  agent_name: string;
  model: string | null;
  request_payload: string | null;
  response_payload: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  cache_hit: number;
  execution_origin?: 'original' | 'cached_replay' | 'new_execution' | 'modified' | 'mocked';
  source_span_id?: string | null;
  usage_status?: 'reported' | 'estimated' | 'unavailable';
  request_hash: string;
  created_at: number;
}


export interface GlobalStats {
  runs: {
    total: number;
    totalCostUsd: number;
    totalTokens: number;
  };
  spans: {
    total: number;
    cachedCount: number;
    cacheHitRate: number;
    avgLatencyMs: number;
  };
}

export async function fetchRuns(status?: string): Promise<TraceRun[]> {
  const url = buildUrl('/api/runs', status ? { status } : undefined);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.statusText}`);
  const data = await res.json();
  return data.runs || [];
}

export async function fetchRun(runId: string): Promise<TraceRun> {
  const res = await fetch(buildUrl(`/api/runs/${runId}`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch run ${runId}`);
  const data = await res.json();
  return data.run;
}

export async function fetchRunSpans(runId: string): Promise<{ run: TraceRun; spans: TraceSpan[] }> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/spans`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch spans for run ${runId}`);
  const data = await res.json();
  return { run: data.run, spans: data.spans || [] };
}

export async function fetchStats(): Promise<GlobalStats> {
  const res = await fetch(buildUrl('/api/stats').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function forkSpan(spanId: string, body: { new_run_name?: string; reason?: string }): Promise<{ newRunId: string }> {
  const res = await fetch(buildUrl(`/api/spans/${spanId}/fork`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Fork failed: ${res.statusText}`);
  return res.json();
}

export async function replaySpan(spanId: string, body: { new_run_name?: string } = {}): Promise<{ newRunId: string }> {
  const res = await fetch(buildUrl(`/api/spans/${spanId}/replay`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Replay failed: ${res.statusText}`);
  return res.json();
}

export async function pauseRun(runId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/pause`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Pause failed: ${res.statusText}`);
  return res.json();
}

export async function resumeRun(runId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/resume`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Resume failed: ${res.statusText}`);
  return res.json();
}

export async function postChatCompletion(payload: any, customHeaders: Record<string, string> = {}): Promise<any> {
  const res = await fetch(buildUrl('/v1/chat/completions').toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function exportRun(runId: string): Promise<any> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/export`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to export run ${runId}`);
  const bundle = await res.json();

  if (typeof window !== 'undefined') {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run_${runId}.trace.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return bundle;
}

export async function importRun(bundle: any): Promise<{ success: boolean; runId: string; spanCount: number; run: TraceRun }> {
  const res = await fetch(buildUrl('/api/runs/import').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to import trace`);
  }
  return res.json();
}

// --- Phase 4: Breakpoints & Chaos Engineering API ---

export interface BreakpointCondition {
  id?: string;
  name?: string;
  enabled?: boolean;
  target?: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'greater_than' | 'less_than' | 'exists';
  value?: any;
}

export interface BreakpointConfig {
  enabled: boolean;
  matchAgentNames: string[];
  matchModels: string[];
  conditions?: BreakpointCondition[];
}

export interface PendingBreakpoint {
  spanId: string;
  runId: string;
  agentName: string;
  model: string;
  spanType?: string;
  requestPayload: any;
  createdAt: number;
}

export interface BreakpointResolution {
  action: 'resume' | 'mock' | 'abort';
  modifiedPayload?: any;
  mockedResponse?: string;
  reason?: string;
}

export interface ChaosConfig {
  enabled: boolean;
  latencySpikeMs: number;
  rateLimitErrorRate: number;
  upstream500ErrorRate: number;
  malformedJsonRate: number;
}

export async function fetchBreakpoints(): Promise<{ config: BreakpointConfig; pending: PendingBreakpoint[] }> {
  const res = await fetch(buildUrl('/api/breakpoints').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch breakpoints');
  return res.json();
}

export async function updateBreakpointConfig(config: Partial<BreakpointConfig>): Promise<{ success: boolean; config: BreakpointConfig }> {
  const res = await fetch(buildUrl('/api/breakpoints/config').toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error('Failed to update breakpoint config');
  return res.json();
}

export async function addBreakpointCondition(condition: BreakpointCondition): Promise<{ success: boolean; condition: BreakpointCondition; config: BreakpointConfig }> {
  const res = await fetch(buildUrl('/api/breakpoints/conditions').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(condition)
  });
  if (!res.ok) throw new Error('Failed to add condition');
  return res.json();
}

export async function deleteBreakpointCondition(id: string): Promise<{ success: boolean; id: string; config: BreakpointConfig }> {
  const res = await fetch(buildUrl(`/api/breakpoints/conditions/${id}`).toString(), {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete condition');
  return res.json();
}

export async function toggleBreakpointCondition(id: string, enabled?: boolean): Promise<{ success: boolean; id: string; config: BreakpointConfig }> {
  const res = await fetch(buildUrl(`/api/breakpoints/conditions/${id}/toggle`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  if (!res.ok) throw new Error('Failed to toggle condition');
  return res.json();
}


export async function resolveBreakpoint(
  spanId: string,
  resolution: BreakpointResolution
): Promise<{ success: boolean; spanId: string; action: string }> {
  const res = await fetch(buildUrl(`/api/breakpoints/${spanId}/resolve`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resolution)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to resolve breakpoint`);
  }
  return res.json();
}

export async function fetchChaosConfig(): Promise<{ config: ChaosConfig }> {
  const res = await fetch(buildUrl('/api/chaos/config').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch chaos config');
  return res.json();
}

export async function updateChaosConfig(config: Partial<ChaosConfig>): Promise<{ success: boolean; config: ChaosConfig }> {
  const res = await fetch(buildUrl('/api/chaos/config').toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error('Failed to update chaos config');
  return res.json();
}

// --- Phase 5: Run Diffing & Model Comparison API ---

export type SpanDiffClassification =
  | 'identical_cached'
  | 'modified_fork'
  | 'modified'
  | 'inserted'
  | 'removed'
  | 'diverged_downstream';

export interface SpanDiffItem {
  stepIndex: number;
  status: SpanDiffClassification;
  agentName: string;
  baseSpan: TraceSpan | null;
  targetSpan: TraceSpan | null;
  deltas: {
    costDeltaUsd: number;
    costSavingsPercent: number;
    tokenDelta: number;
    latencyDeltaMs: number;
    modelChanged: boolean;
    promptChanged: boolean;
  };
}

export interface RunDiffSummary {
  baseRunId: string;
  baseRunName: string;
  targetRunId: string;
  targetRunName: string;
  baseCostUsd: number;
  targetCostUsd: number;
  costDeltaUsd: number;
  costSavingsPercent: number;
  baseTokens: number;
  targetTokens: number;
  tokenDelta: number;
  baseLatencyMs: number;
  targetLatencyMs: number;
  latencyDeltaMs: number;
  identicalStepsCount: number;
  divergedStepsCount: number;
}

export interface GitProvenance {
  repository_root?: string;
  commit_sha?: string;
  short_sha?: string;
  branch?: string | null;
  dirty: boolean;
  detached_head: boolean;
  git_version?: string;
  source_fingerprint?: string;
}

export interface EnvironmentProvenance {
  os: string;
  architecture: string;
  runtime: {
    name: string;
    version: string;
  };
  aethertrace_version?: string;
  package_manager?: string;
}

export interface DependencyProvenance {
  lockfile_type: string;
  lockfile_fingerprint?: string;
  lockfile_path?: string;
}

export interface RunProvenance {
  git?: GitProvenance | null;
  environment?: EnvironmentProvenance | null;
  dependencies?: DependencyProvenance | null;
  reproducibility?: {
    status:
      | 'reproducible'
      | 'reproducible_with_warnings'
      | 'source_changed'
      | 'dependencies_changed'
      | 'environment_changed'
      | 'dirty_worktree'
      | 'incomplete'
      | 'unknown';
    reasons?: string[];
  };
  captured_at?: number;
}

export interface ProvenanceComparisonResult {
  source: {
    same_commit: boolean;
    base_commit: string | null;
    target_commit: string | null;
    base_dirty: boolean;
    target_dirty: boolean;
    same_fingerprint: boolean;
    status: 'identical' | 'changed' | 'dirty_divergence' | 'unknown';
  };
  dependencies: {
    same_lockfile: boolean;
    base_lockfile: string | null;
    target_lockfile: string | null;
    same_fingerprint: boolean;
    status: 'identical' | 'changed' | 'unknown';
  };
  runtime: {
    same_runtime: boolean;
    same_version: boolean;
    base_runtime: string | null;
    target_runtime: string | null;
    status: 'identical' | 'changed' | 'unknown';
  };
  platform: {
    same_os: boolean;
    same_arch: boolean;
    base_platform: string | null;
    target_platform: string | null;
    status: 'identical' | 'changed' | 'unknown';
  };
  scorecard: {
    source: boolean;
    dependencies: boolean;
    runtime: boolean;
    platform: boolean;
    git_state: boolean;
    status: string;
    interpretation: string;
  };
}

export interface RunDiffResult {
  summary: RunDiffSummary;
  steps: SpanDiffItem[];
  provenanceDiff?: ProvenanceComparisonResult;
}

export async function fetchRunDiff(baseId: string, targetId: string): Promise<RunDiffResult> {
  const res = await fetch(buildUrl(`/api/runs/${baseId}/diff/${targetId}`).toString(), { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to fetch diff between ${baseId} and ${targetId}`);
  }
  const data = await res.json();
  return data.diff || data;
}

export interface RunLineageNode {
  run: TraceRun;
  relation: 'root' | 'ancestor' | 'parent' | 'current' | 'fork' | 'replay';
  depth: number;
}

export async function fetchRunLineage(runId: string): Promise<{
  success: boolean;
  runId: string;
  lineage: {
    ancestors: RunLineageNode[];
    current: RunLineageNode | null;
    descendants: RunLineageNode[];
  };
  mutations: Array<{ span_id: string; field: string; before: any; after: any }>;
}> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/lineage`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch lineage for run ${runId}`);
  return res.json();
}

export async function replayRun(runId: string, body: { new_run_name?: string } = {}): Promise<{ newRunId: string; run: TraceRun }> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/replay`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Failed to replay run: ${res.statusText}`);
  return res.json();
}

export async function fetchRunProvenance(runId: string): Promise<{
  success: boolean;
  runId: string;
  provenance: RunProvenance | null;
  current: RunProvenance;
  comparison: ProvenanceComparisonResult;
}> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/provenance`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch provenance for run ${runId}`);
  return res.json();
}

// --- Phase 7: Security Engine Helpers ---

export function sanitizeLinkUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || lower.startsWith('file:')) {
    return null;
  }
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return null;
  }
  return trimmed;
}

export interface SecurityStatus {
  enabled: boolean;
  redaction: boolean;
  ssrf_protection: boolean;
  zero_eval: boolean;
  max_payload_bytes: number;
  auth_required: boolean;
}

export async function fetchSecurityStatus(): Promise<SecurityStatus> {
  const res = await fetch(buildUrl('/api/security/status').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch security status');
  return res.json();
}

export async function fetchSecurityAudit(limit: number = 50): Promise<{ events: any[]; total: number }> {
  const res = await fetch(buildUrl('/api/security/audit', { limit }).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch security audit log');
  return res.json();
}

// --- Phase 8: Search & Developer UX Engine ---

export type SearchResultType =
  | 'run'
  | 'span'
  | 'event'
  | 'error'
  | 'tool'
  | 'agent'
  | 'model'
  | 'provenance';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  runId: string;
  spanId?: string;
  title: string;
  subtitle?: string;
  matchedField?: string;
  snippet?: string;
  timestamp?: number;
  score?: number;
  metadata?: Record<string, any>;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took_ms: number;
  parsed: {
    terms: string[];
    filters: Array<{ field: string; operator: string; value: any; negated?: boolean }>;
  };
}

export interface ErrorDiscoverySummary {
  errorType: string;
  message: string;
  count: number;
  runsCount: number;
  lastSeen: number;
  sampleRunId: string;
  sampleSpanId: string;
  affectedAgents: string[];
  affectedTools: string[];
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: number;
}

export async function searchTraces(
  query: string,
  options: { limit?: number; offset?: number; runId?: string } = {}
): Promise<SearchResponse> {
  const params: Record<string, any> = {};
  if (query) params.q = query;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;
  if (options.runId) params.run_id = options.runId;

  const res = await fetch(buildUrl('/api/search', params).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Search query failed');
  return res.json();
}

export async function fetchErrorDiscovery(limit: number = 20): Promise<{ errors: ErrorDiscoverySummary[]; count: number }> {
  const res = await fetch(buildUrl('/api/search/errors', { limit }).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch error discovery');
  return res.json();
}

export async function fetchSavedSearches(): Promise<{ savedSearches: SavedSearch[] }> {
  const res = await fetch(buildUrl('/api/search/saved').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch saved searches');
  return res.json();
}

export async function createSavedSearch(name: string, query: string): Promise<{ savedSearch: SavedSearch }> {
  const res = await fetch(buildUrl('/api/search/saved').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query })
  });
  if (!res.ok) throw new Error('Failed to create saved search');
  return res.json();
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  const res = await fetch(buildUrl(`/api/search/saved/${id}`).toString(), { method: 'DELETE' });
  return res.ok;
}

// --- Phase 11: Agent Intelligence API ---

export type {
  ExecutionIntelligence,
  AgentSummary,
  AgentHierarchyNode,
  ToolChain,
  ToolChainStep,
  ParallelGroup,
  ParallelBranch,
  IntelligentRetryChain,
  RetryAttempt,
  CriticalPathAnalysis,
  CriticalPathSpan,
  CausalRelation,
  CausalRelationType,
  CausalClass,
  FailureHotspots
} from '@aethertrace/core-schema';

import type { ExecutionIntelligence } from '@aethertrace/core-schema';

export async function fetchRunIntelligence(runId: string): Promise<ExecutionIntelligence> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/intelligence`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch intelligence for run ${runId}`);
  const data = await res.json();
  return data.intelligence;
}

// --- Phase 12: Replay & Experiment Studio API ---

export type {
  ExperimentStatus,
  ReplayMode,
  MutationType,
  ExperimentMutation,
  ExperimentSummary,
  ExperimentWithVariants,
  MultiVariantScorecardItem,
  MultiVariantComparisonResult,
  ReplayHistoryItem,
  Experiment,
  ExperimentVariant
} from '@aethertrace/core-schema';

import type {
  ExperimentSummary,
  ExperimentWithVariants,
  ExperimentVariant,
  ExperimentMutation,
  ReplayMode,
  MultiVariantComparisonResult,
  ReplayHistoryItem
} from '@aethertrace/core-schema';

export async function fetchExperiments(): Promise<{ count: number; experiments: ExperimentSummary[] }> {
  const res = await fetch(buildUrl('/api/experiments').toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch experiments');
  return res.json();
}

export async function fetchExperiment(id: string): Promise<ExperimentWithVariants> {
  const res = await fetch(buildUrl(`/api/experiments/${id}`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch experiment ${id}`);
  const data = await res.json();
  return data.experiment;
}

export async function createExperiment(payload: {
  name: string;
  description?: string;
  sourceRunId: string;
  metadata?: any;
}): Promise<{ experiment: ExperimentWithVariants }> {
  const res = await fetch(buildUrl('/api/experiments').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create experiment');
  }
  return res.json();
}

export async function deleteExperiment(id: string): Promise<boolean> {
  const res = await fetch(buildUrl(`/api/experiments/${id}`).toString(), { method: 'DELETE' });
  return res.ok;
}

export async function createExperimentVariant(
  experimentId: string,
  payload: {
    name: string;
    description?: string;
    forkSpanId?: string;
    mutations?: ExperimentMutation[];
    replayMode?: ReplayMode;
  }
): Promise<{ variant: ExperimentVariant }> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/variants`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create variant');
  }
  return res.json();
}

export async function updateExperimentVariant(
  experimentId: string,
  variantId: string,
  payload: Partial<{
    name: string;
    description?: string;
    mutations: ExperimentMutation[];
    replayMode: ReplayMode;
  }>
): Promise<{ variant: ExperimentVariant }> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/variants/${variantId}`).toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update variant');
  }
  return res.json();
}

export async function deleteExperimentVariant(experimentId: string, variantId: string): Promise<boolean> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/variants/${variantId}`).toString(), {
    method: 'DELETE'
  });
  return res.ok;
}

export async function replayExperimentVariant(
  experimentId: string,
  variantId: string,
  options?: { confirmLive?: boolean }
): Promise<{ success: boolean; variantId: string; newRunId: string; run: TraceRun }> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/variants/${variantId}/replay`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {})
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to replay variant');
  }
  return res.json();
}

export async function runAllExperimentVariants(
  experimentId: string,
  options?: { confirmLive?: boolean }
): Promise<{
  success: boolean;
  experimentId: string;
  status: string;
  executedCount: number;
  completedCount: number;
  failedCount: number;
  results: Array<{ variantId: string; status: 'completed' | 'failed'; error?: string; newRunId?: string }>;
  experiment: ExperimentWithVariants;
}> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/run-all`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {})
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to run all variants');
  }
  return res.json();
}

export async function fetchExperimentComparison(
  experimentId: string
): Promise<{ comparison: MultiVariantComparisonResult }> {
  const res = await fetch(buildUrl(`/api/experiments/${experimentId}/compare`).toString(), { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch experiment comparison');
  }
  return res.json();
}

export async function fetchReplayHistory(limit: number = 50): Promise<{ count: number; history: ReplayHistoryItem[] }> {
  const res = await fetch(buildUrl('/api/experiments/history', { limit }).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch replay history');
  return res.json();
}

// -----------------------------------------------------------------------------
// Phase 13: Evaluation & Optimization Engine API
// -----------------------------------------------------------------------------

export type EvaluationTargetType = 'run' | 'experiment' | 'variant';
export type EvaluationStatus = 'passed' | 'failed' | 'error';

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
  metrics: {
    cost: {
      totalCostUsd: number;
      modelCostUsd: number;
      cachedSavingsUsd: number;
      costDeltaUsd?: number;
      costDeltaPercent?: number;
      byModel: Record<string, number>;
      byAgent: Record<string, number>;
    };
    latency: {
      totalDurationMs: number;
      criticalPathMs: number;
      modelLatencyMs: number;
      toolLatencyMs: number;
      durationDeltaMs?: number;
      durationDeltaPercent?: number;
    };
    tokens: {
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      estimatedTokens: number;
      reportedTokens: number;
      tokenDelta?: number;
    };
    reliability: {
      errorCount: number;
      failedSpansCount: number;
      failureRate: number;
      retryCount: number;
      retryRate: number;
      breakersTrippedCount: number;
    };
    execution: {
      spanCount: number;
      successSpansCount: number;
      agentCount: number;
      agentMaxDepth: number;
      toolCallCount: number;
      parallelBranchCount: number;
      byAgentCount: Record<string, number>;
      byToolCount: Record<string, number>;
    };
  };
  assertions: AssertionResult[];
  failures: FailureItem[];
  errorClusters: ErrorCluster[];
  rootCauses: RootCauseCandidate[];
  optimizationSignals: OptimizationSignal[];
  regression?: {
    baselineRunId: string;
    targetRunId: string;
    costDeltaUsd: number;
    costDeltaPercent: number;
    durationDeltaMs: number;
    durationDeltaPercent: number;
    tokenDelta: number;
    errorDelta: number;
  } | null;
  createdAt: number;
  completedAt: number;
}

export async function runEvaluationApi(params: {
  targetType: EvaluationTargetType;
  targetId: string;
  name?: string;
  description?: string;
  rules?: string[];
  baselineRunId?: string;
}): Promise<EvaluationReport> {
  const res = await fetch(buildUrl('/api/evaluations/run').toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to run evaluation');
  }
  return res.json();
}

export async function fetchEvaluationsApi(options?: {
  targetType?: string;
  targetId?: string;
  limit?: number;
}): Promise<{ evaluations: any[] }> {
  const res = await fetch(buildUrl('/api/evaluations', options).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to list evaluations');
  return res.json();
}

export async function fetchEvaluationByIdApi(id: string): Promise<EvaluationReport> {
  const res = await fetch(buildUrl(`/api/evaluations/${id}`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch evaluation ${id}`);
  return res.json();
}

export async function fetchEvaluationByTargetApi(targetType: string, targetId: string): Promise<EvaluationReport | null> {
  const res = await fetch(buildUrl(`/api/evaluations/target/${targetType}/${targetId}`).toString(), { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch evaluation for ${targetType} ${targetId}`);
  }
  return res.json();
}

export async function deleteEvaluationApi(id: string): Promise<boolean> {
  const res = await fetch(buildUrl(`/api/evaluations/${id}`).toString(), { method: 'DELETE' });
  return res.ok;
}

export async function exportEvaluationApi(id: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
  const res = await fetch(buildUrl(`/api/evaluations/${id}/export`, { format }).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to export evaluation');
  return res.text();
}

/**
 * Exports an AetherTrace run as an OpenTelemetry OTLP JSON (v1) bundle.
 */
export async function exportOtlpApi(runId: string): Promise<any> {
  const res = await fetch(buildUrl(`/api/runs/${runId}/export/otel`).toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to export run ${runId} to OTel`);
  return res.json();
}

/**
 * Imports an OpenTelemetry OTLP JSON (v1) bundle into AetherTrace.
 */
export async function importOtlpApi(rawJson: string, runNameOverride?: string): Promise<any> {
  const params: Record<string, any> = {};
  if (runNameOverride) params.run_name = runNameOverride;
  const res = await fetch(buildUrl('/api/runs/import/otel', params).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawJson
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to import OpenTelemetry trace');
  }
  return res.json();
}




