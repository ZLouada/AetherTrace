import { Hono } from 'hono';
import {
  isForbiddenProperty,
  validateIdentifier,
  recordSecurityAudit
} from '@aethertrace/core-schema';
import {
  getBreakpointConfig,
  updateBreakpointConfig,
  getPendingBreakpoints,
  resolveBreakpoint,
  addBreakpointCondition,
  removeBreakpointCondition,
  toggleBreakpointCondition
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
    if (Array.isArray(body?.conditions)) {
      for (const cond of body.conditions) {
        if (typeof cond.field === 'string' && cond.field.split('.').some((p: string) => isForbiddenProperty(p))) {
          recordSecurityAudit({
            operation: 'breakpoint_condition_blocked',
            result: 'blocked',
            reason: `Forbidden property in breakpoint condition field: ${cond.field}`
          });
          return c.json({ error: { message: 'Condition field cannot target forbidden prototype or runtime properties' } }, 400);
        }
      }
    }
    const updated = updateBreakpointConfig(body);
    return c.json({ success: true, config: updated });
  } catch (err: any) {
    return c.json({ error: { message: err.message || 'Invalid config payload' } }, 400);
  }
});

controlRouter.post('/breakpoints/conditions', async (c) => {
  try {
    const body = await c.req.json();
    if (!body || !body.field || !body.operator) {
      return c.json({ error: { message: 'Condition requires field and operator' } }, 400);
    }
    if (typeof body.field === 'string' && body.field.split('.').some((p: string) => isForbiddenProperty(p))) {
      recordSecurityAudit({
        operation: 'breakpoint_condition_blocked',
        result: 'blocked',
        reason: `Forbidden property in breakpoint condition field: ${body.field}`
      });
      return c.json({ error: { message: 'Condition field cannot target forbidden prototype or runtime properties' } }, 400);
    }
    const condition = addBreakpointCondition(body);
    return c.json({ success: true, condition, config: getBreakpointConfig() }, 201);
  } catch (err: any) {
    return c.json({ error: { message: err.message || 'Failed to add condition' } }, 400);
  }
});

controlRouter.delete('/breakpoints/conditions/:id', (c) => {
  const id = c.req.param('id');
  const idCheck = validateIdentifier(id, 'conditionId');
  if (!idCheck.valid) {
    return c.json({ error: { message: idCheck.error } }, 400);
  }
  const removed = removeBreakpointCondition(id);
  if (!removed) {
    return c.json({ error: { message: `Condition '${id}' not found` } }, 404);
  }
  return c.json({ success: true, id, config: getBreakpointConfig() });
});

controlRouter.post('/breakpoints/conditions/:id/toggle', async (c) => {
  const id = c.req.param('id');
  const idCheck = validateIdentifier(id, 'conditionId');
  if (!idCheck.valid) {
    return c.json({ error: { message: idCheck.error } }, 400);
  }
  let enabled: boolean | undefined = undefined;
  try {
    const body = await c.req.json();
    if (typeof body?.enabled === 'boolean') {
      enabled = body.enabled;
    }
  } catch {}
  const toggled = toggleBreakpointCondition(id, enabled);
  if (!toggled) {
    return c.json({ error: { message: `Condition '${id}' not found` } }, 404);
  }
  return c.json({ success: true, id, config: getBreakpointConfig() });
});


controlRouter.post('/breakpoints/:spanId/resolve', async (c) => {
  const spanId = c.req.param('spanId');
  const spanIdCheck = validateIdentifier(spanId, 'spanId');
  if (!spanIdCheck.valid) {
    return c.json({ error: { message: spanIdCheck.error } }, 400);
  }
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
