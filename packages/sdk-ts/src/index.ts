import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  runId: string;
  runName: string;
  parentSpanId?: string | null;
  agentName?: string;
  parentAgentName?: string;
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
 * Resolves default proxy URL from environment variables, supporting Vercel service bindings.
 */
export function getDefaultProxyUrl(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.PROXY_SERVER_URL) return process.env.PROXY_SERVER_URL;
    if (process.env.AETHERTRACE_URL) return process.env.AETHERTRACE_URL;
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:4000';
}

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

export interface TraceAgentOptions {
  parentSpanId?: string | null;
  role?: string;
  task?: string;
}

/**
 * Sets the active agent name and parent span link within the current trace run.
 * Automatically nests DAG nodes based on calling structure.
 */
export async function traceAgent<T>(
  agentName: string,
  optionsOrFn: TraceAgentOptions | ((context: TraceContext) => Promise<T>),
  maybeFn?: (context: TraceContext) => Promise<T>
): Promise<T> {
  let options: TraceAgentOptions = {};
  let fn: (context: TraceContext) => Promise<T>;

  if (typeof optionsOrFn === 'function') {
    fn = optionsOrFn;
  } else {
    options = optionsOrFn;
    fn = maybeFn!;
  }

  const current = getTraceContext();
  if (!current) {
    const adHoc: TraceContext = {
      runId: `run_adhoc_${randomUUID()}`,
      runName: `${agentName}-ad-hoc`,
      parentSpanId: options.parentSpanId || null,
      agentName,
      parentAgentName: undefined
    };
    return traceStorage.run(adHoc, () => fn(adHoc));
  }

  const nextContext: TraceContext = {
    ...current,
    agentName,
    parentAgentName: current.agentName,
    parentSpanId: options.parentSpanId !== undefined ? options.parentSpanId : (current.parentSpanId || null)
  };

  return traceStorage.run(nextContext, () => fn(nextContext));
}

export interface TraceSpanOptions {
  proxyBaseUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Directly emits an execution span to the AetherTrace interceptor proxy.
 */
export async function emitSpan(
  spanData: {
    runId?: string;
    parentSpanId?: string | null;
    spanType: string;
    agentName?: string;
    model?: string | null;
    requestPayload?: any;
    responsePayload?: any;
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    usageStatus?: 'reported' | 'estimated' | 'unavailable';
  },
  proxyBaseUrl?: string
): Promise<{ spanId: string; runId: string } | null> {
  const resolvedProxyUrl = proxyBaseUrl || getDefaultProxyUrl();
  const ctx = getTraceContext();
  const runId = spanData.runId || ctx?.runId || `run_${randomUUID()}`;
  const parentSpanId = spanData.parentSpanId !== undefined ? spanData.parentSpanId : (ctx?.parentSpanId || null);
  const agentName = spanData.agentName || ctx?.agentName || 'default-agent';

  try {
    const res = await fetch(`${resolvedProxyUrl.replace(/\/$/, '')}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: runId,
        run_name: ctx?.runName,
        parent_span_id: parentSpanId,
        span_type: spanData.spanType,
        agent_name: agentName,
        model: spanData.model || null,
        request_payload: spanData.requestPayload,
        response_payload: spanData.responsePayload,
        prompt_tokens: spanData.promptTokens || 0,
        completion_tokens: spanData.completionTokens || 0,
        cost_usd: spanData.costUsd || 0.0,
        latency_ms: spanData.latencyMs || 0,
        usage_status: spanData.usageStatus || (spanData.promptTokens || spanData.completionTokens ? 'reported' : 'unavailable')
      })
    });
    if (res.ok) {
      const data = await res.json() as any;
      return { spanId: data.spanId, runId: data.runId };
    }
  } catch {}
  return null;
}

/**
 * Traces a tool execution. Emits a tool_call span, measures execution duration,
 * records arguments/result, and sets parent_span_id for any nested calls inside fn().
 */
export async function traceTool<T>(
  toolName: string,
  args: any,
  fn: () => Promise<T>,
  options?: TraceSpanOptions
): Promise<T> {
  const startTime = Date.now();
  const proxyUrl = options?.proxyBaseUrl || getDefaultProxyUrl();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'tool_call',
      requestPayload: { tool_name: toolName, arguments: args, metadata: options?.metadata },
      responsePayload: { status: 'success', result, duration_ms: duration },
      latencyMs: duration
    }, proxyUrl);

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'tool_call',
      requestPayload: { tool_name: toolName, arguments: args, metadata: options?.metadata },
      responsePayload: {
        status: 'error',
        error: { message: err?.message || String(err), error_type: err?.name || 'ToolError' },
        duration_ms: duration
      },
      latencyMs: duration
    }, proxyUrl);
    throw err;
  }
}

/**
 * Traces an external HTTP request, emitting an http_call span.
 */
export async function traceHttp<T>(
  method: string,
  url: string,
  fn: () => Promise<T>,
  options?: TraceSpanOptions
): Promise<T> {
  const startTime = Date.now();
  const proxyUrl = options?.proxyBaseUrl || getDefaultProxyUrl();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'http_call',
      requestPayload: { method: method.toUpperCase(), url, metadata: options?.metadata },
      responsePayload: { status: 'completed', latency_ms: duration },
      latencyMs: duration
    }, proxyUrl);
    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'http_call',
      requestPayload: { method: method.toUpperCase(), url, metadata: options?.metadata },
      responsePayload: { status: 'error', error: err?.message || String(err), latency_ms: duration },
      latencyMs: duration
    }, proxyUrl);
    throw err;
  }
}

/**
 * Traces a retry attempt, creating an explicit retry span linked to originalSpanId.
 */
export async function traceRetry<T>(
  originalSpanId: string,
  attempt: number,
  reason: string,
  fn: (retrySpanId?: string) => Promise<T>,
  options?: TraceSpanOptions
): Promise<T> {
  const startTime = Date.now();
  const proxyUrl = options?.proxyBaseUrl || getDefaultProxyUrl();
  const retrySpanId = `span_retry_${randomUUID()}`;

  const current = getTraceContext();
  const nextContext: TraceContext = {
    ...(current || {
      runId: `run_${randomUUID()}`,
      runName: 'retry-run',
      agentName: 'orchestrator'
    }),
    parentSpanId: retrySpanId
  };

  try {
    const result = await traceStorage.run(nextContext, () => fn(retrySpanId));
    const duration = Date.now() - startTime;

    await emitSpan({
      runId: nextContext.runId,
      parentSpanId: originalSpanId,
      spanType: 'retry',
      requestPayload: { original_span_id: originalSpanId, attempt, reason },
      responsePayload: { status: 'success', duration_ms: duration },
      latencyMs: duration
    }, proxyUrl);

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await emitSpan({
      runId: nextContext.runId,
      parentSpanId: originalSpanId,
      spanType: 'retry',
      requestPayload: { original_span_id: originalSpanId, attempt, reason },
      responsePayload: { status: 'failed', error: err?.message || String(err), duration_ms: duration },
      latencyMs: duration
    }, proxyUrl);
    throw err;
  }
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
export function createTracedFetch(proxyBaseUrl?: string): typeof fetch {
  const base = proxyBaseUrl || getDefaultProxyUrl();
  const cleanBase = base.replace(/\/$/, '');

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
  const defaultBase = getDefaultProxyUrl().replace(/\/$/, '');
  const proxyUrl = options.proxyBaseUrl || `${defaultBase}/v1`;
  client.baseURL = proxyUrl;
  client.customFetch = createTracedFetch(options.proxyBaseUrl || getDefaultProxyUrl());
  return client;
}

export class AetherTraceClient {
  public proxyBaseUrl: string;

  constructor(proxyBaseUrl?: string) {
    this.proxyBaseUrl = proxyBaseUrl || getDefaultProxyUrl();
  }

  public traceRun<T>(name: string, options: TraceRunOptions, fn: () => Promise<T>): Promise<T> {
    return traceRun(name, options, fn);
  }

  public traceAgent<T>(agentName: string, fn: (context: TraceContext) => Promise<T>): Promise<T> {
    return traceAgent(agentName, fn);
  }

  public traceTool<T>(toolName: string, args: any, fn: () => Promise<T>, options?: TraceSpanOptions): Promise<T> {
    return traceTool(toolName, args, fn, { proxyBaseUrl: this.proxyBaseUrl, ...options });
  }

  public traceHttp<T>(method: string, url: string, fn: () => Promise<T>, options?: TraceSpanOptions): Promise<T> {
    return traceHttp(method, url, fn, { proxyBaseUrl: this.proxyBaseUrl, ...options });
  }

  public traceRetry<T>(originalSpanId: string, attempt: number, reason: string, fn: (retrySpanId?: string) => Promise<T>, options?: TraceSpanOptions): Promise<T> {
    return traceRetry(originalSpanId, attempt, reason, fn, { proxyBaseUrl: this.proxyBaseUrl, ...options });
  }

  public emitSpan(spanData: any): Promise<{ spanId: string; runId: string } | null> {
    return emitSpan(spanData, this.proxyBaseUrl);
  }

  public fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return createTracedFetch(this.proxyBaseUrl)(input, init);
  }
}

/**
 * Traces an LLM generation or completion call, capturing model, prompt, response, latency, and tokens.
 */
export async function traceLlm<T>(
  model: string,
  requestPayload: any,
  fn: () => Promise<{ response: T; promptTokens?: number; completionTokens?: number; costUsd?: number }>,
  options?: TraceSpanOptions
): Promise<T> {
  const startTime = Date.now();
  const proxyUrl = options?.proxyBaseUrl || getDefaultProxyUrl();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'llm_call',
      model,
      requestPayload,
      responsePayload: result.response,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
      latencyMs: duration
    }, proxyUrl);
    return result.response;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await emitSpan({
      spanType: 'llm_call',
      model,
      requestPayload,
      responsePayload: {
        status: 'error',
        error: { message: err?.message || String(err), name: err?.name || 'LLMError' }
      },
      latencyMs: duration
    }, proxyUrl);
    throw err;
  }
}

export interface AetherTraceConfig {
  proxyBaseUrl?: string;
  defaultAgentName?: string;
}

let globalConfig: AetherTraceConfig = {};

/**
 * Configures global AetherTrace SDK defaults.
 */
export function initAetherTrace(config: AetherTraceConfig = {}): void {
  globalConfig = { ...globalConfig, ...config };
  if (config.proxyBaseUrl) {
    process.env.PROXY_SERVER_URL = config.proxyBaseUrl;
  }
}

/**
 * High-level ergonomic tracer interface.
 */
export const tracer = {
  run: traceRun,
  agent: traceAgent,
  tool: traceTool,
  llm: traceLlm,
  http: traceHttp,
  retry: traceRetry,
  getHeaders: getTraceHeaders,
  getContext: getTraceContext
};

export * from './deduplication.js';
export * from './integrations/langchain.js';
export * from './integrations/openai.js';

