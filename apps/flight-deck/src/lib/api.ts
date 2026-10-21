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
  created_at: number;
}

export interface TraceSpan {
  id: string;
  run_id: string;
  parent_span_id: string | null;
  span_type: 'llm_call' | 'tool_call' | 'agent_state' | 'guardrail_block';
  agent_name: string;
  model: string | null;
  request_payload: string | null;
  response_payload: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  cache_hit: number;
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
