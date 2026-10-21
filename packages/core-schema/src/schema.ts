import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const trace_runs = sqliteTable('trace_runs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('default-run'),
  status: text('status', { enum: ['running', 'paused', 'completed', 'failed', 'breaker_tripped'] }).notNull().default('running'),
  total_tokens: integer('total_tokens', { mode: 'number' }).notNull().default(0),
  total_cost_usd: real('total_cost_usd').notNull().default(0.0),
  parent_run_id: text('parent_run_id'),
  forked_at_span_id: text('forked_at_span_id'),
  created_at: integer('created_at', { mode: 'number' }).notNull()
}, (table) => [
  index('trace_runs_created_at_idx').on(table.created_at),
  index('trace_runs_status_idx').on(table.status),
  index('trace_runs_parent_idx').on(table.parent_run_id)
]);

export const trace_spans = sqliteTable('trace_spans', {
  id: text('id').primaryKey(),
  run_id: text('run_id').notNull().references(() => trace_runs.id, { onDelete: 'cascade' }),
  parent_span_id: text('parent_span_id'),
  span_type: text('span_type', { enum: ['llm_call', 'tool_call', 'agent_state', 'guardrail_block'] }).notNull().default('llm_call'),
  agent_name: text('agent_name').notNull().default('default-agent'),
  model: text('model'),
  request_payload: text('request_payload'),
  response_payload: text('response_payload'),
  prompt_tokens: integer('prompt_tokens', { mode: 'number' }).default(0),
  completion_tokens: integer('completion_tokens', { mode: 'number' }).default(0),
  cost_usd: real('cost_usd').default(0.0),
  latency_ms: integer('latency_ms', { mode: 'number' }).default(0),
  cache_hit: integer('cache_hit', { mode: 'number' }).notNull().default(0),
  request_hash: text('request_hash').notNull(),
  created_at: integer('created_at', { mode: 'number' }).notNull()
}, (table) => [
  index('trace_spans_run_id_idx').on(table.run_id),
  index('trace_spans_request_hash_idx').on(table.request_hash),
  index('trace_spans_parent_idx').on(table.parent_span_id),
  index('trace_spans_created_at_idx').on(table.created_at)
]);

export type TraceRun = typeof trace_runs.$inferSelect;
export type InsertTraceRun = typeof trace_runs.$inferInsert;

export type TraceSpan = typeof trace_spans.$inferSelect;
export type InsertTraceSpan = typeof trace_spans.$inferInsert;
