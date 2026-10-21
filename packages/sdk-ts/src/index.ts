import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  runId: string;
  runName: string;
  parentSpanId?: string | null;
  agentName?: string;
  maxBudgetUsd?: number;
  replayMode?: boolean;
  mockUpstream?: boolean;
}

export interface TraceRunOptions {
  runId?: string;
  maxBudgetUsd?: number;
  mockUpstream?: boolean;
  replayMode?: boolean;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Returns the currently active trace context if executing within a traceRun or traceAgent scope.
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Generates an HTTP headers dictionary containing the active trace propagation headers.
 */
export function getTraceHeaders(): Record<string, string> {
  const ctx = getTraceContext();
  if (!ctx) return {};

  const headers: Record<string, string> = {
    'X-Run-Id': ctx.runId,
    'X-Run-Name': ctx.runName,
    'X-Agent-Name': ctx.agentName || 'default-agent'
  };

  if (ctx.parentSpanId) {
    headers['X-Parent-Span-Id'] = ctx.parentSpanId;
  }
  if (typeof ctx.maxBudgetUsd === 'number') {
    headers['X-Max-Budget-USD'] = ctx.maxBudgetUsd.toString();
  }
  if (ctx.replayMode) {
    headers['X-Replay-Mode'] = 'true';
  }
  if (ctx.mockUpstream) {
    headers['X-Mock-Upstream'] = 'true';
  }

  return headers;
}

/**
 * Wraps an asynchronous operation in a top-level Trace Run context.
 * Automatically generates a runId (or uses provided) and propagates it to child agents and spans.
 */
export async function traceRun<T>(
  name: string,
  optionsOrFn: TraceRunOptions | (() => Promise<T>),
  maybeFn?: () => Promise<T>
): Promise<T> {
  let options: TraceRunOptions = {};
  let fn: () => Promise<T>;

  if (typeof optionsOrFn === 'function') {
    fn = optionsOrFn;
  } else {
    options = optionsOrFn;
    fn = maybeFn!;
  }

  const runId = options.runId || `run_${randomUUID()}`;
  const context: TraceContext = {
    runId,
    runName: name,
    parentSpanId: null,
    agentName: 'orchestrator',
    maxBudgetUsd: options.maxBudgetUsd,
    mockUpstream: options.mockUpstream,
    replayMode: options.replayMode
  };

  return traceStorage.run(context, fn);
}

/**
 * Sets the active agent name and parent span link within the current trace run.
 * Automatically nests DAG nodes based on calling structure.
 */
export async function traceAgent<T>(
  agentName: string,
  fn: (context: TraceContext) => Promise<T>
): Promise<T> {
  const current = getTraceContext();
  if (!current) {
    // If called outside traceRun, generate an ad-hoc session
    const adHoc: TraceContext = {
      runId: `run_adhoc_${randomUUID()}`,
      runName: `${agentName}-ad-hoc`,
      parentSpanId: null,
      agentName
    };
    return traceStorage.run(adHoc, () => fn(adHoc));
  }

  const nextContext: TraceContext = {
    ...current,
    agentName,
    parentSpanId: current.parentSpanId || null
  };

  return traceStorage.run(nextContext, () => fn(nextContext));
}

/**
 * Sets the parent_span_id for all subsequent calls within the provided block.
 */
export async function withSpan<T>(spanId: string, fn: () => Promise<T>): Promise<T> {
  const current = getTraceContext();
  if (!current) return fn();

  const nextContext: TraceContext = {
    ...current,
    parentSpanId: spanId
  };

  return traceStorage.run(nextContext, fn);
}

/**
 * Creates an enhanced global fetch that automatically injects AetherTrace propagation headers.
 */
export function createTracedFetch(proxyBaseUrl: string = 'http://localhost:4000'): typeof fetch {
  const cleanBase = proxyBaseUrl.replace(/\/$/, '');

  return async function tracedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Route relative or OpenAI paths to AetherTrace proxy
    if (urlString.startsWith('/') || urlString.startsWith('https://api.openai.com')) {
      const path = urlString.replace(/^https:\/\/api\.openai\.com/, '');
      urlString = `${cleanBase}${path.startsWith('/') ? path : `/${path}`}`;
    }

    const activeHeaders = getTraceHeaders();
    const existingHeaders = new Headers(init?.headers || {});

    for (const [k, v] of Object.entries(activeHeaders)) {
      if (!existingHeaders.has(k)) {
        existingHeaders.set(k, v);
      }
    }

    const response = await fetch(urlString, {
      ...init,
      headers: existingHeaders
    });

    return response;
  };
}

/**
 * Wraps an OpenAI client instance to route through the local AetherTrace proxy
 * and auto-inject AsyncLocalStorage headers.
 */
export function wrapOpenAI<T extends { baseURL?: string; customFetch?: any }>(
  client: T,
  options: { proxyBaseUrl?: string } = {}
): T {
  const proxyUrl = options.proxyBaseUrl || 'http://localhost:4000/v1';
  client.baseURL = proxyUrl;
  client.customFetch = createTracedFetch(options.proxyBaseUrl || 'http://localhost:4000');
  return client;
}

export class AetherTraceClient {
  public proxyBaseUrl: string;

  constructor(proxyBaseUrl: string = 'http://localhost:4000') {
    this.proxyBaseUrl = proxyBaseUrl;
  }

  public traceRun<T>(name: string, options: TraceRunOptions, fn: () => Promise<T>): Promise<T> {
    return traceRun(name, options, fn);
  }

  public traceAgent<T>(agentName: string, fn: (context: TraceContext) => Promise<T>): Promise<T> {
    return traceAgent(agentName, fn);
  }

  public fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return createTracedFetch(this.proxyBaseUrl)(input, init);
  }
}
