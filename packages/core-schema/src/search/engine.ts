/**
 * AetherTrace — Search & Developer UX Engine: SQLite Execution Engine
 */

import type Database from 'better-sqlite3';
import { redactValue, redactString } from '../security/redaction.js';
import { parseSearchQuery } from './parser.js';
import type {
  SearchResult,
  SearchOptions,
  SearchResponse,
  ParsedSearchQuery,
  QueryFilter
} from './types.js';

let fts5Available: boolean | null = null;

/**
 * Initializes the FTS5 virtual table and search indexes.
 */
export function initSearchSchema(sqlite: Database.Database): void {
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS trace_search USING fts5(
        entity_type UNINDEXED,
        entity_id UNINDEXED,
        run_id UNINDEXED,
        span_id UNINDEXED,
        title,
        content,
        metadata UNINDEXED,
        timestamp UNINDEXED,
        tokenize = 'unicode61'
      );
    `);
    fts5Available = true;
  } catch (err) {
    // If FTS5 is unavailable or fails, fallback to standard table
    fts5Available = false;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS trace_search (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        span_id TEXT,
        title TEXT,
        content TEXT,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trace_search_entity_idx ON trace_search(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS trace_search_run_idx ON trace_search(run_id);
    `);
  }
}

/**
 * Strips and sanitizes text for safe FTS5 MATCH expressions.
 */
function toFts5MatchExpression(terms: string[]): string {
  if (terms.length === 0) return '';
  const cleanTerms = terms
    .map((t) => t.replace(/["*^\(\)\{\}\[\]\:\;]/g, ' ').trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"*`);

  return cleanTerms.join(' AND ');
}

/**
 * Extracts searchable text projections from a span.
 * Guarantees zero secret exposure via Phase 7 redaction.
 */
function extractSpanSearchableContent(span: any): { title: string; content: string } {
  const parts: string[] = [];

  parts.push(span.id);
  parts.push(span.agent_name || '');
  if (span.model) parts.push(span.model);
  parts.push(span.span_type || '');

  let toolName = '';
  // Check if tool name in request/response
  if (span.request_payload) {
    try {
      const req = typeof span.request_payload === 'string' ? JSON.parse(span.request_payload) : span.request_payload;
      const sanitizedReq = redactValue(req);
      const str = JSON.stringify(sanitizedReq);
      // Look for tool calls or function name
      if (sanitizedReq.tools) parts.push(JSON.stringify(sanitizedReq.tools));
      if (sanitizedReq.function_call?.name) {
        toolName = sanitizedReq.function_call.name;
        parts.push(toolName);
      }
      if (sanitizedReq.messages) {
        for (const m of sanitizedReq.messages) {
          if (m.content) parts.push(typeof m.content === 'string' ? m.content.slice(0, 500) : '');
          if (m.name) parts.push(m.name);
        }
      } else {
        parts.push(str.slice(0, 500));
      }
    } catch {
      parts.push(redactString(String(span.request_payload).slice(0, 300)));
    }
  }

  if (span.response_payload) {
    try {
      const res = typeof span.response_payload === 'string' ? JSON.parse(span.response_payload) : span.response_payload;
      const sanitizedRes = redactValue(res);
      if (sanitizedRes.choices?.[0]?.message?.tool_calls) {
        for (const tc of sanitizedRes.choices[0].message.tool_calls) {
          if (tc.function?.name) {
            toolName = tc.function.name;
            parts.push(toolName);
          }
          if (tc.function?.arguments) {
            parts.push(typeof tc.function.arguments === 'string' ? tc.function.arguments.slice(0, 300) : '');
          }
        }
      }
      if (sanitizedRes.choices?.[0]?.message?.content) {
        parts.push(sanitizedRes.choices[0].message.content.slice(0, 500));
      }
      if (sanitizedRes.error) {
        parts.push(typeof sanitizedRes.error === 'string' ? sanitizedRes.error : JSON.stringify(sanitizedRes.error));
      }
    } catch {
      parts.push(redactString(String(span.response_payload).slice(0, 300)));
    }
  }

  const title = toolName
    ? `${span.agent_name} → ${toolName}`
    : span.model
    ? `${span.agent_name} (${span.model})`
    : `${span.agent_name} (${span.span_type})`;

  return {
    title: redactString(title),
    content: redactString(parts.join(' '))
  };
}

/**
 * Indexes a single span into the search projection.
 */
export function indexSpan(sqlite: Database.Database, span: any): void {
  try {
    initSearchSchema(sqlite);

    // Delete existing entry for this span if any
    sqlite.prepare('DELETE FROM trace_search WHERE entity_type = ? AND entity_id = ?').run('span', span.id);

    const { title, content } = extractSpanSearchableContent(span);

    let entityType = 'span';
    if (span.span_type === 'tool_call') entityType = 'tool';
    else if (span.span_type === 'guardrail_block' || (span.response_payload && span.response_payload.includes('"error"'))) {
      entityType = 'error';
    }

    const metadata = JSON.stringify({
      agent: span.agent_name,
      model: span.model,
      type: span.span_type,
      cost_usd: span.cost_usd || 0,
      latency_ms: span.latency_ms || 0,
      cache_hit: span.cache_hit || 0
    });

    sqlite.prepare(`
      INSERT INTO trace_search (entity_type, entity_id, run_id, span_id, title, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entityType, span.id, span.run_id, span.id, title, content, metadata, span.created_at || Date.now());
  } catch (err) {
    // Non-blocking index failure
  }
}

/**
 * Indexes a single run into the search projection.
 */
export function indexRun(sqlite: Database.Database, run: any): void {
  try {
    initSearchSchema(sqlite);

    sqlite.prepare('DELETE FROM trace_search WHERE entity_type = ? AND entity_id = ?').run('run', run.id);

    const contentParts = [run.id, run.name, run.status];
    if (run.provenance) contentParts.push(run.provenance);
    if (run.mutations) contentParts.push(run.mutations);

    const metadata = JSON.stringify({
      status: run.status,
      total_tokens: run.total_tokens || 0,
      total_cost_usd: run.total_cost_usd || 0,
      parent_run_id: run.parent_run_id || null
    });

    const safeTitle = redactString(run.name || run.id);
    const safeContent = redactString(contentParts.join(' '));

    sqlite.prepare(`
      INSERT INTO trace_search (entity_type, entity_id, run_id, span_id, title, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('run', run.id, run.id, '', safeTitle, safeContent, metadata, run.created_at || Date.now());
  } catch (err) {
    // Non-blocking index failure
  }
}

/**
 * Rebuilds the search index completely from trace_runs and trace_spans.
 */
export function rebuildSearchIndex(sqlite: Database.Database): { runsIndexed: number; spansIndexed: number; tookMs: number } {
  const startTime = Date.now();
  initSearchSchema(sqlite);

  const tx = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM trace_search').run();

    const runs = sqlite.prepare('SELECT * FROM trace_runs').all();
    for (const r of runs) {
      indexRun(sqlite, r);
    }

    const spans = sqlite.prepare('SELECT * FROM trace_spans').all();
    for (const s of spans) {
      indexSpan(sqlite, s);
    }

    return { runsIndexed: runs.length, spansIndexed: spans.length };
  });

  const res = tx();
  return {
    runsIndexed: res.runsIndexed,
    spansIndexed: res.spansIndexed,
    tookMs: Date.now() - startTime
  };
}

/**
 * Computes deterministic relevance score for a search result.
 */
function scoreSearchResult(queryStr: string, item: SearchResult): number {
  const q = queryStr.toLowerCase().trim();
  if (!q) return 10;

  const idLower = item.id.toLowerCase();
  const titleLower = item.title.toLowerCase();
  const subLower = (item.subtitle || '').toLowerCase();
  const snippetLower = (item.snippet || '').toLowerCase();

  // 1. Exact ID match: 100
  if (idLower === q) return 100;
  if (item.runId.toLowerCase() === q) return 95;
  if (item.spanId && item.spanId.toLowerCase() === q) return 95;

  // 2. Exact Title / Name match: 80
  if (titleLower === q) return 80;

  // 3. Prefix match: 60
  if (idLower.startsWith(q) || titleLower.startsWith(q)) return 60;

  // 4. Substring / Token match: 40
  if (titleLower.includes(q) || subLower.includes(q)) return 40;
  if (snippetLower.includes(q)) return 30;

  return 20;
}

/**
 * Executes global search with zero-eval query AST and parameterized queries.
 */
export function executeSearch(
  sqlite: Database.Database,
  queryInput: string | ParsedSearchQuery,
  options: SearchOptions = {}
): SearchResponse {
  const startTime = Date.now();
  initSearchSchema(sqlite);

  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const parsed = typeof queryInput === 'string' ? parseSearchQuery(queryInput) : queryInput;
  const rawQ = parsed.rawQuery;

  const results: SearchResult[] = [];
  const seenIds = new Set<string>();

  // 1. If terms are present, search using FTS5 (or LIKE fallback)
  if (parsed.terms.length > 0) {
    if (fts5Available) {
      const matchExpr = toFts5MatchExpression(parsed.terms);
      if (matchExpr) {
        try {
          let sql = `
            SELECT entity_type, entity_id, run_id, span_id, title, content, metadata, timestamp, rank
            FROM trace_search
            WHERE trace_search MATCH ?
          `;
          const params: any[] = [matchExpr];

          if (options.runId) {
            sql += ` AND run_id = ?`;
            params.push(options.runId);
          }

          sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
          params.push(limit * 2, offset);

          const rows = sqlite.prepare(sql).all(...params) as any[];
          for (const row of rows) {
            const meta = row.metadata ? JSON.parse(row.metadata) : {};
            let snippet = row.content ? row.content.slice(0, 160) : undefined;
            if (snippet && snippet.length === 160) snippet += '...';

            const res: SearchResult = {
              type: row.entity_type as any,
              id: row.entity_id,
              runId: row.run_id,
              spanId: row.span_id || undefined,
              title: row.title || row.entity_id,
              subtitle: meta.model ? `${meta.model} · ${meta.agent || ''}` : meta.status ? `Status: ${meta.status}` : undefined,
              snippet,
              timestamp: Number(row.timestamp),
              metadata: meta
            };
            res.score = scoreSearchResult(rawQ, res);
            results.push(res);
            seenIds.add(`${res.type}:${res.id}`);
          }
        } catch {
          // FTS match syntax fallback
        }
      }
    }

    // Direct Exact ID search on runs and spans (ensuring exact run_... or span_... is never missed)
    for (const term of parsed.terms) {
      if (term.length >= 4) {
        const matchingRuns = sqlite
          .prepare('SELECT id, name, status, created_at, total_tokens, total_cost_usd FROM trace_runs WHERE id = ? OR name LIKE ? LIMIT 5')
          .all(term, `%${term}%`) as any[];

        for (const r of matchingRuns) {
          const key = `run:${r.id}`;
          if (!seenIds.has(key)) {
            const res: SearchResult = {
              type: 'run',
              id: r.id,
              runId: r.id,
              title: r.name,
              subtitle: `${r.status} · ${r.total_tokens} tokens · $${Number(r.total_cost_usd).toFixed(4)}`,
              timestamp: r.created_at,
              score: r.id === term ? 100 : 70
            };
            results.push(res);
            seenIds.add(key);
          }
        }

        const matchingSpans = sqlite
          .prepare('SELECT id, run_id, agent_name, model, span_type, cost_usd, latency_ms, created_at FROM trace_spans WHERE id = ? OR agent_name LIKE ? OR model LIKE ? LIMIT 10')
          .all(term, `%${term}%`, `%${term}%`) as any[];

        for (const s of matchingSpans) {
          const key = `span:${s.id}`;
          if (!seenIds.has(key)) {
            const res: SearchResult = {
              type: s.span_type === 'tool_call' ? 'tool' : 'span',
              id: s.id,
              runId: s.run_id,
              spanId: s.id,
              title: `${s.agent_name} (${s.model || s.span_type})`,
              subtitle: `${s.latency_ms}ms · $${Number(s.cost_usd).toFixed(4)}`,
              timestamp: s.created_at,
              score: s.id === term ? 100 : 65
            };
            results.push(res);
            seenIds.add(key);
          }
        }
      }
    }
  }

  // 2. Structured Filters (on trace_spans and trace_runs)
  if (parsed.filters.length > 0 || (parsed.terms.length === 0 && !rawQ)) {
    // Determine whether filters apply to runs, spans, or both
    const spanPredicates: string[] = [];
    const spanParams: any[] = [];

    const runPredicates: string[] = [];
    const runParams: any[] = [];

    for (const f of parsed.filters) {
      const op = f.operator === 'prefix' ? 'LIKE' : f.operator;
      const val = f.operator === 'prefix' ? `${f.value}%` : f.value;

      if (f.field === 'cost_usd') {
        spanPredicates.push(`cost_usd ${op} ?`);
        spanParams.push(val);
        runPredicates.push(`total_cost_usd ${op} ?`);
        runParams.push(val);
      } else if (f.field === 'latency_ms') {
        spanPredicates.push(`latency_ms ${op} ?`);
        spanParams.push(val);
      } else if (f.field === 'total_tokens') {
        spanPredicates.push(`(prompt_tokens + completion_tokens) ${op} ?`);
        spanParams.push(val);
        runPredicates.push(`total_tokens ${op} ?`);
        runParams.push(val);
      } else if (f.field === 'agent_name') {
        spanPredicates.push(`agent_name ${op} ?`);
        spanParams.push(val);
      } else if (f.field === 'model') {
        spanPredicates.push(`model ${op} ?`);
        spanParams.push(val);
      } else if (f.field === 'span_type') {
        spanPredicates.push(`span_type ${op} ?`);
        spanParams.push(val);
      } else if (f.field === 'status') {
        if (val === 'failed' || val === 'error') {
          runPredicates.push(`(status = 'failed' OR status = 'breaker_tripped')`);
          spanPredicates.push(`(span_type = 'guardrail_block' OR response_payload LIKE '%"error"%')`);
        } else {
          runPredicates.push(`status ${op} ?`);
          runParams.push(val);
        }
      } else if (f.field === 'run_id') {
        spanPredicates.push(`run_id = ?`);
        spanParams.push(val);
        runPredicates.push(`id = ?`);
        runParams.push(val);
      } else if (f.field === 'span_id') {
        spanPredicates.push(`id = ?`);
        spanParams.push(val);
      } else if (f.field === 'created_at') {
        spanPredicates.push(`created_at ${op} ?`);
        spanParams.push(val);
        runPredicates.push(`created_at ${op} ?`);
        runParams.push(val);
      } else if (f.field === 'branch' || f.field === 'commit_sha' || f.field === 'platform' || f.field === 'runtime') {
        runPredicates.push(`provenance LIKE ?`);
        runParams.push(`%${val}%`);
      }
    }

    if (options.runId) {
      spanPredicates.push(`run_id = ?`);
      spanParams.push(options.runId);
      runPredicates.push(`id = ?`);
      runParams.push(options.runId);
    }

    // Query spans if any span predicates matched
    if (spanPredicates.length > 0) {
      try {
        const sql = `
          SELECT id, run_id, agent_name, model, span_type, cost_usd, latency_ms, created_at, response_payload
          FROM trace_spans
          WHERE ${spanPredicates.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ?
        `;
        const matchingSpans = sqlite.prepare(sql).all(...spanParams, limit) as any[];

        for (const s of matchingSpans) {
          const key = `span:${s.id}`;
          if (!seenIds.has(key)) {
            const isError = s.span_type === 'guardrail_block' || (s.response_payload && s.response_payload.includes('"error"'));
            const type = isError ? 'error' : s.span_type === 'tool_call' ? 'tool' : 'span';
            const res: SearchResult = {
              type,
              id: s.id,
              runId: s.run_id,
              spanId: s.id,
              title: `${s.agent_name} (${s.model || s.span_type})`,
              subtitle: `${s.latency_ms}ms · $${Number(s.cost_usd).toFixed(4)}`,
              timestamp: s.created_at,
              score: 75
            };
            results.push(res);
            seenIds.add(key);
          }
        }
      } catch {}
    }

    // Query runs if any run predicates matched
    if (runPredicates.length > 0) {
      try {
        const sql = `
          SELECT id, name, status, created_at, total_tokens, total_cost_usd, provenance
          FROM trace_runs
          WHERE ${runPredicates.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ?
        `;
        const matchingRuns = sqlite.prepare(sql).all(...runParams, limit) as any[];

        for (const r of matchingRuns) {
          const key = `run:${r.id}`;
          if (!seenIds.has(key)) {
            const res: SearchResult = {
              type: r.provenance ? 'provenance' : 'run',
              id: r.id,
              runId: r.id,
              title: r.name,
              subtitle: `${r.status} · ${r.total_tokens} tokens · $${Number(r.total_cost_usd).toFixed(4)}`,
              timestamp: r.created_at,
              score: 75
            };
            results.push(res);
            seenIds.add(key);
          }
        }
      } catch {}
    }
  }

  // If query is totally empty and no filters, return recent runs
  if (results.length === 0 && !rawQ && parsed.filters.length === 0) {
    const totalCount = (sqlite.prepare('SELECT COUNT(*) as count FROM trace_runs').get() as { count: number })?.count || 0;
    const recent = sqlite.prepare('SELECT id, name, status, created_at, total_tokens, total_cost_usd FROM trace_runs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as any[];
    for (const r of recent) {
      results.push({
        type: 'run',
        id: r.id,
        runId: r.id,
        title: r.name,
        subtitle: `${r.status} · ${r.total_tokens} tokens · $${Number(r.total_cost_usd).toFixed(4)}`,
        timestamp: r.created_at,
        score: 50
      });
    }

    return {
      query: rawQ,
      results,
      total: totalCount,
      took_ms: Date.now() - startTime,
      parsed: {
        terms: parsed.terms,
        filters: parsed.filters
      }
    };
  }

  // Sort deterministically by score DESC, then timestamp DESC
  results.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  const paged = results.slice(offset, offset + limit);

  return {
    query: rawQ,
    results: paged,
    total: results.length,
    took_ms: Date.now() - startTime,
    parsed: {
      terms: parsed.terms,
      filters: parsed.filters
    }
  };
}
