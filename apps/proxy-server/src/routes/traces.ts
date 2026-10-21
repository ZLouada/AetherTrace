import { Hono } from 'hono';
import { eq, desc, asc, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  type TraceRun,
  type TraceSpan
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
