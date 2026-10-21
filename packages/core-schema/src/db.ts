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

/**
 * Resolves the database file path, honoring environment variables or defaults to `.trace.sqlite`.
 */
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

/**
 * Executes automatic schema initialization on the SQLite connection.
 * Creates trace_runs and trace_spans tables with all necessary indices.
 */
export function runAutoMigration(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS trace_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'default-run',
      status TEXT NOT NULL DEFAULT 'running',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      total_cost REAL NOT NULL DEFAULT 0.0,
      total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
      total_completion_tokens INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS trace_runs_created_at_idx ON trace_runs(created_at);
    CREATE INDEX IF NOT EXISTS trace_runs_status_idx ON trace_runs(status);

    CREATE TABLE IF NOT EXISTS trace_spans (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES trace_runs(id) ON DELETE CASCADE,
      parent_span_id TEXT,
      name TEXT NOT NULL DEFAULT 'chat_completion',
      span_type TEXT NOT NULL DEFAULT 'llm',
      status TEXT NOT NULL DEFAULT 'running',
      request_hash TEXT NOT NULL,
      model TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0.0,
      request_payload TEXT,
      response_payload TEXT,
      latency_ms INTEGER DEFAULT 0,
      is_cached INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS trace_spans_run_id_idx ON trace_spans(run_id);
    CREATE INDEX IF NOT EXISTS trace_spans_request_hash_idx ON trace_spans(request_hash);
    CREATE INDEX IF NOT EXISTS trace_spans_parent_idx ON trace_spans(parent_span_id);
    CREATE INDEX IF NOT EXISTS trace_spans_started_at_idx ON trace_spans(started_at);
  `);
}

/**
 * Creates or retrieves a SQLite + Drizzle connection with WAL mode enabled and auto-migration executed.
 */
export function getDatabase(customPath?: string): DatabaseConnection {
  const dbPath = resolveDbPath(customPath);

  if (cachedConnection && cachedDbPath === dbPath) {
    return cachedConnection;
  }

  const sqlite = new Database(dbPath);

  // Performance & reliability pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');

  // Ensure tables and indices exist
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
