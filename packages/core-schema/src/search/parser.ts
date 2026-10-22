/**
 * AetherTrace — Deterministic Search Query Parser (Zero-Eval)
 */

import type { ParsedSearchQuery, QueryFilter, QueryFilterOperator } from './types.js';

const MAX_QUERY_LENGTH = 500;

/**
 * Parses duration strings like '5s', '500ms', '2m' into numeric milliseconds.
 */
export function parseDurationMs(input: string): number | null {
  const match = input.trim().match(/^([0-9]+(?:\.[0-9]+)?)(ms|s|m|h)?$/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val)) return null;
  const unit = (match[2] || 'ms').toLowerCase();
  switch (unit) {
    case 'ms':
      return Math.round(val);
    case 's':
      return Math.round(val * 1000);
    case 'm':
      return Math.round(val * 60000);
    case 'h':
      return Math.round(val * 3600000);
    default:
      return Math.round(val);
  }
}

/**
 * Parses timestamp or date string into epoch milliseconds.
 */
export function parseTimestampMs(input: string): number | null {
  // If numeric epoch ms
  if (/^[0-9]{10,13}$/.test(input.trim())) {
    const num = parseInt(input.trim(), 10);
    return input.trim().length === 10 ? num * 1000 : num;
  }
  const parsed = Date.parse(input.trim());
  return isNaN(parsed) ? null : parsed;
}

/**
 * Tokenizes search query preserving quoted substrings and key:value tokens.
 */
export function tokenizeQuery(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if ((char === '"' || char === "'") && (!inQuotes || char === quoteChar)) {
      if (inQuotes) {
        // Ending quote
        tokens.push(current);
        current = '';
        inQuotes = false;
        quoteChar = '';
      } else {
        // Starting quote
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        inQuotes = true;
        quoteChar = char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Normalizes event types to standard span types.
 */
function normalizeEventType(val: string): string {
  const lower = val.toLowerCase();
  if (lower === 'llm' || lower === 'llm_call') return 'llm_call';
  if (lower === 'tool' || lower === 'tool_call') return 'tool_call';
  if (lower === 'agent' || lower === 'agent_state') return 'agent_state';
  if (lower === 'http' || lower === 'http_call') return 'http_call';
  if (lower === 'guardrail' || lower === 'guardrail_block') return 'guardrail_block';
  if (lower === 'retry') return 'retry';
  if (lower === 'system' || lower === 'system_event') return 'system_event';
  if (lower === 'user' || lower === 'user_input') return 'user_input';
  if (lower === 'error') return 'error';
  return lower;
}

/**
 * Parses raw search query string into a structured, zero-eval AST.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const safeQuery = (query || '').slice(0, MAX_QUERY_LENGTH).trim();
  if (!safeQuery) {
    return { rawQuery: '', terms: [], filters: [] };
  }

  const rawTokens = tokenizeQuery(safeQuery);
  const terms: string[] = [];
  const filters: QueryFilter[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    let token = rawTokens[i];

    let negated = false;
    if (token.startsWith('-not ') || token.startsWith('-NOT ')) {
      negated = true;
      token = token.slice(5).trim();
    } else if (token.startsWith('-') && token.length > 1 && !token.startsWith('--')) {
      negated = true;
      token = token.slice(1).trim();
    }

    // Check for field filter pattern: field:operator?value or field operator value
    // Supported operators: >=, <=, >, <, =, !=, :
    const filterMatch = token.match(/^([a-zA-Z0-9_\-\.]+)(:|\!=|>=|<=|>|<|=)(.*)$/);

    if (filterMatch) {
      const field = filterMatch[1].toLowerCase();
      let rawOp = filterMatch[2];
      let val = filterMatch[3];

      let op: QueryFilterOperator = '=';

      // Check if value starts with an operator like cost:>0.10
      if (rawOp === ':') {
        if (val.startsWith('>=')) {
          op = '>=';
          val = val.slice(2);
        } else if (val.startsWith('<=')) {
          op = '<=';
          val = val.slice(2);
        } else if (val.startsWith('>')) {
          op = '>';
          val = val.slice(1);
        } else if (val.startsWith('<')) {
          op = '<';
          val = val.slice(1);
        } else if (val.startsWith('!=')) {
          op = '!=';
          val = val.slice(2);
        } else if (val.startsWith('=')) {
          op = '=';
          val = val.slice(1);
        } else {
          op = '=';
        }
      } else {
        op = (rawOp === '!=' ? '!=' : rawOp) as QueryFilterOperator;
      }

      // Handle wildcard / prefix
      if (val.endsWith('*')) {
        op = 'prefix';
        val = val.slice(0, -1);
      }

      // Process typed values
      if (field === 'cost' || field === 'cost_usd') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          filters.push({ field: 'cost_usd', operator: op, value: num, negated });
          continue;
        }
      } else if (field === 'duration' || field === 'latency' || field === 'latency_ms') {
        const ms = parseDurationMs(val);
        if (ms !== null) {
          filters.push({ field: 'latency_ms', operator: op, value: ms, negated });
          continue;
        }
      } else if (field === 'tokens' || field === 'total_tokens') {
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
          filters.push({ field: 'total_tokens', operator: op, value: num, negated });
          continue;
        }
      } else if (field === 'before') {
        const ts = parseTimestampMs(val);
        if (ts !== null) {
          filters.push({ field: 'created_at', operator: '<', value: ts, negated });
          continue;
        }
      } else if (field === 'after') {
        const ts = parseTimestampMs(val);
        if (ts !== null) {
          filters.push({ field: 'created_at', operator: '>', value: ts, negated });
          continue;
        }
      } else if (field === 'event' || field === 'event_type' || field === 'type') {
        const norm = normalizeEventType(val);
        if (norm === 'error') {
          // status:error or span_type:guardrail_block
          filters.push({ field: 'status', operator: '=', value: 'failed', negated });
        } else {
          filters.push({ field: 'span_type', operator: op, value: norm, negated });
        }
        continue;
      } else if (field === 'status') {
        filters.push({ field: 'status', operator: op, value: val.toLowerCase(), negated });
        continue;
      } else if (field === 'agent' || field === 'agent_name') {
        filters.push({ field: 'agent_name', operator: op, value: val, negated });
        continue;
      } else if (field === 'model') {
        filters.push({ field: 'model', operator: op, value: val, negated });
        continue;
      } else if (field === 'tool' || field === 'tool_name') {
        filters.push({ field: 'tool_name', operator: op, value: val, negated });
        continue;
      } else if (field === 'run' || field === 'run_id') {
        filters.push({ field: 'run_id', operator: op, value: val, negated });
        continue;
      } else if (field === 'span' || field === 'span_id') {
        filters.push({ field: 'span_id', operator: op, value: val, negated });
        continue;
      } else if (field === 'branch') {
        filters.push({ field: 'branch', operator: op, value: val, negated });
        continue;
      } else if (field === 'commit') {
        filters.push({ field: 'commit_sha', operator: op, value: val, negated });
        continue;
      } else if (field === 'runtime' || field === 'platform') {
        filters.push({ field, operator: op, value: val, negated });
        continue;
      }
    }

    // Default: treated as free-text search term
    terms.push(token);
  }

  return {
    rawQuery: safeQuery,
    terms,
    filters
  };
}
