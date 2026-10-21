import {
  type BreakpointConfig,
  type PendingBreakpoint,
  type BreakpointResolution
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';

interface PendingHold {
  spanId: string;
  runId: string;
  agentName: string;
  model: string;
  originalPayload: any;
  createdAt: number;
  resolve: (res: BreakpointResolution) => void;
  reject: (err: any) => void;
  timeoutId: NodeJS.Timeout;
}

let breakpointConfig: BreakpointConfig = {
  enabled: false,
  matchAgentNames: [],
  matchModels: []
};

const pendingBreakpoints = new Map<string, PendingHold>();

export function getBreakpointConfig(): BreakpointConfig {
  return { ...breakpointConfig };
}

export function updateBreakpointConfig(newConfig: Partial<BreakpointConfig>): BreakpointConfig {
  breakpointConfig = {
    ...breakpointConfig,
    ...newConfig,
    matchAgentNames: newConfig.matchAgentNames !== undefined ? [...newConfig.matchAgentNames] : breakpointConfig.matchAgentNames,
    matchModels: newConfig.matchModels !== undefined ? [...newConfig.matchModels] : breakpointConfig.matchModels
  };

  broadcastEvent({
    type: 'BREAKPOINT_CONFIG_UPDATED',
    data: breakpointConfig
  });

  return getBreakpointConfig();
}

export function shouldIntercept(agentName: string, model: string, hasHeaderBreakpoint: boolean): boolean {
  if (hasHeaderBreakpoint) {
    return true;
  }

  if (!breakpointConfig.enabled) {
    return false;
  }

  if (breakpointConfig.matchAgentNames.length > 0 && !breakpointConfig.matchAgentNames.includes(agentName)) {
    return false;
  }

  if (breakpointConfig.matchModels.length > 0 && !breakpointConfig.matchModels.includes(model)) {
    return false;
  }

  return true;
}

export function holdRequest(
  spanId: string,
  meta: { runId: string; agentName: string; model: string; originalPayload: any },
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
      model: meta.model,
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
        model: meta.model,
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
