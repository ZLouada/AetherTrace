/**
 * AetherTrace OpenAI & Function Wrapping Adapters
 */

import {
  traceTool,
  traceAgent,
  createTracedFetch,
  getDefaultProxyUrl,
  type TraceSpanOptions,
  type TraceAgentOptions
} from '../index.js';

export interface WrapOpenAIOptions {
  proxyBaseUrl?: string;
  defaultAgentName?: string;
}

/**
 * Wraps an OpenAI client instance to route through the local AetherTrace proxy
 * and auto-inject AsyncLocalStorage headers.
 */
export function wrapOpenAI<T extends { baseURL?: string; customFetch?: any }>(
  client: T,
  options: WrapOpenAIOptions = {}
): T {
  const defaultBase = (options.proxyBaseUrl || getDefaultProxyUrl()).replace(/\/$/, '');
  const proxyUrl = `${defaultBase}/v1`;
  client.baseURL = proxyUrl;
  client.customFetch = createTracedFetch(options.proxyBaseUrl || getDefaultProxyUrl());
  return client;
}

export interface ToolMetadata {
  name: string;
  description?: string;
  proxyBaseUrl?: string;
}

/**
 * Higher-order function decorator that turns any asynchronous tool function
 * into an automatically traced tool span.
 */
export function wrapTool<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  metadata: ToolMetadata
): (...args: TArgs) => Promise<TResult> {
  return async function wrappedTool(...args: TArgs): Promise<TResult> {
    return traceTool(
      metadata.name,
      args.length === 1 ? args[0] : args,
      () => fn(...args),
      { proxyBaseUrl: metadata.proxyBaseUrl, metadata: { description: metadata.description } }
    );
  };
}

export interface AgentMetadata {
  name: string;
  role?: string;
  task?: string;
}

/**
 * Higher-order function decorator that wraps an agent routine in a traceAgent context.
 */
export function wrapAgent<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  metadata: AgentMetadata
): (...args: TArgs) => Promise<TResult> {
  return async function wrappedAgent(...args: TArgs): Promise<TResult> {
    return traceAgent(
      metadata.name,
      { role: metadata.role, task: metadata.task },
      () => fn(...args)
    );
  };
}
