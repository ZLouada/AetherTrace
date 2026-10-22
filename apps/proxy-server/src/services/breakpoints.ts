import {
  type BreakpointConfig,
  type BreakpointCondition,
  type PendingBreakpoint,
  type BreakpointResolution,
  evaluateBreakpointCondition
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';
import { randomUUID } from 'node:crypto';

interface PendingHold {
  spanId: string;
  runId: string;
  agentName: string;
  model: string;
  spanType?: string;
  originalPayload: any;
  createdAt: number;
  resolve: (res: BreakpointResolution) => void;
  reject: (err: any) => void;
  timeoutId: NodeJS.Timeout;
}

let breakpointConfig: BreakpointConfig = {
  enabled: false,
  matchAgentNames: [],
  matchModels: [],
  conditions: []
};

const pendingBreakpoints = new Map<string, PendingHold>();

export function getBreakpointConfig(): BreakpointConfig {
  return {
    ...breakpointConfig,
    conditions: breakpointConfig.conditions ? [...breakpointConfig.conditions] : []
  };
}

export function updateBreakpointConfig(newConfig: Partial<BreakpointConfig>): BreakpointConfig {
  breakpointConfig = {
    ...breakpointConfig,
    ...newConfig,
    matchAgentNames: newConfig.matchAgentNames !== undefined ? [...newConfig.matchAgentNames] : breakpointConfig.matchAgentNames,
    matchModels: newConfig.matchModels !== undefined ? [...newConfig.matchModels] : breakpointConfig.matchModels,
    conditions: newConfig.conditions !== undefined ? [...newConfig.conditions] : (breakpointConfig.conditions || [])
  };

  broadcastEvent({
    type: 'BREAKPOINT_CONFIG_UPDATED',
    data: breakpointConfig
  });

  return getBreakpointConfig();
}

export function addBreakpointCondition(condition: Omit<BreakpointCondition, 'id'> & { id?: string }): BreakpointCondition {
  const newCond: BreakpointCondition = {
    id: condition.id || `cond_${randomUUID()}`,
    enabled: condition.enabled !== false,
    target: condition.target || 'all',
    field: condition.field,
    operator: condition.operator,
    value: condition.value
  };

  const currentConditions = breakpointConfig.conditions || [];
  updateBreakpointConfig({
    conditions: [...currentConditions, newCond]
  });

  return newCond;
}

export function removeBreakpointCondition(id: string): boolean {
  const currentConditions = breakpointConfig.conditions || [];
  const initialLength = currentConditions.length;
  const filtered = currentConditions.filter((c) => c.id !== id);
  if (filtered.length !== initialLength) {
    updateBreakpointConfig({ conditions: filtered });
    return true;
  }
  return false;
}

export function toggleBreakpointCondition(id: string, enabled?: boolean): boolean {
  const currentConditions = breakpointConfig.conditions || [];
  let found = false;
  const updated = currentConditions.map((c) => {
    if (c.id === id) {
      found = true;
      return { ...c, enabled: enabled !== undefined ? enabled : !c.enabled };
    }
    return c;
  });

  if (found) {
    updateBreakpointConfig({ conditions: updated });
    return true;
  }
  return false;
}

export interface InterceptContext {
  spanType?: string;
  agentName?: string;
  model?: string | null;
  costUsd?: number;
  latencyMs?: number;
  requestPayload?: any;
  responsePayload?: any;
  statusCode?: number;
  toolName?: string;
  [key: string]: any;
}

export function shouldIntercept(
  agentName: string,
  model: string | null | undefined,
  hasHeaderBreakpoint: boolean,
  extraContext?: InterceptContext
): boolean {
  if (hasHeaderBreakpoint) {
    return true;
  }

  if (!breakpointConfig.enabled) {
    return false;
  }

  if (breakpointConfig.matchAgentNames.length > 0 && !breakpointConfig.matchAgentNames.includes(agentName)) {
    return false;
  }

  if (breakpointConfig.matchModels.length > 0 && model && !breakpointConfig.matchModels.includes(model)) {
    return false;
  }

  const activeConditions = (breakpointConfig.conditions || []).filter((c) => c.enabled !== false);
  if (activeConditions.length > 0) {
    const evalContext: InterceptContext = {
      spanType: extraContext?.spanType || 'llm_call',
      agentName,
      model: model || null,
      ...extraContext
    };

    // Any matching active condition triggers breakpoint
    const matchesAny = activeConditions.some((cond) => evaluateBreakpointCondition(cond, evalContext));
    if (!matchesAny) {
      return false;
    }
  }

  return true;
}


export function holdRequest(
  spanId: string,
  meta: { runId: string; agentName: string; model?: string | null; spanType?: string; originalPayload: any },
  timeoutMs: number = 120000
): Promise<BreakpointResolution> {
  return new Promise<BreakpointResolution>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingBreakpoints.delete(spanId);
      broadcastEvent({
        type: 'BREAKPOINT_RESOLVED',
        data: { spanId, action: 'abort', reason: 'Breakpoint timed out awaiting operator response' },
        runId: meta.runId,
        spanId
      });
      resolve({ action: 'abort', reason: 'Breakpoint timed out awaiting operator response' });
    }, timeoutMs);

    pendingBreakpoints.set(spanId, {
      spanId,
      runId: meta.runId,
      agentName: meta.agentName,
      model: meta.model || 'unknown',
      spanType: meta.spanType || 'llm_call',
      originalPayload: meta.originalPayload,
      createdAt: Date.now(),
      resolve,
      reject,
      timeoutId
    });

    // Notify all connected UI clients that a breakpoint has been hit mid-flight
    broadcastEvent({
      type: 'BREAKPOINT_HIT',
      data: {
        spanId,
        runId: meta.runId,
        agentName: meta.agentName,
        model: meta.model || 'unknown',
        spanType: meta.spanType || 'llm_call',
        requestPayload: meta.originalPayload
      },
      runId: meta.runId,
      spanId
    });
  });
}


export function resolveBreakpoint(spanId: string, resolution: BreakpointResolution): boolean {
  const pending = pendingBreakpoints.get(spanId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pendingBreakpoints.delete(spanId);

  // Broadcast resolution to UI clients
  broadcastEvent({
    type: 'BREAKPOINT_RESOLVED',
    data: {
      spanId,
      runId: pending.runId,
      ...resolution
    },
    runId: pending.runId,
    spanId
  });

  pending.resolve(resolution);
  return true;
}

export function getPendingBreakpoints(): PendingBreakpoint[] {
  return Array.from(pendingBreakpoints.values()).map((p) => ({
    spanId: p.spanId,
    runId: p.runId,
    agentName: p.agentName,
    model: p.model,
    requestPayload: p.originalPayload,
    createdAt: p.createdAt
  }));
}

export function clearAllBreakpoints() {
  for (const [spanId, p] of pendingBreakpoints.entries()) {
    clearTimeout(p.timeoutId);
    p.resolve({ action: 'abort', reason: 'Breakpoint manager cleared' });
  }
  pendingBreakpoints.clear();
}
