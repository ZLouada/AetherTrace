import { Hono } from 'hono';
import {
  getDatabase,
  runEvaluation,
  getEvaluation,
  listEvaluations,
  deleteEvaluation,
  exportEvaluationAsJson,
  exportEvaluationAsMarkdown,
  type EvaluationTargetType,
  type AssertionRule
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';

export const evaluationsRouter = new Hono();

/**
 * POST /api/evaluations/run
 * Dispatches a deterministic evaluation against a run, experiment, or variant.
 */
evaluationsRouter.post('/run', async (c) => {
  try {
    const body = await c.req.json();
    const { targetType, targetId, name, description, rules, baselineRunId } = body;

    if (!targetType || !targetId) {
      return c.json({ error: 'Missing required targetType or targetId' }, 400);
    }

    const { db } = getDatabase();
    const report = await runEvaluation(db, {
      targetType: targetType as EvaluationTargetType,
      targetId,
      name,
      description,
      rules,
      baselineRunId
    });

    broadcastEvent({
      type: 'EVALUATION_COMPLETED',
      data: {
        id: report.id,
        name: report.name,
        targetType: report.targetType,
        targetId: report.targetId,
        status: report.status,
        score: report.score
      }
    });

    return c.json(report, 200);
  } catch (err: any) {
    return c.json({ error: err.message || 'Evaluation failed' }, 500);
  }
});

/**
 * GET /api/evaluations
 * Lists evaluation records with optional target filtering.
 */
evaluationsRouter.get('/', async (c) => {
  try {
    const targetType = c.req.query('targetType');
    const targetId = c.req.query('targetId');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;

    const { db } = getDatabase();
    const evals = listEvaluations(db, { targetType, targetId, limit });

    return c.json({ evaluations: evals }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/evaluations/:id
 * Retrieves full evaluation report by ID.
 */
evaluationsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { db } = getDatabase();
    const report = getEvaluation(db, id);

    if (!report) {
      return c.json({ error: `Evaluation '${id}' not found` }, 404);
    }

    return c.json(report, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/evaluations/target/:type/:id
 * Retrieves the latest evaluation for a specific target.
 */
evaluationsRouter.get('/target/:type/:id', async (c) => {
  try {
    const targetType = c.req.param('type');
    const targetId = c.req.param('id');
    const { db } = getDatabase();

    const evals = listEvaluations(db, { targetType, targetId, limit: 1 });
    if (evals.length === 0) {
      return c.json({ error: `No evaluations found for ${targetType} '${targetId}'` }, 404);
    }

    const report = getEvaluation(db, evals[0].id);
    return c.json(report, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * DELETE /api/evaluations/:id
 * Removes an evaluation record.
 */
evaluationsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { db } = getDatabase();
    const success = deleteEvaluation(db, id);

    if (!success) {
      return c.json({ error: `Evaluation '${id}' not found` }, 404);
    }

    return c.json({ success: true, deletedId: id }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/evaluations/:id/export
 * Exports an evaluation report in JSON or Markdown format.
 */
evaluationsRouter.get('/:id/export', async (c) => {
  try {
    const id = c.req.param('id');
    const format = (c.req.query('format') || 'json').toLowerCase();
    const { db } = getDatabase();
    const report = getEvaluation(db, id);

    if (!report) {
      return c.json({ error: `Evaluation '${id}' not found` }, 404);
    }

    if (format === 'markdown' || format === 'md') {
      const markdown = exportEvaluationAsMarkdown(report);
      return c.text(markdown, 200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="evaluation_${id}.md"`
      });
    }

    const json = exportEvaluationAsJson(report);
    return c.text(json, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="evaluation_${id}.json"`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
