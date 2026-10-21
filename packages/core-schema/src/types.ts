import { z } from 'zod';
import type { TraceRun, TraceSpan } from './schema.js';

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
  created_at: z.number()
});

export const TraceSpanZodSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  parent_span_id: z.string().nullable().optional(),
  span_type: z.enum(['llm_call', 'tool_call', 'agent_state', 'guardrail_block']),
  agent_name: z.string(),
  model: z.string().nullable().optional(),
  prompt_tokens: z.number().nullable().optional(),
  completion_tokens: z.number().nullable().optional(),
  cost_usd: z.number().nullable().optional(),
  latency_ms: z.number().nullable().optional(),
  cache_hit: z.number(),
  request_payload: z.string().nullable().optional(),
  response_payload: z.string().nullable().optional(),
  request_hash: z.string(),
  created_at: z.number()
});

export const ForkSpanRequestSchema = z.object({
  mutated_messages: z.array(ChatMessageSchema).optional(),
  prompt: z.string().optional(),
  new_run_name: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type ForkSpanRequest = z.infer<typeof ForkSpanRequestSchema>;

// --- WebSocket Event Schemas & Types ---

export type WebSocketEventType =
  | 'SPAN_CREATED'
  | 'SPAN_UPDATED'
  | 'RUN_CREATED'
  | 'RUN_UPDATED'
  | 'CIRCUIT_BREAKER_TRIPPED'
  | 'CACHE_HIT'
  | 'CONNECTION_READY'
  | 'PROMPT_ERROR';

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
