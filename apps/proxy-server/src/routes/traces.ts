import { Hono } from 'hono';
import { eq, desc, asc, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  computeRunDiff,
  type TraceRun,
  type TraceSpan,
  type RunDiffResult
} from '@aethertrace/core-schema';

import { broadcastEvent } from '../broadcaster.js';

export const tracesRouter = new Hono();

/**
 * GET /api/runs - List all trace runs
 */
tracesRouter.get('/runs', async (c) => {
  const { db } = getDatabase();
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const status = c.req.query('status');

  let query = db.select().from(trace_runs);

  if (status && ['running', 'paused', 'completed', 'failed', 'breaker_tripped'].includes(status)) {
    // @ts-ignore
    query = query.where(eq(trace_runs.status, status));
  }

  const runs = query.orderBy(desc(trace_runs.created_at)).limit(limit).all();
  return c.json({ runs });
});

/**
 * GET /api/runs/:id - Get a single trace run by ID
 */
tracesRouter.get('/runs/:id', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, id)).limit(1).all();
  if (runs.length === 0) {
    return c.json({ error: { message: `Run '${id}' not found` } }, 404);
  }

  return c.json({ run: runs[0] });
});

/**
 * GET /api/runs/:id/spans - Get all spans for a run (ordered chronologically)
 */
tracesRouter.get('/runs/:id/spans', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, id)).limit(1).all();
  if (runs.length === 0) {
    return c.json({ error: { message: `Run '${id}' not found` } }, 404);
  }

  const spans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, id))
    .orderBy(asc(trace_spans.created_at))
    .all();

  return c.json({
    run: runs[0],
    spanCount: spans.length,
    spans
  });
});

/**
 * GET /api/runs/:baseId/diff/:targetId - Compare any two runs side-by-side
 */
tracesRouter.get('/runs/:baseId/diff/:targetId', async (c) => {
  const { db } = getDatabase();
  const baseId = c.req.param('baseId');
  const targetId = c.req.param('targetId');

  const diffResult = computeRunDiff(db, baseId, targetId);
  if (!diffResult) {
    return c.json({ error: { message: `One or both runs not found ('${baseId}', '${targetId}')` } }, 404);
  }

  return c.json({
    success: true,
    summary: diffResult.summary,
    steps: diffResult.steps,
    diff: diffResult
  });
});


/**
 * GET /api/runs/:id/export - Export a self-contained portable .trace.json bundle (Wireshark .pcap equivalent)
 */
tracesRouter.get('/runs/:id/export', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, id)).limit(1).all();
  if (runs.length === 0) {
    return c.json({ error: { message: `Run '${id}' not found` } }, 404);
  }

  const spans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, id))
    .orderBy(asc(trace_spans.created_at))
    .all();

  const bundle = {
    version: '1.0',
    exported_at: Date.now(),
    run: runs[0],
    spans
  };

  c.header('Content-Disposition', `attachment; filename="run_${id}.trace.json"`);
  c.header('Content-Type', 'application/json');
  return c.json(bundle);
});

/**
 * POST /api/runs/import - Safely import and upsert a portable .trace.json bundle into local SQLite
 */
tracesRouter.post('/runs/import', async (c) => {
  const { db, sqlite } = getDatabase();

  let body: any;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ error: { message: 'Invalid JSON payload in import request' } }, 400);
  }

  const runData = body.run || body;
  const spansData = body.spans || [];

  if (!runData || !runData.id) {
    return c.json({ error: { message: 'Import payload must contain a valid run object with an id' } }, 400);
  }

  const targetRunId = body.run_id_override || runData.id;
  const now = Date.now();

  const preparedRun: TraceRun = {
    id: targetRunId,
    name: body.run_name_override || runData.name || 'imported-run',
    status: runData.status || 'completed',
    total_tokens: runData.total_tokens || 0,
    total_cost_usd: runData.total_cost_usd || 0.0,
    parent_run_id: runData.parent_run_id || null,
    forked_at_span_id: runData.forked_at_span_id || null,
    created_at: runData.created_at || now
  };

  // Perform atomic import transaction
  const importTx = sqlite.transaction(() => {
    // Delete existing run if conflicting to allow safe re-import / overwrite
    sqlite.prepare('DELETE FROM trace_spans WHERE run_id = ?').run(targetRunId);
    sqlite.prepare('DELETE FROM trace_runs WHERE id = ?').run(targetRunId);

    // Insert run
    db.insert(trace_runs).values(preparedRun).run();

    // Insert spans
    for (const rawSpan of spansData) {
      const span: TraceSpan = {
        id: targetRunId !== runData.id ? `span_imp_${randomUUID()}` : rawSpan.id,
        run_id: targetRunId,
        parent_span_id: rawSpan.parent_span_id || null,
        span_type: rawSpan.span_type || 'llm_call',
        agent_name: rawSpan.agent_name || 'default-agent',
        model: rawSpan.model || null,
        request_payload: rawSpan.request_payload || null,
        response_payload: rawSpan.response_payload || null,
        prompt_tokens: rawSpan.prompt_tokens || 0,
        completion_tokens: rawSpan.completion_tokens || 0,
        cost_usd: rawSpan.cost_usd || 0.0,
        latency_ms: rawSpan.latency_ms || 0,
        cache_hit: rawSpan.cache_hit || 0,
        request_hash: rawSpan.request_hash || 'unknown',
        created_at: rawSpan.created_at || now
      };
      db.insert(trace_spans).values(span).run();
    }
  });

  importTx();

  broadcastEvent({
    type: 'RUN_CREATED',
    data: preparedRun,
    runId: targetRunId
  });

  return c.json({
    success: true,
    message: `Trace '${preparedRun.name}' (${targetRunId}) imported successfully`,
    runId: targetRunId,
    spanCount: spansData.length,
    run: preparedRun
  }, 201);
});

/**
 * GET /api/spans/:id - Get a single span
 */
tracesRouter.get('/spans/:id', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  const spans = db.select().from(trace_spans).where(eq(trace_spans.id, id)).limit(1).all();
  if (spans.length === 0) {
    return c.json({ error: { message: `Span '${id}' not found` } }, 404);
  }

  return c.json({ span: spans[0] });
});

/**
 * POST /api/spans/:id/fork - Time-Travel Replay Forking
 * Forks an execution DAG history from a specific span point into a new isolated run
 */
tracesRouter.post('/spans/:id/fork', async (c) => {
  const { db } = getDatabase();
  const spanId = c.req.param('id');

  const spans = db.select().from(trace_spans).where(eq(trace_spans.id, spanId)).limit(1).all();
  if (spans.length === 0) {
    return c.json({ error: { message: `Source span '${spanId}' not found` } }, 404);
  }

  const sourceSpan = spans[0];
  const sourceRuns = db.select().from(trace_runs).where(eq(trace_runs.id, sourceSpan.run_id)).limit(1).all();
  const sourceRun = sourceRuns[0];

  const body = await c.req.json().catch(() => ({}));
  const newRunId = `run_${randomUUID()}`;
  const now = Date.now();
  const newRunName = body.new_run_name || `fork-${sourceRun?.name || 'run'}-${spanId.slice(0, 8)}`;

  // 1. Create new run with parent_run_id and forked_at_span_id
  const newRun: TraceRun = {
    id: newRunId,
    name: newRunName,
    status: 'running',
    total_tokens: 0,
    total_cost_usd: 0.0,
    parent_run_id: sourceSpan.run_id,
    forked_at_span_id: spanId,
    created_at: now
  };

  db.insert(trace_runs).values(newRun).run();

  // 2. Copy preceding ancestor spans into the new run
  const priorSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, sourceSpan.run_id))
    .orderBy(asc(trace_spans.created_at))
    .all()
    .filter((s) => s.created_at <= sourceSpan.created_at && s.id !== sourceSpan.id);

  let accumulatedCost = 0;
  let accumulatedTokens = 0;

  for (const s of priorSpans) {
    const copiedSpanId = `span_${randomUUID()}`;
    const copiedSpan: TraceSpan = {
      ...s,
      id: copiedSpanId,
      run_id: newRunId,
      cache_hit: 1, // Marked as replay in new branch
      created_at: now
    };
    db.insert(trace_spans).values(copiedSpan).run();

    accumulatedCost += s.cost_usd || 0;
    accumulatedTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
  }

  db.update(trace_runs)
    .set({
      total_tokens: accumulatedTokens,
      total_cost_usd: accumulatedCost
    })
    .where(eq(trace_runs.id, newRunId))
    .run();

  broadcastEvent({
    type: 'RUN_CREATED',
    data: newRun,
    runId: newRunId
  });

  return c.json({
    success: true,
    message: `Forked run successfully from span '${spanId}'`,
    originalSpanId: spanId,
    originalRunId: sourceSpan.run_id,
    newRunId,
    copiedSpansCount: priorSpans.length
  }, 201);
});

/**
 * GET /api/stats - Global trace statistics
 */
tracesRouter.get('/stats', async (c) => {
  const { sqlite } = getDatabase();

  const runStats = sqlite
    .prepare(`
      SELECT 
        COUNT(*) as totalRuns,
        SUM(total_cost_usd) as totalCostUsd,
        SUM(total_tokens) as totalTokens
      FROM trace_runs
    `)
    .get() as any;

  const spanStats = sqlite
    .prepare(`
      SELECT 
        COUNT(*) as totalSpans,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cachedSpans,
        AVG(latency_ms) as avgLatencyMs
      FROM trace_spans
    `)
    .get() as any;

  return c.json({
    runs: {
      total: runStats?.totalRuns || 0,
      totalCostUsd: Number((runStats?.totalCostUsd || 0).toFixed(6)),
      totalTokens: runStats?.totalTokens || 0
    },
    spans: {
      total: spanStats?.totalSpans || 0,
      cachedCount: spanStats?.cachedSpans || 0,
      cacheHitRate: spanStats?.totalSpans > 0
        ? Number(((spanStats.cachedSpans / spanStats.totalSpans) * 100).toFixed(2))
        : 0,
      avgLatencyMs: Math.round(spanStats?.avgLatencyMs || 0)
    }
  });
});
