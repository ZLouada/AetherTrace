import { z } from 'zod';
import type { TraceRun, TraceSpan } from './schema.js';
import type { ProvenanceComparisonResult } from './provenance.js';
import { safeGetProperty } from './security/sandbox.js';

// --- Chat Completion Zod Schemas ---

export const ChatMessageRoleSchema = z.enum([
  'system',
  'user',
  'assistant',
  'tool',
  'function'
]);

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function').default('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string()
  })
});

export const ChatMessageSchema = z.object({
  role: z.union([ChatMessageRoleSchema, z.string()]),
  content: z.union([z.string(), z.array(z.any()), z.null()]).optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional()
});

export const ToolDefinitionSchema = z.object({
  type: z.literal('function').default('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.any()).optional()
  })
});

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema).min(1),
  tools: z.array(ToolDefinitionSchema).optional(),
  tool_choice: z.union([z.string(), z.record(z.any())]).optional(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  n: z.number().optional(),
  max_tokens: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  user: z.string().optional()
}).passthrough();

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

// --- Run and Span Zod Schemas ---

export const TraceRunZodSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['running', 'paused', 'completed', 'failed', 'breaker_tripped']),
  total_tokens: z.number(),
  total_cost_usd: z.number(),
  parent_run_id: z.string().nullable().optional(),
  forked_at_span_id: z.string().nullable().optional(),
  mutations: z.string().nullable().optional(),
  created_at: z.number()
});

// --- Event Semantics & Token Accounting Types ---

export type EventCategory =
  | 'LLM'
  | 'TOOL'
  | 'AGENT'
  | 'HTTP'
  | 'USER'
  | 'SYSTEM'
  | 'ERROR'
  | 'RETRY';

export type SpanType =
  | 'llm_call'
  | 'tool_call'
  | 'agent_state'
  | 'guardrail_block'
  | 'http_call'
  | 'user_input'
  | 'system_event'
  | 'retry';

export type ExecutionOrigin =
  | 'original'
  | 'cached_replay'
  | 'new_execution'
  | 'modified'
  | 'mocked';

export interface SpanMutation {
  span_id: string;
  field: string;
  before: any;
  after: any;
}

export function resolveEventCategory(spanType: string): EventCategory {
  switch (spanType) {
    case 'llm_call':
      return 'LLM';
    case 'tool_call':
      return 'TOOL';
    case 'agent_state':
      return 'AGENT';
    case 'guardrail_block':
      return 'ERROR';
    case 'http_call':
      return 'HTTP';
    case 'user_input':
      return 'USER';
    case 'system_event':
      return 'SYSTEM';
    case 'retry':
      return 'RETRY';
    default:
      return 'LLM';
  }
}

export type TokenUsageStatus = 'reported' | 'estimated' | 'unavailable';

export const TraceSpanZodSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  parent_span_id: z.string().nullable().optional(),
  span_type: z.enum([
    'llm_call',
    'tool_call',
    'agent_state',
    'guardrail_block',
    'http_call',
    'user_input',
    'system_event',
    'retry'
  ]).default('llm_call'),
  agent_name: z.string(),
  model: z.string().nullable().optional(),
  prompt_tokens: z.number().nullable().optional(),
  completion_tokens: z.number().nullable().optional(),
  cost_usd: z.number().nullable().optional(),
  latency_ms: z.number().nullable().optional(),
  cache_hit: z.number(),
  execution_origin: z.enum(['original', 'cached_replay', 'new_execution', 'modified', 'mocked']).default('original').optional(),
  source_span_id: z.string().nullable().optional(),
  usage_status: z.enum(['reported', 'estimated', 'unavailable']).default('reported').optional(),
  request_payload: z.string().nullable().optional(),
  response_payload: z.string().nullable().optional(),
  request_hash: z.string(),
  created_at: z.number()
});

export const ForkSpanRequestSchema = z.object({
  mutated_messages: z.array(ChatMessageSchema).optional(),
  prompt: z.string().optional(),
  modified_model: z.string().optional(),
  modified_prompt: z.string().optional(),
  modified_payload: z.any().optional(),
  include_source: z.boolean().optional(),
  new_run_name: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  mutations: z.array(z.object({
    span_id: z.string().optional(),
    field: z.string(),
    before: z.any(),
    after: z.any()
  })).optional()
});

export type ForkSpanRequest = z.infer<typeof ForkSpanRequestSchema>;

// --- Breakpoint & Chaos Engineering Types ---

export type BreakpointOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'greater_than'
  | 'less_than'
  | 'exists';

export interface BreakpointCondition {
  id?: string;
  name?: string;
  enabled?: boolean;
  target?: 'llm_call' | 'tool_call' | 'http_call' | 'guardrail_block' | 'all' | string;
  field: string;
  operator: BreakpointOperator;
  value?: any;
}

export interface BreakpointConfig {
  enabled: boolean;
  matchAgentNames: string[];
  matchModels: string[];
  conditions?: BreakpointCondition[];
}

export interface PendingBreakpoint {
  spanId: string;
  runId: string;
  agentName: string;
  model: string;
  requestPayload: any;
  createdAt: number;
}

export interface BreakpointResolution {
  action: 'resume' | 'mock' | 'abort';
  modifiedPayload?: any;
  mockedResponse?: string;
  reason?: string;
}


export interface ChaosConfig {
  enabled: boolean;
  latencySpikeMs: number;
  rateLimitErrorRate: number; // 0.0 to 1.0
  upstream500ErrorRate: number; // 0.0 to 1.0
  malformedJsonRate: number; // 0.0 to 1.0
}

export type ChaosFaultType = 'rate_limit' | 'upstream_500' | 'latency' | 'corrupt_json';

// --- WebSocket Event Schemas & Types ---

export type WebSocketEventType =
  | 'SPAN_CREATED'
  | 'SPAN_UPDATED'
  | 'RUN_CREATED'
  | 'RUN_UPDATED'
  | 'CIRCUIT_BREAKER_TRIPPED'
  | 'CACHE_HIT'
  | 'CONNECTION_READY'
  | 'PROMPT_ERROR'
  | 'BREAKPOINT_HIT'
  | 'BREAKPOINT_RESOLVED'
  | 'BREAKPOINT_CONFIG_UPDATED'
  | 'CHAOS_INJECTED'
  | 'CHAOS_CONFIG_UPDATED';

export interface WebSocketEvent<T = any> {
  type: string;
  data: T;
  timestamp?: number;
  runId?: string;
  spanId?: string;
}

export const WebSocketEventSchema = z.object({
  type: z.string(),
  data: z.any(),
  timestamp: z.number().optional(),
  runId: z.string().optional(),
  spanId: z.string().optional()
});

// --- Phase 5: Run Diffing & CI Regression Types ---

export type SpanDiffClassification =
  | 'identical_cached'
  | 'modified_fork'
  | 'modified'
  | 'inserted'
  | 'removed'
  | 'diverged_downstream';

export interface SpanDiffItem {
  stepIndex: number;
  status: SpanDiffClassification;
  agentName: string;
  baseSpan: TraceSpan | null;
  targetSpan: TraceSpan | null;
  deltas: {
    costDeltaUsd: number;
    costSavingsPercent: number;
    tokenDelta: number;
    latencyDeltaMs: number;
    modelChanged: boolean;
    promptChanged: boolean;
  };
}

export interface RunDiffSummary {
  baseRunId: string;
  baseRunName: string;
  targetRunId: string;
  targetRunName: string;
  baseCostUsd: number;
  targetCostUsd: number;
  costDeltaUsd: number;
  costSavingsPercent: number; // percentage (e.g. 85.5)
  baseTokens: number;
  targetTokens: number;
  tokenDelta: number;
  baseLatencyMs: number;
  targetLatencyMs: number;
  latencyDeltaMs: number;
  identicalStepsCount: number;
  divergedStepsCount: number;
}

export interface RunDiffResult {
  summary: RunDiffSummary;
  steps: SpanDiffItem[];
  provenanceDiff?: ProvenanceComparisonResult;
}

export interface RegressionAssertionOptions {
  maxCostUsd?: number;
  maxLatencyMs?: number;
  expectedStatus?: 'completed' | 'running';
  requireNoBreakerTripped?: boolean;
}

export interface RegressionAssertionResult {
  passed: boolean;
  runId: string;
  runName: string;
  actualStatus: string;
  actualCostUsd: number;
  maxCostUsd?: number;
  costPassed: boolean;
  actualLatencyMs: number;
  maxLatencyMs?: number;
  latencyPassed: boolean;
  statusPassed: boolean;
  failures: string[];
}

// --- Phase 2: Agent Execution Model Types & Schemas ---

export const ToolCallPayloadSchema = z.object({
  tool_name: z.string(),
  arguments: z.union([z.record(z.any()), z.string(), z.array(z.any())]).optional(),
  metadata: z.record(z.any()).optional()
}).passthrough();

export const ToolResultPayloadSchema = z.object({
  result: z.any().optional(),
  status: z.enum(['success', 'error']).default('success'),
  duration_ms: z.number().optional(),
  error: z.object({
    message: z.string(),
    error_type: z.string().optional(),
    recoverable: z.boolean().optional(),
    retryable: z.boolean().optional()
  }).optional()
}).passthrough();

export const HttpEventPayloadSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional()
}).passthrough();

export const HttpResultPayloadSchema = z.object({
  status_code: z.number(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  latency_ms: z.number().optional(),
  error: z.string().optional()
}).passthrough();

export const RetryEventPayloadSchema = z.object({
  original_span_id: z.string(),
  attempt: z.number().min(1).default(1),
  reason: z.string(),
  error_type: z.string().optional()
}).passthrough();

export const ErrorEventPayloadSchema = z.object({
  error_type: z.string(),
  message: z.string(),
  status_code: z.number().optional(),
  source_span_id: z.string().optional(),
  recoverable: z.boolean().optional(),
  retryable: z.boolean().optional()
}).passthrough();

export const AgentStatePayloadSchema = z.object({
  agent_name: z.string(),
  status: z.enum(['started', 'running', 'completed', 'failed', 'paused']).default('running'),
  parent_agent_name: z.string().nullable().optional(),
  task: z.string().optional(),
  metadata: z.record(z.any()).optional()
}).passthrough();

export type ToolCallPayload = z.infer<typeof ToolCallPayloadSchema>;
export type ToolResultPayload = z.infer<typeof ToolResultPayloadSchema>;
export type HttpEventPayload = z.infer<typeof HttpEventPayloadSchema>;
export type HttpResultPayload = z.infer<typeof HttpResultPayloadSchema>;
export type RetryEventPayload = z.infer<typeof RetryEventPayloadSchema>;
export type ErrorEventPayload = z.infer<typeof ErrorEventPayloadSchema>;
export type AgentStatePayload = z.infer<typeof AgentStatePayloadSchema>;

export interface ExecutionTreeNode {
  span: TraceSpan;
  category: EventCategory;
  depth: number;
  children: ExecutionTreeNode[];
}

export function buildExecutionTree(spans: TraceSpan[]): ExecutionTreeNode[] {
  const nodeMap = new Map<string, ExecutionTreeNode>();
  const rootNodes: ExecutionTreeNode[] = [];

  // 1. Initialize tree nodes
  for (const s of spans) {
    nodeMap.set(s.id, {
      span: s,
      category: resolveEventCategory(s.span_type),
      depth: 0,
      children: []
    });
  }

  // 2. Link parent -> children
  for (const s of spans) {
    const node = nodeMap.get(s.id)!;
    if (s.parent_span_id && nodeMap.has(s.parent_span_id)) {
      const parentNode = nodeMap.get(s.parent_span_id)!;
      parentNode.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 3. Compute depths recursively
  function computeDepth(node: ExecutionTreeNode, currentDepth: number) {
    node.depth = currentDepth;
    for (const child of node.children) {
      computeDepth(child, currentDepth + 1);
    }
  }

  for (const root of rootNodes) {
    computeDepth(root, 0);
  }

  return rootNodes;
}

export function getAncestryPath(spans: TraceSpan[], spanId: string): TraceSpan[] {
  const spanById = new Map<string, TraceSpan>();
  for (const s of spans) spanById.set(s.id, s);

  const path: TraceSpan[] = [];
  const visited = new Set<string>();
  let curr: string | null = spanId;

  while (curr && !visited.has(curr)) {
    visited.add(curr);
    const span = spanById.get(curr);
    if (!span) break;
    path.unshift(span);
    curr = span.parent_span_id;
  }
  return path;
}

export function getRetryChains(spans: TraceSpan[]): Array<{ original: TraceSpan; retry: TraceSpan; attempt: number; reason: string }> {
  const spanById = new Map<string, TraceSpan>();
  for (const s of spans) spanById.set(s.id, s);

  const chains: Array<{ original: TraceSpan; retry: TraceSpan; attempt: number; reason: string }> = [];

  for (const s of spans) {
    if (s.span_type === 'retry' && s.request_payload) {
      try {
        const payload = JSON.parse(s.request_payload);
        const originalId = payload.original_span_id || s.parent_span_id;
        if (originalId && spanById.has(originalId)) {
          chains.push({
            original: spanById.get(originalId)!,
            retry: s,
            attempt: payload.attempt || 1,
            reason: payload.reason || 'retry'
          });
        }
      } catch {}
    }
  }
  return chains;
}

/**
 * Resolves the execution origin of a span deterministically.
 */
export function resolveExecutionOrigin(
  span: Partial<TraceSpan>,
  hasParentRun: boolean = false
): ExecutionOrigin {
  if (span.execution_origin && span.execution_origin !== 'original') {
    return span.execution_origin as ExecutionOrigin;
  }
  if (span.cache_hit === 1) {
    return 'cached_replay';
  }
  if (
    span.response_payload &&
    (span.response_payload.includes('Mock Engine') ||
      span.response_payload.includes('mockedResponse') ||
      span.response_payload.includes('mocked_response'))
  ) {
    return 'mocked';
  }
  if (hasParentRun) {
    return 'new_execution';
  }
  return 'original';
}

function getNestedValue(obj: any, path: string): any {
  return safeGetProperty(obj, path);
}

/**
 * Safely evaluates a BreakpointCondition against an event context without eval().
 */
export function evaluateBreakpointCondition(
  cond: BreakpointCondition,
  ctx: {
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
): boolean {
  if (cond.enabled === false) return false;

  // 1. Check target span_type
  const targetType = ctx.spanType || ctx.span_type;
  if (cond.target && cond.target !== 'all' && targetType) {
    if (cond.target !== targetType) {
      return false;
    }
  }

  // 2. Extract field value safely
  let actualValue: any = undefined;
  const field = cond.field.trim();

  let parsedReq: any = ctx.requestPayload ?? ctx.request_payload;
  if (typeof parsedReq === 'string') {
    try {
      parsedReq = JSON.parse(parsedReq);
    } catch {}
  }

  let parsedRes: any = ctx.responsePayload ?? ctx.response_payload;
  if (typeof parsedRes === 'string') {
    try {
      parsedRes = JSON.parse(parsedRes);
    } catch {}
  }

  if (field === 'tool_name') {
    actualValue =
      ctx.toolName ||
      ctx.tool_name ||
      parsedReq?.tool_name ||
      parsedReq?.function?.name ||
      parsedReq?.name;
  } else if (field === 'status_code') {
    actualValue =
      ctx.statusCode ??
      ctx.status_code ??
      parsedRes?.status_code ??
      parsedRes?.status ??
      parsedReq?.status_code;
  } else if (field === 'model') {
    actualValue = ctx.model || parsedReq?.model;
  } else if (field === 'cost_usd') {
    actualValue = ctx.costUsd ?? ctx.cost_usd;
  } else if (field === 'latency_ms') {
    actualValue = ctx.latencyMs ?? ctx.latency_ms;
  } else if (field === 'agent_name') {
    actualValue = ctx.agentName ?? ctx.agent_name;
  } else if (field.startsWith('request.') || field.startsWith('payload.')) {
    const subPath = field.replace(/^(request|payload)\./, '');
    actualValue = getNestedValue(parsedReq, subPath);
  } else if (field.startsWith('response.')) {
    const subPath = field.replace(/^response\./, '');
    actualValue = getNestedValue(parsedRes, subPath);
  } else {
    actualValue = ctx[field];
    if (actualValue === undefined && parsedReq && typeof parsedReq === 'object') {
      actualValue = getNestedValue(parsedReq, field);
    }
    if (actualValue === undefined && parsedRes && typeof parsedRes === 'object') {
      actualValue = getNestedValue(parsedRes, field);
    }
  }

  // 3. Evaluate operator
  const op = cond.operator;
  const expectedValue = cond.value;

  switch (op) {
    case 'exists':
      return actualValue !== undefined && actualValue !== null && actualValue !== '';

    case 'equals':
      if (typeof actualValue === 'number' || typeof expectedValue === 'number') {
        return Number(actualValue) === Number(expectedValue);
      }
      return String(actualValue ?? '').toLowerCase() === String(expectedValue ?? '').toLowerCase();

    case 'not_equals':
      if (typeof actualValue === 'number' || typeof expectedValue === 'number') {
        return Number(actualValue) !== Number(expectedValue);
      }
      return String(actualValue ?? '').toLowerCase() !== String(expectedValue ?? '').toLowerCase();

    case 'contains':
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }
      return String(actualValue ?? '').toLowerCase().includes(String(expectedValue ?? '').toLowerCase());

    case 'starts_with':
      return String(actualValue ?? '').toLowerCase().startsWith(String(expectedValue ?? '').toLowerCase());

    case 'greater_than':
      return Number(actualValue) > Number(expectedValue);

    case 'less_than':
      return Number(actualValue) < Number(expectedValue);

    default:
      return false;
  }
}

export interface RunLineageNode {
  run: TraceRun;
  relation: 'root' | 'ancestor' | 'parent' | 'current' | 'fork' | 'replay';
  depth: number;
}

export function getRunLineage(
  allRuns: TraceRun[],
  targetRunId: string
): {
  ancestors: RunLineageNode[];
  current: RunLineageNode | null;
  descendants: RunLineageNode[];
} {
  const runMap = new Map<string, TraceRun>();
  for (const r of allRuns) runMap.set(r.id, r);

  const targetRun = runMap.get(targetRunId);
  if (!targetRun) {
    return { ancestors: [], current: null, descendants: [] };
  }

  // 1. Traverse up ancestors
  const ancestors: RunLineageNode[] = [];
  const visited = new Set<string>();
  let currParentId = targetRun.parent_run_id;
  let depth = -1;

  while (currParentId && !visited.has(currParentId)) {
    visited.add(currParentId);
    const parentRun = runMap.get(currParentId);
    if (!parentRun) break;
    ancestors.unshift({
      run: parentRun,
      relation: depth === -1 ? 'parent' : 'ancestor',
      depth
    });
    currParentId = parentRun.parent_run_id;
    depth--;
  }

  if (ancestors.length > 0) {
    ancestors[0].relation = 'root';
  }

  const current: RunLineageNode = {
    run: targetRun,
    relation: 'current',
    depth: 0
  };

  // 2. Find direct and indirect descendants
  const descendants: RunLineageNode[] = [];
  const queue: Array<{ runId: string; depth: number }> = [{ runId: targetRunId, depth: 1 }];
  const descendantVisited = new Set<string>();

  while (queue.length > 0) {
    const { runId, depth: d } = queue.shift()!;
    for (const r of allRuns) {
      if (r.parent_run_id === runId && !descendantVisited.has(r.id)) {
        descendantVisited.add(r.id);
        const isReplay = r.name.toLowerCase().includes('replay');
        descendants.push({
          run: r,
          relation: isReplay ? 'replay' : 'fork',
          depth: d
        });
        queue.push({ runId: r.id, depth: d + 1 });
      }
    }
  }

  return { ancestors, current, descendants };
}


