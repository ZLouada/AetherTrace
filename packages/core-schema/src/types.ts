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
  status: z.enum(['running', 'completed', 'failed']),
  started_at: z.number(),
  ended_at: z.number().nullable().optional(),
  total_cost: z.number(),
  total_prompt_tokens: z.number(),
  total_completion_tokens: z.number(),
  metadata: z.string().nullable().optional(),
  created_at: z.number()
});

export const TraceSpanZodSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  parent_span_id: z.string().nullable().optional(),
  name: z.string(),
  span_type: z.enum(['llm', 'tool', 'chain', 'agent', 'replay']),
  status: z.enum(['running', 'success', 'error']),
  request_hash: z.string(),
  model: z.string().nullable().optional(),
  prompt_tokens: z.number().nullable().optional(),
  completion_tokens: z.number().nullable().optional(),
  cost: z.number().nullable().optional(),
  request_payload: z.string().nullable().optional(),
  response_payload: z.string().nullable().optional(),
  latency_ms: z.number().nullable().optional(),
  is_cached: z.number(),
  error_message: z.string().nullable().optional(),
  created_at: z.number(),
  started_at: z.number(),
  ended_at: z.number().nullable().optional()
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
  | 'run:created'
  | 'run:updated'
  | 'run:completed'
  | 'span:created'
  | 'span:updated'
  | 'span:completed'
  | 'breaker:budget_exceeded'
  | 'breaker:loop_detected'
  | 'cache:hit'
  | 'proxy:error';

export interface WebSocketEvent<T = any> {
  type: WebSocketEventType;
  timestamp: number;
  runId?: string;
  spanId?: string;
  data: T;
}

export const WebSocketEventSchema = z.object({
  type: z.enum([
    'run:created',
    'run:updated',
    'run:completed',
    'span:created',
    'span:updated',
    'span:completed',
    'breaker:budget_exceeded',
    'breaker:loop_detected',
    'cache:hit',
    'proxy:error'
  ]),
  timestamp: z.number(),
  runId: z.string().optional(),
  spanId: z.string().optional(),
  data: z.any()
});
