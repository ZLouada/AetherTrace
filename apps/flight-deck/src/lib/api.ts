export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';

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
  const url = new URL(`${API_BASE}/api/runs`);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.statusText}`);
  const data = await res.json();
  return data.runs || [];
}

export async function fetchRun(runId: string): Promise<TraceRun> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch run ${runId}`);
  const data = await res.json();
  return data.run;
}

export async function fetchRunSpans(runId: string): Promise<{ run: TraceRun; spans: TraceSpan[] }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/spans`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch spans for run ${runId}`);
  const data = await res.json();
  return { run: data.run, spans: data.spans || [] };
}

export async function fetchStats(): Promise<GlobalStats> {
  const res = await fetch(`${API_BASE}/api/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function forkSpan(spanId: string, body: { new_run_name?: string; reason?: string }): Promise<{ newRunId: string }> {
  const res = await fetch(`${API_BASE}/api/spans/${spanId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Fork failed: ${res.statusText}`);
  return res.json();
}

export async function replaySpan(spanId: string, body: { new_run_name?: string } = {}): Promise<{ newRunId: string }> {
  const res = await fetch(`${API_BASE}/api/spans/${spanId}/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Replay failed: ${res.statusText}`);
  return res.json();
}

export async function pauseRun(runId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Pause failed: ${res.statusText}`);
  return res.json();
}

export async function resumeRun(runId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Resume failed: ${res.statusText}`);
  return res.json();
}

export async function postChatCompletion(payload: any, customHeaders: Record<string, string> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
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
  const res = await fetch(`${API_BASE}/api/runs/${runId}/export`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE}/api/runs/import`, {
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
  const res = await fetch(`${API_BASE}/api/breakpoints`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch breakpoints');
  return res.json();
}

export async function updateBreakpointConfig(config: Partial<BreakpointConfig>): Promise<{ success: boolean; config: BreakpointConfig }> {
  const res = await fetch(`${API_BASE}/api/breakpoints/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) throw new Error('Failed to update breakpoint config');
  return res.json();
}

export async function addBreakpointCondition(condition: BreakpointCondition): Promise<{ success: boolean; condition: BreakpointCondition; config: BreakpointConfig }> {
  const res = await fetch(`${API_BASE}/api/breakpoints/conditions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(condition)
  });
  if (!res.ok) throw new Error('Failed to add condition');
  return res.json();
}

export async function deleteBreakpointCondition(id: string): Promise<{ success: boolean; id: string; config: BreakpointConfig }> {
  const res = await fetch(`${API_BASE}/api/breakpoints/conditions/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete condition');
  return res.json();
}

export async function toggleBreakpointCondition(id: string, enabled?: boolean): Promise<{ success: boolean; id: string; config: BreakpointConfig }> {
  const res = await fetch(`${API_BASE}/api/breakpoints/conditions/${id}/toggle`, {
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
  const res = await fetch(`${API_BASE}/api/breakpoints/${spanId}/resolve`, {
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
  const res = await fetch(`${API_BASE}/api/chaos/config`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch chaos config');
  return res.json();
}

export async function updateChaosConfig(config: Partial<ChaosConfig>): Promise<{ success: boolean; config: ChaosConfig }> {
  const res = await fetch(`${API_BASE}/api/chaos/config`, {
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
  const res = await fetch(`${API_BASE}/api/runs/${baseId}/diff/${targetId}`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE}/api/runs/${runId}/lineage`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch lineage for run ${runId}`);
  return res.json();
}

export async function replayRun(runId: string, body: { new_run_name?: string } = {}): Promise<{ newRunId: string; run: TraceRun }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/replay`, {
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
  const res = await fetch(`${API_BASE}/api/runs/${runId}/provenance`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE}/api/security/status`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch security status');
  return res.json();
}

export async function fetchSecurityAudit(limit: number = 50): Promise<{ events: any[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/security/audit?limit=${limit}`, { cache: 'no-store' });
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
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.runId) params.set('run_id', options.runId);

  const res = await fetch(`${API_BASE}/api/search?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Search query failed');
  return res.json();
}

export async function fetchErrorDiscovery(limit: number = 20): Promise<{ errors: ErrorDiscoverySummary[]; count: number }> {
  const res = await fetch(`${API_BASE}/api/search/errors?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch error discovery');
  return res.json();
}

export async function fetchSavedSearches(): Promise<{ savedSearches: SavedSearch[] }> {
  const res = await fetch(`${API_BASE}/api/search/saved`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch saved searches');
  return res.json();
}

export async function createSavedSearch(name: string, query: string): Promise<{ savedSearch: SavedSearch }> {
  const res = await fetch(`${API_BASE}/api/search/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query })
  });
  if (!res.ok) throw new Error('Failed to create saved search');
  return res.json();
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/search/saved/${id}`, { method: 'DELETE' });
  return res.ok;
}



