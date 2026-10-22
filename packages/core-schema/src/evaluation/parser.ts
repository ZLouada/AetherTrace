/**
 * AetherTrace — Zero-Eval Assertion Expression Parser (Phase 13)
 */

import { isForbiddenProperty } from '../security/sandbox.js';
import { parseDurationMs } from '../search/parser.js';
import type { AssertionOperator, AssertionRule } from './types.js';

const MAX_EXPRESSION_LENGTH = 500;

export const VALID_OPERATORS: AssertionOperator[] = [
  '==',
  '!=',
  '<=',
  '>=',
  '<',
  '>',
  'contains',
  'not_contains',
  'exists',
  'not_exists'
];

/**
 * Normalizes user-friendly field aliases into canonical evaluation metric paths.
 */
export function normalizeFieldAlias(field: string): string {
  const f = field.trim().toLowerCase();
  
  // Cost aliases
  if (f === 'cost' || f === 'total_cost' || f === 'cost_usd' || f === 'spend') {
    return 'cost.totalCostUsd';
  }
  if (f === 'cost_delta' || f === 'cost_delta_usd') {
    return 'cost.costDeltaUsd';
  }
  if (f === 'cost_delta_percent' || f === 'cost_delta_%') {
    return 'cost.costDeltaPercent';
  }

  // Latency aliases
  if (f === 'duration' || f === 'duration_ms' || f === 'latency' || f === 'latency_ms' || f === 'total_duration') {
    return 'latency.totalDurationMs';
  }
  if (f === 'critical_path' || f === 'critical_path_ms' || f === 'bottleneck_duration') {
    return 'latency.criticalPathMs';
  }
  if (f === 'duration_delta' || f === 'latency_delta') {
    return 'latency.durationDeltaMs';
  }

  // Tokens aliases
  if (f === 'tokens' || f === 'total_tokens' || f === 'tokens.total') {
    return 'tokens.totalTokens';
  }
  if (f === 'prompt_tokens' || f === 'input_tokens' || f === 'tokens.input' || f === 'tokens.prompt') {
    return 'tokens.promptTokens';
  }
  if (f === 'completion_tokens' || f === 'output_tokens' || f === 'tokens.output' || f === 'tokens.completion') {
    return 'tokens.completionTokens';
  }

  // Reliability aliases
  if (f === 'errors' || f === 'error_count' || f === 'errors.count') {
    return 'reliability.errorCount';
  }
  if (f === 'retries' || f === 'retry_count' || f === 'retries.count') {
    return 'reliability.retryCount';
  }
  if (f === 'failure_rate' || f === 'error_rate') {
    return 'reliability.failureRate';
  }
  if (f === 'breakers' || f === 'breakers_tripped' || f === 'breakers_tripped_count') {
    return 'reliability.breakersTrippedCount';
  }

  // Execution aliases
  if (f === 'spans' || f === 'span_count' || f === 'spans.count') {
    return 'execution.spanCount';
  }
  if (f === 'agents' || f === 'agent_count' || f === 'agents.count') {
    return 'execution.agentCount';
  }
  if (f === 'agent_depth' || f === 'max_depth' || f === 'agent_max_depth') {
    return 'execution.agentMaxDepth';
  }
  if (f === 'tool_calls' || f === 'tool_count' || f === 'tools.count') {
    return 'execution.toolCallCount';
  }
  if (f === 'parallel_branches' || f === 'parallel_count') {
    return 'execution.parallelBranchCount';
  }
  if (f === 'status') {
    return 'status';
  }

  return field;
}

/**
 * Safely parses string value into numeric, boolean, null, or string literal.
 */
export function parseAssertionValue(raw: string): any {
  const trimmed = raw.trim();

  // Strip dollar sign prefix if present (e.g. $0.10 -> 0.10)
  if (trimmed.startsWith('$') && !isNaN(Number(trimmed.slice(1)))) {
    return Number(trimmed.slice(1));
  }

  // Check for duration string (e.g. 5000ms, 5s, 1m)
  const duration = parseDurationMs(trimmed);
  if (duration !== null && /[a-z]/i.test(trimmed)) {
    return duration;
  }

  // Check boolean
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;

  // Check null / undefined
  if (trimmed.toLowerCase() === 'null') return null;

  // Check numeric
  if (!isNaN(Number(trimmed)) && trimmed !== '') {
    return Number(trimmed);
  }

  // Strip enclosing quotes if string literal
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Deterministically parses an assertion expression into an AssertionRule.
 * Zero-eval: never calls eval(), new Function(), or VM runners.
 */
export function parseAssertionExpression(expr: string): AssertionRule {
  if (!expr || typeof expr !== 'string') {
    throw new Error('Assertion expression must be a non-empty string');
  }

  if (expr.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Assertion expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`);
  }

  const clean = expr.trim();

  // Pattern 1: Tool presence natural language "tool <name> must exist" or "tool <name> must not exist"
  const toolExistMatch = clean.match(/^tool\s+(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_\-\.]+))\s+must\s+(not\s+)?exist$/i);
  if (toolExistMatch) {
    const toolName = toolExistMatch[1] || toolExistMatch[2] || toolExistMatch[3];
    const isNegated = Boolean(toolExistMatch[4]);
    return {
      name: isNegated ? `Tool '${toolName}' must not exist` : `Tool '${toolName}' must exist`,
      expression: clean,
      field: `execution.byToolCount.${toolName}`,
      operator: isNegated ? '==' : '>=',
      expected: isNegated ? 0 : 1,
      description: isNegated ? `Tool '${toolName}' must not be called` : `Tool '${toolName}' must be called at least once`
    };
  }

  // Pattern 2: Operator search
  // Sort operators by length descending so '<=' matches before '<'
  const sortedOps = [...VALID_OPERATORS].sort((a, b) => b.length - a.length);

  let matchedOp: AssertionOperator | null = null;
  let opIndex = -1;

  for (const op of sortedOps) {
    // Look for operator surrounded by whitespace or at boundary
    const regex = new RegExp(`(\\s+|^)${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+|$)`, 'i');
    const match = clean.match(regex);
    if (match && match.index !== undefined) {
      matchedOp = op;
      opIndex = match.index + match[1].length;
      break;
    }
  }

  // Pattern 3: Fallback if operator has no surrounding spaces (e.g. `cost<=0.10`)
  if (!matchedOp) {
    for (const op of sortedOps) {
      const idx = clean.indexOf(op);
      if (idx !== -1) {
        matchedOp = op;
        opIndex = idx;
        break;
      }
    }
  }

  if (!matchedOp || opIndex === -1) {
    throw new Error(`Invalid assertion expression '${expr}': No supported operator found (${VALID_OPERATORS.join(', ')})`);
  }

  const rawField = clean.slice(0, opIndex).trim();
  const rawValue = clean.slice(opIndex + matchedOp.length).trim();

  if (!rawField) {
    throw new Error(`Invalid assertion expression '${expr}': Missing target field before operator '${matchedOp}'`);
  }

  // Operator unary check: exists / not_exists do not require a value
  if (matchedOp === 'exists' || matchedOp === 'not_exists') {
    const canonicalField = normalizeFieldAlias(rawField);
    return {
      name: `${canonicalField} ${matchedOp}`,
      expression: clean,
      field: canonicalField,
      operator: matchedOp,
      expected: matchedOp === 'exists',
      description: `Field ${canonicalField} must ${matchedOp === 'exists' ? 'exist' : 'not exist'}`
    };
  }

  if (!rawValue) {
    throw new Error(`Invalid assertion expression '${expr}': Missing expected value after operator '${matchedOp}'`);
  }

  // Security guard against prototype traversal
  const fieldParts = rawField.split('.');
  for (const part of fieldParts) {
    if (isForbiddenProperty(part)) {
      throw new Error(`Security Violation: Forbidden property '${part}' in assertion expression`);
    }
  }

  const canonicalField = normalizeFieldAlias(rawField);
  const parsedExpected = parseAssertionValue(rawValue);

  return {
    name: `${canonicalField} ${matchedOp} ${parsedExpected}`,
    expression: clean,
    field: canonicalField,
    operator: matchedOp,
    expected: parsedExpected,
    description: `Assert that ${canonicalField} ${matchedOp} ${parsedExpected}`
  };
}

export const parseAssertionRule = parseAssertionExpression;

