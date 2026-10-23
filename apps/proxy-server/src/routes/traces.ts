import { Hono } from 'hono';
import { eq, desc, asc, and } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  computeRunDiff,
  getRunLineage,
  captureFullProvenance,
  compareRunProvenance,
  redactValue,
  truncateWithMetadata,
  validateIdentifier,
  validateTraceBundle,
  recordSecurityAudit,
  classifyTool,
  evaluateToolExecution,
  estimateReplayCost,
  indexSpan,
  indexRun,
  DEFAULT_LIMITS,
  analyzeExecutionIntelligence,
  mapAetherTraceToOtlp,
  parseAndImportOtlpJson,
  type TraceRun,
  type TraceSpan,
  type RunDiffResult,
  type SpanMutation,
  type RunProvenance,
  type ProvenanceComparisonResult,
  type ExecutionIntelligence
} from '@aethertrace/core-schema';

import { broadcastEvent } from '../broadcaster.js';
import { shouldIntercept, holdRequest } from '../services/breakpoints.js';

export const tracesRouter = new Hono();

function sanitizePayloadForStorage(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const redacted = redactValue(payload);
  const str = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
  const trunc = truncateWithMetadata(str, DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES);
  return trunc.text;
}


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

  let runProvenance: any = null;
  if (runs[0].provenance) {
    try {
      runProvenance = JSON.parse(runs[0].provenance);
    } catch {}
  }

  const bundle = {
    version: '1.0',
    exported_at: Date.now(),
    run: runs[0],
    provenance: runProvenance,
    spans
  };

  const safeBundle = redactValue(bundle);

  recordSecurityAudit({
    operation: 'trace_exported',
    runId: id,
    result: 'allowed',
    details: { spanCount: spans.length }
  });

  c.header('Content-Disposition', `attachment; filename="run_${id}.trace.json"`);
  c.header('Content-Type', 'application/json');
  return c.json(safeBundle);
});

/**
 * GET /api/runs/:id/export/otel - Export run as OpenTelemetry OTLP JSON (v1)
 */
tracesRouter.get('/runs/:id/export/otel', async (c) => {
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

  const otlpBundle = mapAetherTraceToOtlp(runs[0], spans);

  recordSecurityAudit({
    operation: 'otel_trace_exported',
    runId: id,
    result: 'allowed',
    details: { spanCount: spans.length, format: 'otlp_json' }
  });

  c.header('Content-Disposition', `attachment; filename="run_${id}.otel.json"`);
  c.header('Content-Type', 'application/json');
  return c.json(otlpBundle);
});

/**
 * POST /api/runs/import - Safely import and upsert a portable .trace.json bundle into local SQLite
 */
tracesRouter.post('/runs/import', async (c) => {
  const { db, sqlite } = getDatabase();

  const rawText = await c.req.text();
  if (Buffer.byteLength(rawText, 'utf-8') > DEFAULT_LIMITS.MAX_IMPORT_BYTES) {
    recordSecurityAudit({
      operation: 'trace_imported',
      result: 'blocked',
      reason: `Import bundle exceeds maximum limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`
    });
    return c.json({ error: { message: `Import payload exceeds limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)` } }, 400);
  }

  let body: any;
  try {
    body = JSON.parse(rawText);
  } catch (err) {
    return c.json({ error: { message: 'Invalid JSON payload in import request' } }, 400);
  }

  // Schema & Resource Validation
  const validation = validateTraceBundle(body);
  if (!validation.valid) {
    recordSecurityAudit({
      operation: 'trace_imported',
      result: 'blocked',
      reason: `Validation failed: ${validation.errors.join('; ')}`
    });
    return c.json({ error: { message: 'Trace validation failed', errors: validation.errors } }, 400);
  }

  const runData = body.run || body;
  const spansData = body.spans || [];

  const targetRunId = body.run_id_override || runData.id;
  const idCheck = validateIdentifier(targetRunId, 'targetRunId');
  if (!idCheck.valid) {
    return c.json({ error: { message: idCheck.error } }, 400);
  }

  const now = Date.now();

  const preparedRun: TraceRun = {
    id: targetRunId,
    name: body.run_name_override || runData.name || 'imported-run',
    status: runData.status || 'completed',
    total_tokens: runData.total_tokens || 0,
    total_cost_usd: runData.total_cost_usd || 0.0,
    parent_run_id: runData.parent_run_id || null,
    forked_at_span_id: runData.forked_at_span_id || null,
    mutations: typeof runData.mutations === 'string' ? runData.mutations : runData.mutations ? JSON.stringify(runData.mutations) : null,
    provenance: typeof body.provenance === 'string'
      ? body.provenance
      : body.provenance
        ? JSON.stringify(body.provenance)
        : typeof runData.provenance === 'string'
          ? runData.provenance
          : runData.provenance
            ? JSON.stringify(runData.provenance)
            : null,
    created_at: runData.created_at || now
  };

  // Perform atomic import transaction
  const importTx = sqlite.transaction(() => {
    // Delete existing run if conflicting to allow safe re-import / overwrite
    sqlite.prepare('DELETE FROM trace_spans WHERE run_id = ?').run(targetRunId);
    sqlite.prepare('DELETE FROM trace_runs WHERE id = ?').run(targetRunId);

    // Insert run
    db.insert(trace_runs).values(preparedRun).run();

    // If targetRunId is overridden, create an ID remapping dictionary so DAG parent_span_id stays intact
    const idMap = new Map<string, string>();
    if (targetRunId !== runData.id) {
      for (const rawSpan of spansData) {
        if (rawSpan.id) {
          idMap.set(rawSpan.id, `span_imp_${randomUUID()}`);
        }
      }
    }

    // Insert spans with sanitized and redacted payloads
    for (const rawSpan of spansData) {
      const newSpanId = idMap.get(rawSpan.id) || rawSpan.id;
      const remappedParentId = rawSpan.parent_span_id
        ? (idMap.get(rawSpan.parent_span_id) || rawSpan.parent_span_id)
        : null;

      const span: TraceSpan = {
        id: newSpanId,
        run_id: targetRunId,
        parent_span_id: remappedParentId,
        span_type: rawSpan.span_type || 'llm_call',
        agent_name: rawSpan.agent_name || 'default-agent',
        model: rawSpan.model || null,
        request_payload: sanitizePayloadForStorage(rawSpan.request_payload),
        response_payload: sanitizePayloadForStorage(rawSpan.response_payload),
        prompt_tokens: rawSpan.prompt_tokens || 0,
        completion_tokens: rawSpan.completion_tokens || 0,
        cost_usd: rawSpan.cost_usd || 0.0,
        latency_ms: rawSpan.latency_ms || 0,
        cache_hit: rawSpan.cache_hit || 0,
        execution_origin: rawSpan.execution_origin || (rawSpan.cache_hit ? 'cached_replay' : 'original'),
        source_span_id: rawSpan.source_span_id || null,
        usage_status: (rawSpan.usage_status as any) || 'reported',
        request_hash: rawSpan.request_hash || 'unknown',
        created_at: rawSpan.created_at || now
      };
      db.insert(trace_spans).values(span).run();
    }
  });

  importTx();

  try {
    indexRun(sqlite, preparedRun);
    const importedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, targetRunId)).all();
    for (const s of importedSpans) {
      indexSpan(sqlite, s);
    }
  } catch {}

  recordSecurityAudit({
    operation: 'trace_imported',
    runId: targetRunId,
    result: 'allowed',
    details: { spanCount: spansData.length }
  });

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
 * POST /api/runs/import/otel - Safely import an OpenTelemetry OTLP JSON (v1) trace into local SQLite
 */
tracesRouter.post('/runs/import/otel', async (c) => {
  const { db, sqlite } = getDatabase();

  const rawText = await c.req.text();
  if (Buffer.byteLength(rawText, 'utf-8') > DEFAULT_LIMITS.MAX_IMPORT_BYTES) {
    recordSecurityAudit({
      operation: 'otel_trace_imported',
      result: 'blocked',
      reason: `OTel import payload exceeds maximum limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`
    });
    return c.json({ error: { message: `Import payload exceeds limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)` } }, 400);
  }

  const runNameOverride = c.req.query('run_name') || undefined;
  const runIdOverride = c.req.query('run_id') || undefined;

  try {
    const result = parseAndImportOtlpJson(db, sqlite, rawText, {
      runNameOverride,
      runIdOverride
    });

    const run = db.select().from(trace_runs).where(eq(trace_runs.id, result.runId)).limit(1).all()[0];

    broadcastEvent({
      type: 'RUN_CREATED',
      data: run,
      runId: result.runId
    });

    return c.json({
      success: true,
      message: `OpenTelemetry trace '${result.runName}' (${result.runId}) imported successfully`,
      runId: result.runId,
      spanCount: result.spanCount,
      totalTokens: result.totalTokens,
      totalCostUsd: result.totalCostUsd,
      status: result.status,
      run
    }, 201);
  } catch (err: any) {
    return c.json({
      error: {
        message: err.message || 'Failed to import OpenTelemetry trace'
      }
    }, 400);
  }
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
 * POST /api/spans - Record an execution event (tool_call, agent_state, http_call, retry, etc.)
 */
tracesRouter.post('/spans', async (c) => {
  const { db, sqlite } = getDatabase();
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: 'Invalid JSON payload' } }, 400);
  }

  const runId = body.run_id || c.req.header('x-run-id') || `run_${randomUUID()}`;
  const runName = body.run_name || c.req.header('x-run-name') || 'default-run';
  const spanId = body.id || `span_${randomUUID()}`;

  const runIdCheck = validateIdentifier(runId, 'runId');
  if (!runIdCheck.valid) {
    return c.json({ error: { message: runIdCheck.error } }, 400);
  }
  const spanIdCheck = validateIdentifier(spanId, 'spanId');
  if (!spanIdCheck.valid) {
    return c.json({ error: { message: spanIdCheck.error } }, 400);
  }
  const parentSpanId = body.parent_span_id || c.req.header('x-parent-span-id') || null;
  if (parentSpanId) {
    const parentCheck = validateIdentifier(parentSpanId, 'parent_span_id');
    if (!parentCheck.valid) {
      return c.json({ error: { message: parentCheck.error } }, 400);
    }
  }

  const now = Date.now();

  const reqPayloadStr = typeof body.request_payload === 'string'
    ? body.request_payload
    : body.request_payload ? JSON.stringify(body.request_payload) : null;
  const resPayloadStr = typeof body.response_payload === 'string'
    ? body.response_payload
    : body.response_payload ? JSON.stringify(body.response_payload) : null;

  const requestHash = body.request_hash || createHash('sha256').update(reqPayloadStr || spanId).digest('hex');
  const promptTokens = Number(body.prompt_tokens) || 0;
  const completionTokens = Number(body.completion_tokens) || 0;
  const totalTokens = promptTokens + completionTokens;
  const costUsd = Number(body.cost_usd) || 0.0;
  const latencyMs = Number(body.latency_ms) || 0;

  const span: TraceSpan = {
    id: spanId,
    run_id: runId,
    parent_span_id: parentSpanId,
    span_type: body.span_type || 'tool_call',
    agent_name: body.agent_name || c.req.header('x-agent-name') || 'default-agent',
    model: body.model || null,
    request_payload: sanitizePayloadForStorage(reqPayloadStr),
    response_payload: sanitizePayloadForStorage(resPayloadStr),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: costUsd,
    latency_ms: latencyMs,
    cache_hit: body.cache_hit ? 1 : 0,
    execution_origin: body.execution_origin || (body.cache_hit ? 'cached_replay' : 'original'),
    source_span_id: body.source_span_id || null,
    usage_status: body.usage_status || (totalTokens > 0 ? 'reported' : 'unavailable'),
    request_hash: requestHash,
    created_at: body.created_at || now
  };

  const hasBreakpointHeader = c.req.header('x-breakpoint') === 'true' || c.req.header('x-breakpoint') === '1';
  const isHoldRequested = c.req.header('x-breakpoint-hold') === 'true' || c.req.query('hold') === 'true';

  let parsedReqObj: any = null;
  if (reqPayloadStr) {
    try { parsedReqObj = JSON.parse(reqPayloadStr); } catch {}
  }
  let parsedResObj: any = null;
  if (resPayloadStr) {
    try { parsedResObj = JSON.parse(resPayloadStr); } catch {}
  }

  const toolName = body.tool_name || parsedReqObj?.tool_name || parsedReqObj?.name;
  const statusCode = body.status_code || parsedResObj?.status_code;

  const shouldPause = shouldIntercept(span.agent_name, span.model, hasBreakpointHeader, {
    spanType: span.span_type,
    agentName: span.agent_name,
    model: span.model,
    costUsd: span.cost_usd || 0,
    latencyMs: span.latency_ms || 0,
    requestPayload: parsedReqObj || reqPayloadStr,
    responsePayload: parsedResObj || resPayloadStr,
    toolName,
    statusCode
  });

  const tx = sqlite.transaction(() => {
    // 1. Ensure run exists
    const existingRun = sqlite.prepare('SELECT id FROM trace_runs WHERE id = ?').get(runId);
    if (!existingRun) {
      let runProv: string | null = null;
      try {
        runProv = JSON.stringify(captureFullProvenance());
      } catch {}

      db.insert(trace_runs).values({
        id: runId,
        name: runName,
        status: shouldPause ? 'paused' : 'running',
        total_tokens: totalTokens,
        total_cost_usd: costUsd,
        parent_run_id: null,
        forked_at_span_id: null,
        provenance: runProv,
        created_at: now
      }).run();
    } else {
      if (shouldPause) {
        sqlite.prepare("UPDATE trace_runs SET status = 'paused' WHERE id = ?").run(runId);
      }
      if (totalTokens > 0 || costUsd > 0) {
        sqlite.prepare(`
          UPDATE trace_runs
          SET total_tokens = total_tokens + ?,
              total_cost_usd = total_cost_usd + ?
          WHERE id = ?
        `).run(totalTokens, costUsd, runId);
      }
    }

    // 2. Insert span
    db.insert(trace_spans).values(span).run();
  });

  tx();

  try {
    indexSpan(sqlite, span);
  } catch {}

  broadcastEvent({
    type: 'SPAN_CREATED',
    data: span,
    runId,
    spanId
  });

  if (shouldPause) {
    broadcastEvent({
      type: 'RUN_UPDATED',
      data: { id: runId, status: 'paused' },
      runId
    });

    const holdPromise = holdRequest(spanId, {
      runId,
      agentName: span.agent_name,
      model: span.model,
      spanType: span.span_type,
      originalPayload: parsedReqObj || reqPayloadStr
    });

    if (isHoldRequested) {
      await holdPromise;
    }
  }

  return c.json({
    success: true,
    runId,
    spanId,
    paused: shouldPause,
    span
  }, 201, {
    'X-Span-Id': spanId,
    'X-Run-Id': runId
  });
});

/**
 * POST /api/runs/:id/spans - Record an execution event scoped to a run
 */
tracesRouter.post('/runs/:id/spans', async (c) => {
  const runId = c.req.param('id');
  const runIdCheck = validateIdentifier(runId, 'runId');
  if (!runIdCheck.valid) {
    return c.json({ error: { message: runIdCheck.error } }, 400);
  }

  const { db, sqlite } = getDatabase();
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: 'Invalid JSON payload' } }, 400);
  }

  body.run_id = runId;
  const runName = body.run_name || c.req.header('x-run-name') || 'default-run';
  const spanId = body.id || `span_${randomUUID()}`;

  const spanIdCheck = validateIdentifier(spanId, 'spanId');
  if (!spanIdCheck.valid) {
    return c.json({ error: { message: spanIdCheck.error } }, 400);
  }
  const parentSpanId = body.parent_span_id || c.req.header('x-parent-span-id') || null;
  if (parentSpanId) {
    const parentCheck = validateIdentifier(parentSpanId, 'parent_span_id');
    if (!parentCheck.valid) {
      return c.json({ error: { message: parentCheck.error } }, 400);
    }
  }

  const now = Date.now();

  const reqPayloadStr = typeof body.request_payload === 'string'
    ? body.request_payload
    : body.request_payload ? JSON.stringify(body.request_payload) : null;
  const resPayloadStr = typeof body.response_payload === 'string'
    ? body.response_payload
    : body.response_payload ? JSON.stringify(body.response_payload) : null;

  const requestHash = body.request_hash || createHash('sha256').update(reqPayloadStr || spanId).digest('hex');
  const promptTokens = Number(body.prompt_tokens) || 0;
  const completionTokens = Number(body.completion_tokens) || 0;
  const totalTokens = promptTokens + completionTokens;
  const costUsd = Number(body.cost_usd) || 0.0;
  const latencyMs = Number(body.latency_ms) || 0;

  const span: TraceSpan = {
    id: spanId,
    run_id: runId,
    parent_span_id: parentSpanId,
    span_type: body.span_type || 'tool_call',
    agent_name: body.agent_name || c.req.header('x-agent-name') || 'default-agent',
    model: body.model || null,
    request_payload: sanitizePayloadForStorage(reqPayloadStr),
    response_payload: sanitizePayloadForStorage(resPayloadStr),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: costUsd,
    latency_ms: latencyMs,
    cache_hit: body.cache_hit ? 1 : 0,
    execution_origin: body.execution_origin || (body.cache_hit ? 'cached_replay' : 'original'),
    source_span_id: body.source_span_id || null,
    usage_status: body.usage_status || (totalTokens > 0 ? 'reported' : 'unavailable'),
    request_hash: requestHash,
    created_at: body.created_at || now
  };

  const hasBreakpointHeader = c.req.header('x-breakpoint') === 'true' || c.req.header('x-breakpoint') === '1';
  const isHoldRequested = c.req.header('x-breakpoint-hold') === 'true' || c.req.query('hold') === 'true';

  let parsedReqObj: any = null;
  if (reqPayloadStr) {
    try { parsedReqObj = JSON.parse(reqPayloadStr); } catch {}
  }
  let parsedResObj: any = null;
  if (resPayloadStr) {
    try { parsedResObj = JSON.parse(resPayloadStr); } catch {}
  }

  const toolName = body.tool_name || parsedReqObj?.tool_name || parsedReqObj?.name;
  const statusCode = body.status_code || parsedResObj?.status_code;

  const shouldPause = shouldIntercept(span.agent_name, span.model, hasBreakpointHeader, {
    spanType: span.span_type,
    agentName: span.agent_name,
    model: span.model,
    costUsd: span.cost_usd || 0,
    latencyMs: span.latency_ms || 0,
    requestPayload: parsedReqObj || reqPayloadStr,
    responsePayload: parsedResObj || resPayloadStr,
    toolName,
    statusCode
  });

  const tx = sqlite.transaction(() => {
    // 1. Ensure run exists
    const existingRun = sqlite.prepare('SELECT id FROM trace_runs WHERE id = ?').get(runId);
    if (!existingRun) {
      let runProv: string | null = null;
      try {
        runProv = JSON.stringify(captureFullProvenance());
      } catch {}

      db.insert(trace_runs).values({
        id: runId,
        name: runName,
        status: shouldPause ? 'paused' : 'running',
        total_tokens: totalTokens,
        total_cost_usd: costUsd,
        parent_run_id: null,
        forked_at_span_id: null,
        provenance: runProv,
        created_at: now
      }).run();
    } else {
      if (shouldPause) {
        sqlite.prepare("UPDATE trace_runs SET status = 'paused' WHERE id = ?").run(runId);
      }
      if (totalTokens > 0 || costUsd > 0) {
        sqlite.prepare(`
          UPDATE trace_runs
          SET total_tokens = total_tokens + ?,
              total_cost_usd = total_cost_usd + ?
          WHERE id = ?
        `).run(totalTokens, costUsd, runId);
      }
    }

    // 2. Insert span
    db.insert(trace_spans).values(span).run();
  });

  tx();

  try {
    indexSpan(sqlite, span);
  } catch {}

  broadcastEvent({
    type: 'SPAN_CREATED',
    data: span,
    runId,
    spanId
  });

  if (shouldPause) {
    broadcastEvent({
      type: 'RUN_UPDATED',
      data: { id: runId, status: 'paused' },
      runId
    });

    const holdPromise = holdRequest(spanId, {
      runId,
      agentName: span.agent_name,
      model: span.model,
      spanType: span.span_type,
      originalPayload: parsedReqObj || reqPayloadStr
    });

    if (isHoldRequested) {
      await holdPromise;
    }
  }

  return c.json({
    success: true,
    runId,
    spanId,
    paused: shouldPause,
    span
  }, 201, {
    'X-Span-Id': spanId,
    'X-Run-Id': runId
  });
});

/**
 * POST /api/spans/:id/fork - Time-Travel Replay Forking
 * Forks an execution DAG history from a specific span point into a new isolated run
 */
tracesRouter.post('/spans/:id/fork', async (c) => {
  const { db, sqlite } = getDatabase();
  const spanId = c.req.param('id');
  const spanIdCheck = validateIdentifier(spanId, 'spanId');
  if (!spanIdCheck.valid) {
    return c.json({ error: { message: spanIdCheck.error } }, 400);
  }

  const spans = db.select().from(trace_spans).where(eq(trace_spans.id, spanId)).limit(1).all();
  if (spans.length === 0) {
    return c.json({ error: { message: `Source span '${spanId}' not found` } }, 404);
  }

  const sourceSpan = spans[0];
  const sourceRuns = db.select().from(trace_runs).where(eq(trace_runs.id, sourceSpan.run_id)).limit(1).all();
  if (sourceRuns.length === 0) {
    return c.json({ error: { message: `Source run '${sourceSpan.run_id}' not found` } }, 404);
  }
  const sourceRun = sourceRuns[0];

  const body = await c.req.json().catch(() => ({}));

  // Sibling pruning: Strictly traverse topological lineage: sourceSpan.parent_span_id -> parent -> ... -> root
  const allRunSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, sourceSpan.run_id))
    .all();

  const spanById = new Map<string, TraceSpan>();
  for (const s of allRunSpans) {
    spanById.set(s.id, s);
  }

  const topologicalAncestors: TraceSpan[] = [];
  let currId = sourceSpan.parent_span_id;
  const visited = new Set<string>();

  while (currId) {
    if (visited.has(currId)) {
      return c.json({ error: { message: 'Invalid ancestry lineage: cycle detected' } }, 400);
    }
    visited.add(currId);
    const parentSpan = spanById.get(currId);
    if (!parentSpan) break;
    topologicalAncestors.unshift(parentSpan); // Root -> parent chronological order
    currId = parentSpan.parent_span_id;
  }

  // Mutation tracking
  const mutations: SpanMutation[] = [];
  let targetModel = sourceSpan.model;
  let targetRequestPayload = sourceSpan.request_payload;

  if (body.modified_model && body.modified_model !== sourceSpan.model) {
    mutations.push({
      span_id: sourceSpan.id,
      field: 'model',
      before: sourceSpan.model,
      after: body.modified_model
    });
    targetModel = body.modified_model;
  }

  if (body.modified_prompt || body.prompt) {
    const newPrompt = body.modified_prompt || body.prompt;
    let oldPrompt = '';
    try {
      const parsedReq = JSON.parse(sourceSpan.request_payload || '{}');
      const messages = parsedReq.messages || [];
      const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
      oldPrompt = lastUser?.content || '';
      if (lastUser) {
        lastUser.content = newPrompt;
      } else {
        messages.push({ role: 'user', content: newPrompt });
      }
      parsedReq.messages = messages;
      if (body.modified_model) parsedReq.model = body.modified_model;
      targetRequestPayload = JSON.stringify(parsedReq);
    } catch {
      targetRequestPayload = JSON.stringify({ prompt: newPrompt });
    }

    mutations.push({
      span_id: sourceSpan.id,
      field: 'prompt',
      before: oldPrompt,
      after: newPrompt
    });
  }

  if (body.modified_payload) {
    mutations.push({
      span_id: sourceSpan.id,
      field: 'request_payload',
      before: sourceSpan.request_payload,
      after: typeof body.modified_payload === 'string' ? body.modified_payload : JSON.stringify(body.modified_payload)
    });
    targetRequestPayload = typeof body.modified_payload === 'string' ? body.modified_payload : JSON.stringify(body.modified_payload);
  }

  if (Array.isArray(body.mutations)) {
    for (const m of body.mutations) {
      mutations.push({
        span_id: m.span_id || sourceSpan.id,
        field: m.field,
        before: m.before,
        after: m.after
      });
    }
  }

  const includeSource = body.include_source === true || mutations.length > 0;

  const newRunId = `run_${randomUUID()}`;
  const now = Date.now();
  const newRunName = body.new_run_name || `fork-${sourceRun?.name || 'run'}-${spanId.slice(0, 8)}`;

  let forkProv: string | null = null;
  try {
    forkProv = JSON.stringify(captureFullProvenance());
  } catch {}

  // 1. Create new run with parent_run_id, forked_at_span_id, and mutations audit
  const newRun: TraceRun = {
    id: newRunId,
    name: newRunName,
    status: 'running',
    total_tokens: 0,
    total_cost_usd: 0.0, // Cached prefix contributes $0.00 actual spend
    parent_run_id: sourceSpan.run_id,
    forked_at_span_id: spanId,
    mutations: mutations.length > 0 ? JSON.stringify(mutations) : null,
    provenance: forkProv,
    created_at: now
  };

  db.insert(trace_runs).values(newRun).run();

  let accumulatedTokens = 0;
  const idMap = new Map<string, string>();

  // Copy ancestor prefix (all cached, 0ms, $0.00)
  for (const s of topologicalAncestors) {
    const copiedSpanId = `span_${randomUUID()}`;
    idMap.set(s.id, copiedSpanId);

    const mappedParentId = s.parent_span_id ? (idMap.get(s.parent_span_id) || s.parent_span_id) : null;
    const copiedSpan: TraceSpan = {
      ...s,
      id: copiedSpanId,
      run_id: newRunId,
      parent_span_id: mappedParentId,
      cache_hit: 1,
      latency_ms: 0,
      cost_usd: 0.0,
      execution_origin: 'cached_replay',
      source_span_id: s.id,
      created_at: now
    };
    db.insert(trace_spans).values(copiedSpan).run();

    accumulatedTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
  }

  // Copy target span if included
  let lastCopiedSpanId = topologicalAncestors.length > 0 ? idMap.get(topologicalAncestors[topologicalAncestors.length - 1].id) || null : null;

  if (includeSource) {
    const copiedSourceSpanId = `span_${randomUUID()}`;
    idMap.set(sourceSpan.id, copiedSourceSpanId);
    lastCopiedSpanId = copiedSourceSpanId;

    const mappedParentId = sourceSpan.parent_span_id ? (idMap.get(sourceSpan.parent_span_id) || sourceSpan.parent_span_id) : null;
    const isModified = mutations.length > 0;

    const copiedSourceSpan: TraceSpan = {
      ...sourceSpan,
      id: copiedSourceSpanId,
      run_id: newRunId,
      parent_span_id: mappedParentId,
      model: targetModel,
      request_payload: targetRequestPayload,
      cache_hit: isModified ? 0 : 1,
      latency_ms: 0,
      cost_usd: 0.0,
      execution_origin: isModified ? 'modified' : 'cached_replay',
      source_span_id: sourceSpan.id,
      created_at: now
    };
    db.insert(trace_spans).values(copiedSourceSpan).run();
    accumulatedTokens += (sourceSpan.prompt_tokens || 0) + (sourceSpan.completion_tokens || 0);
  }

  db.update(trace_runs)
    .set({
      total_tokens: accumulatedTokens,
      total_cost_usd: 0.0 // Cached prefix contributes zero actual spend
    })
    .where(eq(trace_runs.id, newRunId))
    .run();

  try {
    indexRun(sqlite, newRun);
    const replayedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, newRunId)).all();
    for (const s of replayedSpans) {
      indexSpan(sqlite, s);
    }
  } catch {}

  broadcastEvent({
    type: 'RUN_CREATED',
    data: newRun,
    runId: newRunId
  });

  recordSecurityAudit({
    operation: 'fork_created',
    runId: newRunId,
    result: 'allowed',
    details: {
      sourceRunId: sourceSpan.run_id,
      sourceSpanId: spanId,
      mutationsCount: mutations.length
    }
  });

  return c.json({
    success: true,
    message: `Forked run successfully from span '${spanId}'`,
    originalSpanId: spanId,
    originalRunId: sourceSpan.run_id,
    newRunId,
    new_run_id: newRunId,
    copiedSpansCount: topologicalAncestors.length + (includeSource ? 1 : 0),
    lastCopiedSpanId,
    mutations,
    run: newRun
  }, 201);
});

/**
 * POST /api/spans/:id/replay - Replay execution from a specific historical span
 */
tracesRouter.post('/spans/:id/replay', async (c) => {
  const spanId = c.req.param('id');
  const spanIdCheck = validateIdentifier(spanId, 'spanId');
  if (!spanIdCheck.valid) {
    return c.json({ error: { message: spanIdCheck.error } }, 400);
  }

  const { db, sqlite } = getDatabase();

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const sourceSpan = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.id, spanId))
    .get();

  if (!sourceSpan) {
    return c.json({ error: { message: `Source span '${spanId}' not found` } }, 404);
  }

  const originalRun = db
    .select()
    .from(trace_runs)
    .where(eq(trace_runs.id, sourceSpan.run_id))
    .get();

  if (!originalRun) {
    return c.json({ error: { message: `Source run '${sourceSpan.run_id}' not found` } }, 404);
  }

  // Find topological ancestors leading up to and including sourceSpan
  const allRunSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, sourceSpan.run_id))
    .all();

  const spanById = new Map<string, TraceSpan>();
  for (const s of allRunSpans) {
    spanById.set(s.id, s);
  }

  const topologicalAncestors: TraceSpan[] = [];
  let currId = sourceSpan.parent_span_id;
  const visited = new Set<string>();

  while (currId) {
    if (visited.has(currId)) {
      return c.json({ error: { message: 'Invalid ancestry lineage: cycle detected' } }, 400);
    }
    visited.add(currId);
    const parentSpan = spanById.get(currId);
    if (!parentSpan) break;
    topologicalAncestors.unshift(parentSpan);
    currId = parentSpan.parent_span_id;
  }

  // Include the target span in replay prefix
  topologicalAncestors.push(sourceSpan);

  // Safety confirmation check
  const isLive = body.mode === 'live_replay' || body.live === true;
  if (isLive && body.confirm_live !== true) {
    const costEstimate = estimateReplayCost(topologicalAncestors);
    recordSecurityAudit({
      operation: 'replay_blocked',
      runId: sourceSpan.run_id,
      result: 'blocked',
      reason: 'Live replay requires explicit confirmation (confirm_live: true)',
      details: costEstimate
    });
    return c.json({
      error: {
        message: 'Live replay requires explicit confirmation (confirm_live: true)',
        estimate: costEstimate
      }
    }, 400);
  }

  const now = Date.now();
  const newRunId = `run_replay_${randomUUID()}`;
  const newRunName = body.new_run_name || `Replay of ${originalRun.name || sourceSpan.agent_name}`;

  let replayProv: string | null = null;
  try {
    replayProv = JSON.stringify(captureFullProvenance());
  } catch {}

  const newRun: TraceRun = {
    id: newRunId,
    name: newRunName,
    status: 'running',
    total_tokens: 0,
    total_cost_usd: 0.0,
    parent_run_id: sourceSpan.run_id,
    forked_at_span_id: sourceSpan.id,
    mutations: null,
    provenance: replayProv,
    created_at: now
  };

  db.insert(trace_runs).values(newRun).run();

  let accumulatedTokens = 0;
  const idMap = new Map<string, string>();

  for (const s of topologicalAncestors) {
    const copiedSpanId = `span_rep_${randomUUID()}`;
    idMap.set(s.id, copiedSpanId);

    const mappedParentId = s.parent_span_id ? (idMap.get(s.parent_span_id) || s.parent_span_id) : null;
    const copiedSpan: TraceSpan = {
      ...s,
      id: copiedSpanId,
      run_id: newRunId,
      parent_span_id: mappedParentId,
      cache_hit: 1, // Replayed 0ms cache hit
      latency_ms: 0, // 0ms cached latency
      cost_usd: 0.0, // $0.00 cached spend
      execution_origin: 'cached_replay',
      source_span_id: s.id,
      created_at: now
    };
    db.insert(trace_spans).values(copiedSpan).run();

    accumulatedTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
  }

  db.update(trace_runs)
    .set({
      total_tokens: accumulatedTokens,
      total_cost_usd: 0.0 // Replayed cached prefix incurs $0.00 new spend
    })
    .where(eq(trace_runs.id, newRunId))
    .run();

  try {
    indexRun(sqlite, newRun);
    const forkedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, newRunId)).all();
    for (const s of forkedSpans) {
      indexSpan(sqlite, s);
    }
  } catch {}

  broadcastEvent({
    type: 'RUN_CREATED',
    data: newRun,
    runId: newRunId
  });

  recordSecurityAudit({
    operation: 'replay_started',
    runId: newRunId,
    result: 'allowed',
    details: {
      sourceSpanId: spanId,
      sourceRunId: sourceSpan.run_id,
      mode: isLive ? 'live_replay' : (body.mode || 'cache_only')
    }
  });

  return c.json({
    success: true,
    message: `Replay run created successfully from span '${spanId}'`,
    originalSpanId: spanId,
    originalRunId: sourceSpan.run_id,
    newRunId,
    new_run_id: newRunId,
    replayedSpansCount: topologicalAncestors.length,
    run: newRun
  }, 201);
});

/**
 * POST /api/runs/:id/replay - Exact Replay of an entire run
 */
tracesRouter.post('/runs/:id/replay', async (c) => {
  const runId = c.req.param('id');
  const runIdCheck = validateIdentifier(runId, 'runId');
  if (!runIdCheck.valid) {
    return c.json({ error: { message: runIdCheck.error } }, 400);
  }

  const { db, sqlite } = getDatabase();

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const sourceRun = db
    .select()
    .from(trace_runs)
    .where(eq(trace_runs.id, runId))
    .get();

  if (!sourceRun) {
    return c.json({ error: { message: `Source run '${runId}' not found` } }, 404);
  }

  const allRunSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, runId))
    .orderBy(asc(trace_spans.created_at))
    .all();

  const isLive = body.mode === 'live_replay' || body.live === true;
  if (isLive && body.confirm_live !== true) {
    const costEstimate = estimateReplayCost(allRunSpans);
    recordSecurityAudit({
      operation: 'replay_blocked',
      runId,
      result: 'blocked',
      reason: 'Live replay requires explicit confirmation (confirm_live: true)',
      details: costEstimate
    });
    return c.json({
      error: {
        message: 'Live replay requires explicit confirmation (confirm_live: true)',
        estimate: costEstimate
      }
    }, 400);
  }

  const now = Date.now();
  const newRunId = `run_replay_${randomUUID()}`;
  const newRunName = body.new_run_name || `Replay of ${sourceRun.name}`;

  let replayProv: string | null = null;
  try {
    replayProv = JSON.stringify(captureFullProvenance());
  } catch {}

  const newRun: TraceRun = {
    id: newRunId,
    name: newRunName,
    status: 'running',
    total_tokens: 0,
    total_cost_usd: 0.0,
    parent_run_id: sourceRun.id,
    forked_at_span_id: allRunSpans[0]?.id || null,
    mutations: null,
    provenance: replayProv,
    created_at: now
  };

  db.insert(trace_runs).values(newRun).run();

  let accumulatedTokens = 0;
  const idMap = new Map<string, string>();

  for (const s of allRunSpans) {
    const copiedSpanId = `span_rep_${randomUUID()}`;
    idMap.set(s.id, copiedSpanId);

    const mappedParentId = s.parent_span_id ? (idMap.get(s.parent_span_id) || s.parent_span_id) : null;
    const copiedSpan: TraceSpan = {
      ...s,
      id: copiedSpanId,
      run_id: newRunId,
      parent_span_id: mappedParentId,
      cache_hit: 1,
      latency_ms: 0,
      cost_usd: 0.0,
      execution_origin: 'cached_replay',
      source_span_id: s.id,
      created_at: now
    };
    db.insert(trace_spans).values(copiedSpan).run();

    accumulatedTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
  }

  db.update(trace_runs)
    .set({
      total_tokens: accumulatedTokens,
      total_cost_usd: 0.0
    })
    .where(eq(trace_runs.id, newRunId))
    .run();

  try {
    indexRun(sqlite, newRun);
    const replayedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, newRunId)).all();
    for (const s of replayedSpans) {
      indexSpan(sqlite, s);
    }
  } catch {}

  broadcastEvent({
    type: 'RUN_CREATED',
    data: newRun,
    runId: newRunId
  });

  recordSecurityAudit({
    operation: 'replay_started',
    runId: newRunId,
    result: 'allowed',
    details: {
      sourceRunId: runId,
      mode: isLive ? 'live_replay' : (body.mode || 'cache_only')
    }
  });

  return c.json({
    success: true,
    message: `Exact replay run created successfully for run '${runId}'`,
    originalRunId: runId,
    newRunId,
    new_run_id: newRunId,
    replayedSpansCount: allRunSpans.length,
    run: newRun
  }, 201);
});

/**
 * GET /api/runs/:id/lineage - Multi-generation ancestry and descendant tree
 */
tracesRouter.get('/runs/:id/lineage', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');
  const allRuns = db.select().from(trace_runs).all();
  const lineage = getRunLineage(allRuns, id);
  if (!lineage.current) {
    return c.json({ error: { message: `Run '${id}' not found` } }, 404);
  }

  let mutations: SpanMutation[] = [];
  if (lineage.current.run.mutations) {
    try {
      mutations = JSON.parse(lineage.current.run.mutations);
    } catch {}
  }

  const depth = lineage.ancestors.length;
  const root = lineage.ancestors[0]?.run || lineage.current.run;
  const ancestors = lineage.ancestors.map((a) => a.run);
  const descendants = lineage.descendants.map((d) => d.run);

  return c.json({
    success: true,
    runId: id,
    depth,
    root,
    ancestors,
    descendants,
    lineage,
    mutations
  });
});

/**
 * GET /api/runs/:id/intelligence - Deterministic Agent Intelligence analysis
 */
tracesRouter.get('/runs/:id/intelligence', async (c) => {
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

  const intelligence = analyzeExecutionIntelligence(spans, runs[0]);

  return c.json({
    success: true,
    runId: id,
    intelligence
  });
});


/**
 * POST /api/runs/:id/pause - Pause an active execution run
 */
tracesRouter.post('/runs/:id/pause', async (c) => {
  const runId = c.req.param('id');
  const { db } = getDatabase();

  const run = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).get();
  if (!run) return c.json({ error: { message: `Run '${runId}' not found` } }, 404);

  db.update(trace_runs).set({ status: 'paused' }).where(eq(trace_runs.id, runId)).run();

  broadcastEvent({
    type: 'RUN_UPDATED',
    data: { id: runId, status: 'paused' },
    runId
  });

  return c.json({ success: true, runId, status: 'paused' });
});

/**
 * POST /api/runs/:id/resume - Resume a paused execution run
 */
tracesRouter.post('/runs/:id/resume', async (c) => {
  const runId = c.req.param('id');
  const { db } = getDatabase();

  const run = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).get();
  if (!run) return c.json({ error: { message: `Run '${runId}' not found` } }, 404);

  db.update(trace_runs).set({ status: 'running' }).where(eq(trace_runs.id, runId)).run();

  broadcastEvent({
    type: 'RUN_UPDATED',
    data: { id: runId, status: 'running' },
    runId
  });

  return c.json({ success: true, runId, status: 'running' });
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

/**
 * GET /api/runs/:id/provenance - Run provenance and environment comparison
 */
tracesRouter.get('/runs/:id/provenance', async (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, id)).limit(1).all();
  if (runs.length === 0) {
    return c.json({ error: { message: `Run '${id}' not found` } }, 404);
  }

  let runProvenance: RunProvenance | null = null;
  if (runs[0].provenance) {
    try {
      runProvenance = JSON.parse(runs[0].provenance);
    } catch {}
  }

  const currentProvenance = captureFullProvenance();
  const comparison = compareRunProvenance(runProvenance, currentProvenance);

  return c.json({
    success: true,
    runId: id,
    provenance: runProvenance,
    current: currentProvenance,
    comparison
  });
});
