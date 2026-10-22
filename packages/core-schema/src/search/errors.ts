/**
 * AetherTrace — Cross-Run Error & Failure Discovery Engine
 */

import type Database from 'better-sqlite3';
import type { ErrorDiscoverySummary } from './types.js';

/**
 * Discovers and groups failure signatures across all runs in the trace database.
 */
export function discoverErrors(
  sqlite: Database.Database,
  options: { limit?: number } = {}
): ErrorDiscoverySummary[] {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);

  // Find spans that represent guardrail blocks, HTTP errors, or have error objects in response_payload
  const sql = `
    SELECT id, run_id, parent_span_id, span_type, agent_name, model, response_payload, created_at
    FROM trace_spans
    WHERE span_type = 'guardrail_block'
       OR response_payload LIKE '%"error"%'
       OR response_payload LIKE '%"status": 4%'
       OR response_payload LIKE '%"status": 5%'
    ORDER BY created_at DESC
    LIMIT 500
  `;

  let rows: any[] = [];
  try {
    rows = sqlite.prepare(sql).all() as any[];
  } catch {
    return [];
  }

  const groups = new Map<
    string,
    {
      errorType: string;
      message: string;
      count: number;
      runs: Set<string>;
      lastSeen: number;
      sampleRunId: string;
      sampleSpanId: string;
      agents: Set<string>;
      tools: Set<string>;
    }
  >();

  for (const row of rows) {
    let errType = 'ExecutionError';
    let message = 'Unspecified execution failure';

    if (row.span_type === 'guardrail_block') {
      errType = 'CircuitBreakerBlocked';
      message = 'Request blocked by safety guardrail or circuit breaker';
    }

    if (row.response_payload) {
      try {
        const payload = JSON.parse(row.response_payload);
        if (payload.error) {
          if (typeof payload.error === 'string') {
            message = payload.error;
          } else if (payload.error.message) {
            message = payload.error.message;
            errType = payload.error.type || payload.error.code || errType;
          }
        } else if (payload.status_code) {
          errType = `HTTP ${payload.status_code}`;
          message = payload.detail || payload.message || `HTTP ${payload.status_code} Error`;
        }
      } catch {
        message = String(row.response_payload).slice(0, 120);
      }
    }

    // Normalize error classification
    if (message.toLowerCase().includes('rate limit') || message.includes('429')) {
      errType = 'HTTP 429 (RateLimit)';
    } else if (message.toLowerCase().includes('timeout') || message.includes('504')) {
      errType = 'TimeoutError';
    } else if (message.toLowerCase().includes('budget') || message.toLowerCase().includes('max budget')) {
      errType = 'BudgetExceededError';
    } else if (message.toLowerCase().includes('context length') || message.toLowerCase().includes('token limit')) {
      errType = 'ContextLengthExceeded';
    }

    const key = `${errType}:::${message.slice(0, 80)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        errorType: errType,
        message,
        count: 0,
        runs: new Set(),
        lastSeen: row.created_at,
        sampleRunId: row.run_id,
        sampleSpanId: row.id,
        agents: new Set(),
        tools: new Set()
      };
      groups.set(key, group);
    }

    group.count++;
    group.runs.add(row.run_id);
    group.agents.add(row.agent_name);
    if (row.span_type === 'tool_call') {
      group.tools.add(row.agent_name);
    }
    if (row.created_at > group.lastSeen) {
      group.lastSeen = row.created_at;
      group.sampleRunId = row.run_id;
      group.sampleSpanId = row.id;
    }
  }

  const summaries: ErrorDiscoverySummary[] = Array.from(groups.values()).map((g) => ({
    errorType: g.errorType,
    message: g.message,
    count: g.count,
    runsCount: g.runs.size,
    lastSeen: g.lastSeen,
    sampleRunId: g.sampleRunId,
    sampleSpanId: g.sampleSpanId,
    affectedAgents: Array.from(g.agents),
    affectedTools: Array.from(g.tools)
  }));

  // Sort by occurrence count descending, then lastSeen descending
  summaries.sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);

  return summaries.slice(0, limit);
}

/**
 * Reconstructs the causal chain leading up to a specific error span.
 */
export function getErrorCausalChain(
  sqlite: Database.Database,
  spanId: string
): { errorSpan: any; causalPath: any[]; run: any } | null {
  const spanRow = sqlite.prepare('SELECT * FROM trace_spans WHERE id = ?').get(spanId) as any;
  if (!spanRow) return null;

  const runRow = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(spanRow.run_id) as any;

  // Walk upward parent_span_id to build causal path
  const path: any[] = [];
  let currParentId = spanRow.parent_span_id;

  while (currParentId && path.length < 20) {
    const parent = sqlite.prepare('SELECT * FROM trace_spans WHERE id = ?').get(currParentId) as any;
    if (!parent) break;
    path.unshift(parent);
    currParentId = parent.parent_span_id;
  }

  return {
    errorSpan: spanRow,
    causalPath: path,
    run: runRow
  };
}
