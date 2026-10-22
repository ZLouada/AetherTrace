import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const trace_runs = sqliteTable('trace_runs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('default-run'),
  status: text('status', { enum: ['running', 'paused', 'completed', 'failed', 'breaker_tripped'] }).notNull().default('running'),
  total_tokens: integer('total_tokens', { mode: 'number' }).notNull().default(0),
  total_cost_usd: real('total_cost_usd').notNull().default(0.0),
  parent_run_id: text('parent_run_id'),
  forked_at_span_id: text('forked_at_span_id'),
  mutations: text('mutations'),
  provenance: text('provenance'),
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
  span_type: text('span_type', {
    enum: [
      'llm_call',
      'tool_call',
      'agent_state',
      'guardrail_block',
      'http_call',
      'user_input',
      'system_event',
      'retry'
    ]
  }).notNull().default('llm_call'),
  agent_name: text('agent_name').notNull().default('default-agent'),
  model: text('model'),
  request_payload: text('request_payload'),
  response_payload: text('response_payload'),
  prompt_tokens: integer('prompt_tokens', { mode: 'number' }).default(0),
  completion_tokens: integer('completion_tokens', { mode: 'number' }).default(0),
  cost_usd: real('cost_usd').default(0.0),
  latency_ms: integer('latency_ms', { mode: 'number' }).default(0),
  cache_hit: integer('cache_hit', { mode: 'number' }).notNull().default(0),
  execution_origin: text('execution_origin', {
    enum: ['original', 'cached_replay', 'new_execution', 'modified', 'mocked']
  }).default('original'),
  source_span_id: text('source_span_id'),
  usage_status: text('usage_status', { enum: ['reported', 'estimated', 'unavailable'] }).default('reported'),
  request_hash: text('request_hash').notNull(),
  created_at: integer('created_at', { mode: 'number' }).notNull()
}, (table) => [
  index('trace_spans_run_id_idx').on(table.run_id),
  index('trace_spans_request_hash_idx').on(table.request_hash),
  index('trace_spans_parent_idx').on(table.parent_span_id),
  index('trace_spans_created_at_idx').on(table.created_at)
]);

type InferredTraceRun = typeof trace_runs.$inferSelect;
export type TraceRun = Omit<InferredTraceRun, 'mutations' | 'provenance'> & {
  mutations?: string | null;
  provenance?: string | null;
};
export type InsertTraceRun = typeof trace_runs.$inferInsert;

type InferredTraceSpan = typeof trace_spans.$inferSelect;
export type TraceSpan = Omit<InferredTraceSpan, 'execution_origin' | 'source_span_id'> & {
  execution_origin?: 'original' | 'cached_replay' | 'new_execution' | 'modified' | 'mocked' | null;
  source_span_id?: string | null;
};
export type InsertTraceSpan = typeof trace_spans.$inferInsert;

export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  source_run_id: text('source_run_id').notNull().references(() => trace_runs.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('draft'),
  metadata: text('metadata'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
  updated_at: integer('updated_at', { mode: 'number' }).notNull()
}, (table) => [
  index('experiments_source_run_idx').on(table.source_run_id),
  index('experiments_status_idx').on(table.status),
  index('experiments_created_at_idx').on(table.created_at)
]);

export const experiment_variants = sqliteTable('experiment_variants', {
  id: text('id').primaryKey(),
  experiment_id: text('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  source_run_id: text('source_run_id').notNull(),
  replay_run_id: text('replay_run_id'),
  fork_span_id: text('fork_span_id'),
  mutations: text('mutations').notNull().default('[]'),
  replay_mode: text('replay_mode', { enum: ['cache_only', 'live_replay', 'mock_mutated'] }).notNull().default('cache_only'),
  status: text('status', { enum: ['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('draft'),
  error_message: text('error_message'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
  completed_at: integer('completed_at', { mode: 'number' })
}, (table) => [
  index('experiment_variants_experiment_idx').on(table.experiment_id),
  index('experiment_variants_status_idx').on(table.status),
  index('experiment_variants_replay_run_idx').on(table.replay_run_id)
]);

export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = typeof experiments.$inferInsert;

export type ExperimentVariant = typeof experiment_variants.$inferSelect;
export type InsertExperimentVariant = typeof experiment_variants.$inferInsert;

export const evaluations = sqliteTable('evaluations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  target_type: text('target_type', { enum: ['run', 'experiment', 'variant'] }).notNull(),
  target_id: text('target_id').notNull(),
  status: text('status', { enum: ['passed', 'failed', 'error'] }).notNull().default('passed'),
  assertions_total: integer('assertions_total', { mode: 'number' }).notNull().default(0),
  assertions_passed: integer('assertions_passed', { mode: 'number' }).notNull().default(0),
  assertions_failed: integer('assertions_failed', { mode: 'number' }).notNull().default(0),
  metrics: text('metrics').notNull().default('{}'),
  assertions: text('assertions').notNull().default('[]'),
  failures: text('failures').notNull().default('[]'),
  error_clusters: text('error_clusters').notNull().default('[]'),
  root_causes: text('root_causes').notNull().default('[]'),
  optimization_signals: text('optimization_signals').notNull().default('[]'),
  regression: text('regression'),
  created_at: integer('created_at', { mode: 'number' }).notNull(),
  completed_at: integer('completed_at', { mode: 'number' }).notNull()
}, (table) => [
  index('evaluations_target_idx').on(table.target_type, table.target_id),
  index('evaluations_status_idx').on(table.status),
  index('evaluations_created_at_idx').on(table.created_at)
]);

export type Evaluation = typeof evaluations.$inferSelect;
export type InsertEvaluation = typeof evaluations.$inferInsert;


