/**
 * AetherTrace — Search & Developer UX API Routes
 */

import { Hono } from 'hono';
import {
  getDatabase,
  executeSearch,
  discoverErrors,
  getErrorCausalChain,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  rebuildSearchIndex,
  validateIdentifier
} from '@aethertrace/core-schema';

export const searchRouter = new Hono();

/**
 * GET /api/search - Global search across runs, spans, events, tools, models, and errors
 */
searchRouter.get('/', async (c) => {
  const { sqlite } = getDatabase();

  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const runId = c.req.query('run_id') || undefined;

  if (q.length > 500) {
    return c.json({ error: { message: 'Query string exceeds maximum allowed length of 500 characters' } }, 400);
  }

  if (runId) {
    const idValidation = validateIdentifier(runId, 'run_id');
    if (!idValidation.valid) {
      return c.json({ error: { message: idValidation.error } }, 400);
    }
  }

  try {
    const response = executeSearch(sqlite, q, { limit, offset, runId });
    return c.json(response);
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Search execution failed' } }, 500);
  }
});

/**
 * GET /api/search/errors - Cross-run error aggregation and discovery
 */
searchRouter.get('/errors', async (c) => {
  const { sqlite } = getDatabase();
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100);

  try {
    const errors = discoverErrors(sqlite, { limit });
    return c.json({ errors, count: errors.length });
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Error discovery failed' } }, 500);
  }
});

/**
 * GET /api/search/errors/:spanId/causal - Causal ancestry path for a specific error span
 */
searchRouter.get('/errors/:spanId/causal', async (c) => {
  const { sqlite } = getDatabase();
  const spanId = c.req.param('spanId');

  const idValidation = validateIdentifier(spanId, 'span_id');
  if (!idValidation.valid) {
    return c.json({ error: { message: idValidation.error } }, 400);
  }

  try {
    const chain = getErrorCausalChain(sqlite, spanId);
    if (!chain) {
      return c.json({ error: { message: `Span '${spanId}' not found` } }, 404);
    }
    return c.json(chain);
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Failed to retrieve causal chain' } }, 500);
  }
});

/**
 * GET /api/search/saved - List all saved searches
 */
searchRouter.get('/saved', async (c) => {
  const { sqlite } = getDatabase();
  try {
    const savedSearches = getSavedSearches(sqlite);
    return c.json({ savedSearches });
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Failed to fetch saved searches' } }, 500);
  }
});

/**
 * POST /api/search/saved - Create a new saved search
 */
searchRouter.post('/saved', async (c) => {
  const { sqlite } = getDatabase();
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: 'Invalid JSON body' } }, 400);
  }

  const name = (body.name || '').trim();
  const query = (body.query || '').trim();

  if (!name || name.length > 100) {
    return c.json({ error: { message: 'Name is required and must not exceed 100 characters' } }, 400);
  }
  if (!query || query.length > 500) {
    return c.json({ error: { message: 'Query is required and must not exceed 500 characters' } }, 400);
  }

  try {
    const saved = createSavedSearch(sqlite, name, query);
    return c.json({ savedSearch: saved }, 201);
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Failed to create saved search' } }, 500);
  }
});

/**
 * DELETE /api/search/saved/:id - Delete a saved search
 */
searchRouter.delete('/saved/:id', async (c) => {
  const { sqlite } = getDatabase();
  const id = c.req.param('id');

  const idValidation = validateIdentifier(id, 'saved_search_id');
  if (!idValidation.valid) {
    return c.json({ error: { message: idValidation.error } }, 400);
  }

  try {
    const deleted = deleteSavedSearch(sqlite, id);
    if (!deleted) {
      return c.json({ error: { message: `Saved search '${id}' not found` } }, 404);
    }
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Failed to delete saved search' } }, 500);
  }
});

/**
 * POST /api/search/rebuild - Rebuild search projection from authoritative trace database
 */
searchRouter.post('/rebuild', async (c) => {
  const { sqlite } = getDatabase();
  try {
    const result = rebuildSearchIndex(sqlite);
    return c.json({
      success: true,
      runs_indexed: result.runsIndexed,
      spans_indexed: result.spansIndexed,
      took_ms: result.tookMs
    });
  } catch (err: any) {
    return c.json({ error: { message: err?.message || 'Failed to rebuild search index' } }, 500);
  }
});
