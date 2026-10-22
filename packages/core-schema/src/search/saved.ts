/**
 * AetherTrace — Saved Searches & Quick Views Engine
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { SavedSearch } from './types.js';

const DEFAULT_SAVED_SEARCHES = [
  { id: 'saved_failures', name: '🔥 Failures & Breakers', query: 'status:error' },
  { id: 'saved_high_cost', name: '💸 High-Cost Spans', query: 'cost:>0.05' },
  { id: 'saved_slow_calls', name: '🐢 Slow Executions', query: 'duration:>3s' },
  { id: 'saved_tools', name: '🛠️ Tool Invocations', query: 'event:tool' },
  { id: 'saved_llm', name: '🧠 LLM Completions', query: 'event:llm' }
];

export function initSavedSearches(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const countRow = sqlite.prepare('SELECT COUNT(*) as count FROM saved_searches').get() as { count: number };
  if (countRow.count === 0) {
    const insert = sqlite.prepare('INSERT INTO saved_searches (id, name, query, created_at) VALUES (?, ?, ?, ?)');
    const now = Date.now();
    for (const d of DEFAULT_SAVED_SEARCHES) {
      insert.run(d.id, d.name, d.query, now);
    }
  }
}

export function getSavedSearches(sqlite: Database.Database): SavedSearch[] {
  initSavedSearches(sqlite);
  const rows = sqlite.prepare('SELECT id, name, query, created_at FROM saved_searches ORDER BY created_at ASC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: r.query,
    createdAt: r.created_at
  }));
}

export function createSavedSearch(sqlite: Database.Database, name: string, query: string): SavedSearch {
  initSavedSearches(sqlite);
  const id = `saved_${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  sqlite.prepare('INSERT INTO saved_searches (id, name, query, created_at) VALUES (?, ?, ?, ?)').run(id, name, query, now);
  return { id, name, query, createdAt: now };
}

export function deleteSavedSearch(sqlite: Database.Database, id: string): boolean {
  initSavedSearches(sqlite);
  const info = sqlite.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return info.changes > 0;
}
