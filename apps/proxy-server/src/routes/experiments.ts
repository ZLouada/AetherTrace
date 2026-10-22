import { Hono } from 'hono';
import { eq, desc, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  experiments,
  experiment_variants,
  type TraceRun,
  type TraceSpan,
  type Experiment,
  type ExperimentVariant,
  createExperiment,
  getExperiment,
  listExperiments,
  deleteExperiment,
  createVariant,
  updateVariant,
  deleteVariant,
  getVariant,
  compareExperimentVariants,
  getReplayHistory,
  captureFullProvenance,
  classifyTool,
  evaluateToolExecution,
  estimateReplayCost,
  recordSecurityAudit,
  indexRun,
  indexSpan,
  type ExperimentMutation,
  type ReplayMode
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';

export const experimentsRouter = new Hono();

/**
 * Helper to execute a single variant replay deterministically.
 */
export async function executeVariantReplay(
  variantId: string,
  options: { confirmLive?: boolean } = {}
): Promise<{ success: boolean; newRunId: string; run: TraceRun }> {
  const { db, sqlite } = getDatabase();

  const variant = db.select().from(experiment_variants).where(eq(experiment_variants.id, variantId)).get();
  if (!variant) {
    throw new Error(`Variant '${variantId}' not found`);
  }

  const exp = db.select().from(experiments).where(eq(experiments.id, variant.experiment_id)).get();
  if (!exp) {
    throw new Error(`Experiment '${variant.experiment_id}' not found`);
  }

  const sourceRun = db.select().from(trace_runs).where(eq(trace_runs.id, variant.source_run_id)).get();
  if (!sourceRun) {
    throw new Error(`Source run '${variant.source_run_id}' not found`);
  }

  const allRunSpans = db
    .select()
    .from(trace_spans)
    .where(eq(trace_spans.run_id, variant.source_run_id))
    .orderBy(asc(trace_spans.created_at))
    .all();

  if (allRunSpans.length === 0) {
    throw new Error(`Source run '${variant.source_run_id}' has no spans`);
  }

  // Determine target span where fork / mutation takes effect
  let targetSpan: TraceSpan = allRunSpans[0];
  if (variant.fork_span_id) {
    const found = allRunSpans.find((s) => s.id === variant.fork_span_id);
    if (!found) {
      throw new Error(`Fork span '${variant.fork_span_id}' not found in source run '${variant.source_run_id}'`);
    }
    targetSpan = found;
  }

  const spanById = new Map<string, TraceSpan>();
  for (const s of allRunSpans) {
    spanById.set(s.id, s);
  }

  // 1. Trace topological ancestors: targetSpan.parent_span_id -> parent -> root
  const topologicalAncestors: TraceSpan[] = [];
  let currId = targetSpan.parent_span_id;
  const visited = new Set<string>();

  while (currId) {
    if (visited.has(currId)) {
      throw new Error('Cycle detected in span ancestry');
    }
    visited.add(currId);
    const parentSpan = spanById.get(currId);
    if (!parentSpan) break;
    topologicalAncestors.unshift(parentSpan);
    currId = parentSpan.parent_span_id;
  }

  // 2. Parse mutations
  let mutations: ExperimentMutation[] = [];
  try {
    mutations = JSON.parse(variant.mutations || '[]');
  } catch {}

  // 3. Security Check for Live Replay
  const isLive = variant.replay_mode === 'live_replay';
  if (isLive && !options.confirmLive) {
    const costEstimate = estimateReplayCost(allRunSpans);
    recordSecurityAudit({
      operation: 'replay_blocked',
      runId: variant.source_run_id,
      result: 'blocked',
      reason: 'Live replay requires explicit confirmation (confirmLive: true)',
      details: costEstimate
    });
    throw new Error('Live replay requires explicit confirmation (confirmLive: true)');
  }

  // Mark variant as running
  const now = Date.now();
  db.update(experiment_variants)
    .set({ status: 'running' })
    .where(eq(experiment_variants.id, variantId))
    .run();

  const newRunId = `run_var_${randomUUID()}`;
  const newRunName = `${exp.name} - ${variant.name}`;

  let provStr: string | null = null;
  try {
    provStr = JSON.stringify(captureFullProvenance());
  } catch {}

  const newRun: TraceRun = {
    id: newRunId,
    name: newRunName,
    status: 'running',
    total_tokens: 0,
    total_cost_usd: 0.0,
    parent_run_id: variant.source_run_id,
    forked_at_span_id: targetSpan.id,
    mutations: variant.mutations,
    provenance: provStr,
    created_at: now
  };

  db.insert(trace_runs).values(newRun).run();

  let accumulatedTokens = 0;
  let accumulatedCost = 0.0;
  const idMap = new Map<string, string>();

  // 4. Copy ancestor prefix (all cached, 0ms latency, $0.00 spend)
  for (const s of topologicalAncestors) {
    const copiedSpanId = `span_var_${randomUUID()}`;
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

  // Helper to resolve mutations for any span (targetSpan or downstream children)
  function resolveSpanMutations(s: TraceSpan) {
    const matching = mutations.filter(
      (m) => m.target_span_id === s.id || ((!m.target_span_id || m.target_span_id === 'root') && s.id === targetSpan.id)
    );

    if (matching.length === 0) {
      return {
        model: s.model,
        request_payload: s.request_payload,
        response_payload: s.response_payload,
        cost_usd: 0.0,
        latency_ms: 0,
        cache_hit: 1,
        execution_origin: 'cached_replay' as TraceSpan['execution_origin']
      };
    }

    let mutatedModel = s.model;
    let mutatedReq = s.request_payload;
    let mutatedRes = s.response_payload;
    let mutatedCost = s.cost_usd || 0.0;
    let mutatedLatency = s.latency_ms || 0;
    let mutatedOrigin: TraceSpan['execution_origin'] = 'modified';

    for (const m of matching) {
      if (m.type === 'model' || m.field === 'model') {
        mutatedModel = String(m.new_value);
        try {
          const parsed = JSON.parse(mutatedReq || '{}');
          parsed.model = mutatedModel;
          mutatedReq = JSON.stringify(parsed);
        } catch {}
        if (mutatedModel.includes('mini')) {
          mutatedCost = Number((mutatedCost * 0.05).toFixed(6));
        }
      } else if (m.type === 'prompt' || m.field === 'prompt' || m.field === 'messages' || m.field === 'system_prompt' || m.field === 'user_prompt') {
        const newPromptText = typeof m.new_value === 'string' ? m.new_value : JSON.stringify(m.new_value);
        try {
          const parsed = JSON.parse(mutatedReq || '{}');
          if (Array.isArray(m.new_value)) {
            parsed.messages = m.new_value;
          } else if (Array.isArray(parsed.messages)) {
            if (m.field === 'system_prompt') {
              const sys = parsed.messages.find((msg: any) => msg.role === 'system');
              if (sys) sys.content = newPromptText;
              else parsed.messages.unshift({ role: 'system', content: newPromptText });
            } else {
              const userMsg = [...parsed.messages].reverse().find((msg: any) => msg.role === 'user');
              if (userMsg) userMsg.content = newPromptText;
              else parsed.messages.push({ role: 'user', content: newPromptText });
            }
          } else {
            parsed.prompt = newPromptText;
          }
          mutatedReq = JSON.stringify(parsed);
        } catch {
          mutatedReq = JSON.stringify({ prompt: newPromptText });
        }
      } else if (m.type === 'tool_args' || m.field === 'tool_args' || m.field === 'arguments') {
        try {
          const parsed = JSON.parse(mutatedReq || '{}');
          parsed.arguments = m.new_value;
          mutatedReq = JSON.stringify(parsed);
        } catch {
          mutatedReq = typeof m.new_value === 'string' ? m.new_value : JSON.stringify(m.new_value);
        }
      } else if (m.type === 'mock_tool' || m.field === 'mock_tool' || m.field === 'mocked_response' || m.field === 'output') {
        mutatedOrigin = 'mocked';
        mutatedRes = typeof m.new_value === 'string' ? m.new_value : JSON.stringify(m.new_value);
        mutatedCost = 0.0;
        mutatedLatency = 0;
      } else if (m.type === 'custom_payload' || m.field === 'request_payload') {
        mutatedReq = typeof m.new_value === 'string' ? m.new_value : JSON.stringify(m.new_value);
      }
    }

    return {
      model: mutatedModel,
      request_payload: mutatedReq,
      response_payload: mutatedRes,
      cost_usd: mutatedCost,
      latency_ms: mutatedLatency,
      cache_hit: 0,
      execution_origin: mutatedOrigin
    };
  }

  // 5. Apply mutations to the target span
  const targetMappedParentId = targetSpan.parent_span_id
    ? (idMap.get(targetSpan.parent_span_id) || targetSpan.parent_span_id)
    : null;

  const copiedTargetSpanId = `span_var_${randomUUID()}`;
  idMap.set(targetSpan.id, copiedTargetSpanId);

  const targetMut = resolveSpanMutations(targetSpan);

  const copiedTargetSpan: TraceSpan = {
    ...targetSpan,
    id: copiedTargetSpanId,
    run_id: newRunId,
    parent_span_id: targetMappedParentId,
    model: targetMut.model,
    request_payload: targetMut.request_payload,
    response_payload: targetMut.response_payload,
    cache_hit: targetMut.cache_hit,
    latency_ms: targetMut.latency_ms,
    cost_usd: targetMut.cost_usd,
    execution_origin: targetMut.execution_origin,
    source_span_id: targetSpan.id,
    created_at: now
  };

  db.insert(trace_spans).values(copiedTargetSpan).run();
  accumulatedTokens += (copiedTargetSpan.prompt_tokens || 0) + (copiedTargetSpan.completion_tokens || 0);
  accumulatedCost += copiedTargetSpan.cost_usd || 0.0;

  // 6. Copy downstream spans (if replaying full or partial subtree)
  const targetIndex = allRunSpans.findIndex((s) => s.id === targetSpan.id);
  if (targetIndex !== -1 && targetIndex < allRunSpans.length - 1) {
    for (let i = targetIndex + 1; i < allRunSpans.length; i++) {
      const s = allRunSpans[i];
      // Only include if it is descendant of copied nodes
      const parentId = s.parent_span_id;
      if (parentId && idMap.has(parentId)) {
        const copiedChildId = `span_var_${randomUUID()}`;
        idMap.set(s.id, copiedChildId);
        const childMut = resolveSpanMutations(s);
        const copiedChild: TraceSpan = {
          ...s,
          id: copiedChildId,
          run_id: newRunId,
          parent_span_id: (parentId ? idMap.get(parentId) : null) ?? null,
          model: childMut.model,
          request_payload: childMut.request_payload,
          response_payload: childMut.response_payload,
          cache_hit: childMut.cache_hit,
          latency_ms: childMut.latency_ms,
          cost_usd: childMut.cost_usd,
          execution_origin: childMut.execution_origin,
          source_span_id: s.id,
          created_at: now + (s.created_at - targetSpan.created_at)
        };
        db.insert(trace_spans).values(copiedChild).run();
        accumulatedTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
        accumulatedCost += copiedChild.cost_usd || 0.0;
      }
    }
  }

  // 7. Complete the run
  db.update(trace_runs)
    .set({
      status: 'completed',
      total_tokens: accumulatedTokens,
      total_cost_usd: Number(accumulatedCost.toFixed(6))
    })
    .where(eq(trace_runs.id, newRunId))
    .run();

  const finishedRun = db.select().from(trace_runs).where(eq(trace_runs.id, newRunId)).get()!;

  // 8. Update variant status
  db.update(experiment_variants)
    .set({
      replay_run_id: newRunId,
      status: 'completed',
      completed_at: Date.now(),
      error_message: null
    })
    .where(eq(experiment_variants.id, variantId))
    .run();

  // Update experiment status based on all variants
  const allExpVariants = db
    .select()
    .from(experiment_variants)
    .where(eq(experiment_variants.experiment_id, variant.experiment_id))
    .all();
  const allDone = allExpVariants.length > 0 && allExpVariants.every((v) => v.status === 'completed' || v.status === 'failed');
  const finalStatus = allDone
    ? (allExpVariants.every((v) => v.status === 'failed') ? 'failed' : 'completed')
    : 'running';

  db.update(experiments)
    .set({
      status: finalStatus,
      updated_at: Date.now()
    })
    .where(eq(experiments.id, variant.experiment_id))
    .run();

  // Index for search
  try {
    indexRun(sqlite, finishedRun);
    const replayedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, newRunId)).all();
    for (const s of replayedSpans) {
      indexSpan(sqlite, s);
    }
  } catch {}

  broadcastEvent({
    type: 'RUN_CREATED',
    data: finishedRun,
    runId: newRunId
  });

  broadcastEvent({
    type: 'RUN_UPDATED',
    data: finishedRun,
    runId: newRunId
  });

  recordSecurityAudit({
    operation: 'replay_started',
    runId: newRunId,
    result: 'allowed',
    details: {
      experimentId: variant.experiment_id,
      variantId: variant.id,
      sourceRunId: variant.source_run_id,
      mutationsCount: mutations.length,
      mode: variant.replay_mode
    }
  });

  return {
    success: true,
    newRunId,
    run: finishedRun
  };
}

// ---------------------------------------------------------------------------------
// Routes: Experiment Management
// ---------------------------------------------------------------------------------

/**
 * GET /api/experiments - List all experiments with summary stats
 */
experimentsRouter.get('/experiments', (c) => {
  const { db } = getDatabase();
  const list = listExperiments(db);
  return c.json({
    success: true,
    count: list.length,
    experiments: list
  });
});

/**
 * GET /api/experiments/history - Persistent replay history across all runs & variants
 */
experimentsRouter.get('/experiments/history', (c) => {
  const { db } = getDatabase();
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const history = getReplayHistory(db, limit);
  return c.json({
    success: true,
    count: history.length,
    history
  });
});

/**
 * POST /api/experiments - Create a new experiment from a source run
 */
experimentsRouter.post('/experiments', async (c) => {
  const { db } = getDatabase();
  const body = await c.req.json().catch(() => ({}));

  const name = body.name || `Experiment ${new Date().toLocaleDateString()}`;
  const sourceRunId = body.sourceRunId || body.source_run_id;

  if (!sourceRunId) {
    return c.json({ error: { message: 'sourceRunId is required' } }, 400);
  }

  try {
    const exp = createExperiment(db, {
      name,
      description: body.description,
      sourceRunId,
      metadata: body.metadata
    });

    broadcastEvent({
      type: 'EXPERIMENT_CREATED',
      data: exp
    });

    return c.json({
      success: true,
      experiment: exp
    }, 201);
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 400);
  }
});

/**
 * GET /api/experiments/:id - Get experiment details with all variants
 */
experimentsRouter.get('/experiments/:id', (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');
  const exp = getExperiment(db, id);

  if (!exp) {
    return c.json({ error: { message: `Experiment '${id}' not found` } }, 404);
  }

  return c.json({
    success: true,
    experiment: exp
  });
});

/**
 * DELETE /api/experiments/:id - Delete an experiment and its variants
 */
experimentsRouter.delete('/experiments/:id', (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');
  const deleted = deleteExperiment(db, id);

  if (!deleted) {
    return c.json({ error: { message: `Experiment '${id}' not found` } }, 404);
  }

  return c.json({
    success: true,
    message: `Experiment '${id}' deleted`
  });
});

// ---------------------------------------------------------------------------------
// Routes: Experiment Variants
// ---------------------------------------------------------------------------------

/**
 * POST /api/experiments/:id/variants - Create a new variant for an experiment
 */
experimentsRouter.post('/experiments/:id/variants', async (c) => {
  const { db } = getDatabase();
  const experimentId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const name = body.name || `Variant ${Date.now().toString().slice(-4)}`;

  try {
    const variant = createVariant(db, {
      experimentId,
      name,
      description: body.description,
      forkSpanId: body.forkSpanId || body.fork_span_id,
      mutations: body.mutations,
      replayMode: body.replayMode || body.replay_mode
    });

    return c.json({
      success: true,
      variant
    }, 201);
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 400);
  }
});

/**
 * GET /api/experiments/:id/variants/:variantId - Get variant details
 */
experimentsRouter.get('/experiments/:id/variants/:variantId', (c) => {
  const { db } = getDatabase();
  const variantId = c.req.param('variantId');
  const variant = getVariant(db, variantId);

  if (!variant) {
    return c.json({ error: { message: `Variant '${variantId}' not found` } }, 404);
  }

  return c.json({
    success: true,
    variant
  });
});

/**
 * PUT /api/experiments/:id/variants/:variantId - Update a variant
 */
experimentsRouter.put('/experiments/:id/variants/:variantId', async (c) => {
  const { db } = getDatabase();
  const variantId = c.req.param('variantId');
  const body = await c.req.json().catch(() => ({}));

  try {
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.forkSpanId !== undefined || body.fork_span_id !== undefined) {
      updates.fork_span_id = body.forkSpanId || body.fork_span_id;
    }
    if (body.mutations !== undefined) {
      updates.mutations = typeof body.mutations === 'string' ? body.mutations : JSON.stringify(body.mutations);
    }
    if (body.replayMode !== undefined || body.replay_mode !== undefined) {
      updates.replay_mode = body.replayMode || body.replay_mode;
    }

    const updated = updateVariant(db, variantId, updates);
    return c.json({
      success: true,
      variant: updated
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 400);
  }
});

/**
 * DELETE /api/experiments/:id/variants/:variantId - Delete a variant
 */
experimentsRouter.delete('/experiments/:id/variants/:variantId', (c) => {
  const { db } = getDatabase();
  const variantId = c.req.param('variantId');
  const deleted = deleteVariant(db, variantId);

  if (!deleted) {
    return c.json({ error: { message: `Variant '${variantId}' not found` } }, 404);
  }

  return c.json({
    success: true,
    message: `Variant '${variantId}' deleted`
  });
});

/**
 * POST /api/experiments/:id/variants/:variantId/replay - Replay a single variant
 */
experimentsRouter.post('/experiments/:id/variants/:variantId/replay', async (c) => {
  const variantId = c.req.param('variantId');
  const body = await c.req.json().catch(() => ({}));

  try {
    const result = await executeVariantReplay(variantId, { confirmLive: body.confirm_live || body.confirmLive });
    return c.json({
      success: true,
      variantId,
      newRunId: result.newRunId,
      run: result.run
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 400);
  }
});

/**
 * POST /api/experiments/:id/run-all - Batch replay all variants with bounded concurrency
 */
experimentsRouter.post('/experiments/:id/run-all', async (c) => {
  const { db } = getDatabase();
  const experimentId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const confirmLive = body.confirm_live || body.confirmLive || false;

  const exp = getExperiment(db, experimentId);
  if (!exp) {
    return c.json({ error: { message: `Experiment '${experimentId}' not found` } }, 404);
  }

  const variants = exp.variants;
  if (variants.length === 0) {
    return c.json({ error: { message: 'Experiment has no variants to execute' } }, 400);
  }

  // Update experiment to running
  db.update(experiments)
    .set({ status: 'running', updated_at: Date.now() })
    .where(eq(experiments.id, experimentId))
    .run();

  broadcastEvent({
    type: 'EXPERIMENT_UPDATED',
    data: { id: experimentId, status: 'running' }
  });

  // Bounded concurrency pool (max 2 parallel workers to avoid resource exhaustion)
  const CONCURRENCY_LIMIT = 2;
  const results: Array<{ variantId: string; status: 'completed' | 'failed'; error?: string; newRunId?: string }> = [];

  let idx = 0;
  async function worker() {
    while (idx < variants.length) {
      const v = variants[idx++];
      try {
        const res = await executeVariantReplay(v.id, { confirmLive });
        results.push({ variantId: v.id, status: 'completed', newRunId: res.newRunId });
      } catch (err: any) {
        // Failure isolation: record failure on variant, continue pool
        db.update(experiment_variants)
          .set({ status: 'failed', error_message: err.message, completed_at: Date.now() })
          .where(eq(experiment_variants.id, v.id))
          .run();
        results.push({ variantId: v.id, status: 'failed', error: err.message });
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, variants.length) }, () => worker());
  await Promise.all(workers);

  const completedCount = results.filter((r) => r.status === 'completed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const finalExpStatus = failedCount === variants.length ? 'failed' : 'completed';

  db.update(experiments)
    .set({ status: finalExpStatus, updated_at: Date.now() })
    .where(eq(experiments.id, experimentId))
    .run();

  broadcastEvent({
    type: 'EXPERIMENT_UPDATED',
    data: { id: experimentId, status: finalExpStatus }
  });

  const refreshedExp = getExperiment(db, experimentId);

  return c.json({
    success: true,
    experimentId,
    status: finalExpStatus,
    executedCount: variants.length,
    completedCount,
    failedCount,
    results,
    experiment: refreshedExp
  });
});

/**
 * GET /api/experiments/:id/compare - Multi-variant comparison matrix vs source run
 */
experimentsRouter.get('/experiments/:id/compare', (c) => {
  const { db } = getDatabase();
  const id = c.req.param('id');

  try {
    const comparison = compareExperimentVariants(db, id);
    return c.json({
      success: true,
      comparison
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 400);
  }
});
