import { Hono } from 'hono';
import {
  getBreakpointConfig,
  updateBreakpointConfig,
  getPendingBreakpoints,
  resolveBreakpoint
} from '../services/breakpoints.js';
import {
  getChaosConfig,
  updateChaosConfig
} from '../services/chaos.js';

export const controlRouter = new Hono();

// --- Breakpoint Controls ---

controlRouter.get('/breakpoints', (c) => {
  return c.json({
    config: getBreakpointConfig(),
    pending: getPendingBreakpoints()
  });
});

controlRouter.put('/breakpoints/config', async (c) => {
  try {
    const body = await c.req.json();
    const updated = updateBreakpointConfig(body);
    return c.json({ success: true, config: updated });
  } catch (err: any) {
    return c.json({ error: { message: err.message || 'Invalid config payload' } }, 400);
  }
});

controlRouter.post('/breakpoints/:spanId/resolve', async (c) => {
  const spanId = c.req.param('spanId');
  try {
    const body = await c.req.json();
    if (!body || !body.action || !['resume', 'mock', 'abort'].includes(body.action)) {
      return c.json({ error: { message: "Invalid action. Must be 'resume', 'mock', or 'abort'." } }, 400);
    }

    const success = resolveBreakpoint(spanId, {
      action: body.action,
      modifiedPayload: body.modifiedPayload,
      mockedResponse: body.mockedResponse,
      reason: body.reason
    });

    if (!success) {
      return c.json({ error: { message: `No pending held breakpoint found for spanId '${spanId}'` } }, 404);
    }

    return c.json({ success: true, spanId, action: body.action });
  } catch (err: any) {
    return c.json({ error: { message: err.message || 'Error resolving breakpoint' } }, 400);
  }
});

// --- Chaos Engineering Controls ---

controlRouter.get('/chaos/config', (c) => {
  return c.json({
    config: getChaosConfig()
  });
});

controlRouter.put('/chaos/config', async (c) => {
  try {
    const body = await c.req.json();
    const updated = updateChaosConfig(body);
    return c.json({ success: true, config: updated });
  } catch (err: any) {
    return c.json({ error: { message: err.message || 'Invalid chaos config payload' } }, 400);
  }
});
