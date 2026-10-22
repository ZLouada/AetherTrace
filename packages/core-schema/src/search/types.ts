/**
 * AetherTrace — Search & Developer UX Engine: Type Definitions
 */

export type SearchResultType =
  | 'run'
  | 'span'
  | 'event'
  | 'error'
  | 'tool'
  | 'agent'
  | 'model'
  | 'provenance';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  runId: string;
  spanId?: string;
  title: string;
  subtitle?: string;
  matchedField?: string;
  snippet?: string;
  timestamp?: number;
  score?: number;
  metadata?: Record<string, any>;
}

export type QueryFilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'prefix';

export interface QueryFilter {
  field: string;
  operator: QueryFilterOperator;
  value: string | number;
  negated?: boolean;
}

export interface ParsedSearchQuery {
  rawQuery: string;
  terms: string[];
  filters: QueryFilter[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  runId?: string; // Scope to a single run if desired
  types?: SearchResultType[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  took_ms: number;
  parsed: {
    terms: string[];
    filters: QueryFilter[];
  };
}

export interface ErrorDiscoverySummary {
  errorType: string;
  message: string;
  count: number;
  runsCount: number;
  lastSeen: number;
  sampleRunId: string;
  sampleSpanId: string;
  affectedAgents: string[];
  affectedTools: string[];
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: number;
}
