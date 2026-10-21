import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { resolve, isAbsolute } from 'node:path';
import * as schema from './schema.js';

export interface DatabaseConnection {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

let cachedConnection: DatabaseConnection | null = null;
let cachedDbPath: string | null = null;

export function resolveDbPath(customPath?: string): string {
  if (customPath) {
    return isAbsolute(customPath) ? customPath : resolve(process.cwd(), customPath);
  }
  const envPath = process.env.AETHERTRACE_DB_PATH || process.env.SQLITE_DB_PATH;
  if (envPath) {
    return isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
  }
  return resolve(process.cwd(), '.trace.sqlite');
}

export function runAutoMigration(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS trace_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'default-run',
      status TEXT NOT NULL DEFAULT 'running',
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0.0,
      parent_run_id TEXT,
      forked_at_span_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS trace_runs_created_at_idx ON trace_runs(created_at);
    CREATE INDEX IF NOT EXISTS trace_runs_status_idx ON trace_runs(status);
    CREATE INDEX IF NOT EXISTS trace_runs_parent_idx ON trace_runs(parent_run_id);

    CREATE TABLE IF NOT EXISTS trace_spans (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES trace_runs(id) ON DELETE CASCADE,
      parent_span_id TEXT,
      span_type TEXT NOT NULL DEFAULT 'llm_call',
      agent_name TEXT NOT NULL DEFAULT 'default-agent',
      model TEXT,
      request_payload TEXT,
      response_payload TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0.0,
      latency_ms INTEGER DEFAULT 0,
      cache_hit INTEGER NOT NULL DEFAULT 0,
      request_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS trace_spans_run_id_idx ON trace_spans(run_id);
    CREATE INDEX IF NOT EXISTS trace_spans_request_hash_idx ON trace_spans(request_hash);
    CREATE INDEX IF NOT EXISTS trace_spans_parent_idx ON trace_spans(parent_span_id);
    CREATE INDEX IF NOT EXISTS trace_spans_created_at_idx ON trace_spans(created_at);
  `);
}

export function getDatabase(customPath?: string): DatabaseConnection {
  const dbPath = resolveDbPath(customPath);

  if (cachedConnection && cachedDbPath === dbPath) {
    return cachedConnection;
  }

  const sqlite = new Database(dbPath);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');

  runAutoMigration(sqlite);

  const db = drizzle(sqlite, { schema });

  cachedConnection = { sqlite, db };
  cachedDbPath = dbPath;

  return cachedConnection;
}

export function closeDatabase(): void {
  if (cachedConnection) {
    cachedConnection.sqlite.close();
    cachedConnection = null;
    cachedDbPath = null;
  }
}
