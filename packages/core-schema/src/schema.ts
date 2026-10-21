import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const trace_runs = sqliteTable('trace_runs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('default-run'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  started_at: integer('started_at', { mode: 'number' }).notNull(),
  ended_at: integer('ended_at', { mode: 'number' }),
  total_cost: real('total_cost').notNull().default(0.0),
  total_prompt_tokens: integer('total_prompt_tokens', { mode: 'number' }).notNull().default(0),
  total_completion_tokens: integer('total_completion_tokens', { mode: 'number' }).notNull().default(0),
  metadata: text('metadata'),
  created_at: integer('created_at', { mode: 'number' }).notNull()
}, (table) => [
  index('trace_runs_created_at_idx').on(table.created_at),
  index('trace_runs_status_idx').on(table.status)
]);

export const trace_spans = sqliteTable('trace_spans', {
  id: text('id').primaryKey(),
  run_id: text('run_id').notNull().references(() => trace_runs.id, { onDelete: 'cascade' }),
  parent_span_id: text('parent_span_id'),
  name: text('name').notNull().default('chat_completion'),
  span_type: text('span_type', { enum: ['llm', 'tool', 'chain', 'agent', 'replay'] }).notNull().default('llm'),
  status: text('status', { enum: ['running', 'success', 'error'] }).notNull().default('running'),
  request_hash: text('request_hash').notNull(),
  model: text('model'),
  prompt_tokens: integer('prompt_tokens', { mode: 'number' }).default(0),
  completion_tokens: integer('completion_tokens', { mode: 'number' }).default(0),
  cost: real('cost').default(0.0),
  request_payload: text('request_payload'),
  response_payload: text('response_payload'),
  latency_ms: integer('latency_ms', { mode: 'number' }).default(0),
  is_cached: integer('is_cached', { mode: 'number' }).notNull().default(0),
  error_message: text('error_message'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
  started_at: integer('started_at', { mode: 'number' }).notNull(),
  ended_at: integer('ended_at', { mode: 'number' })
}, (table) => [
  index('trace_spans_run_id_idx').on(table.run_id),
  index('trace_spans_request_hash_idx').on(table.request_hash),
  index('trace_spans_parent_idx').on(table.parent_span_id),
  index('trace_spans_started_at_idx').on(table.started_at)
]);

export type TraceRun = typeof trace_runs.$inferSelect;
export type InsertTraceRun = typeof trace_runs.$inferInsert;

export type TraceSpan = typeof trace_spans.$inferSelect;
export type InsertTraceSpan = typeof trace_spans.$inferInsert;
