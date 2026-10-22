/**
 * AetherTrace — Deterministic Assertion Execution Engine (Phase 13)
 */

import { safeGetProperty } from '../security/sandbox.js';
import type { TraceSpan } from '../schema.js';
import type { AssertionRule, AssertionResult, EvaluationMetrics, AssertionOperator } from './types.js';
import { parseAssertionExpression } from './parser.js';

export function evaluateAssertion(
  ruleOrExpression: AssertionRule | string,
  metrics: EvaluationMetrics,
  spans: TraceSpan[]
): AssertionResult {
  const rule: AssertionRule =
    typeof ruleOrExpression === 'string'
      ? parseAssertionExpression(ruleOrExpression)
      : ruleOrExpression.expression && !ruleOrExpression.field
      ? parseAssertionExpression(ruleOrExpression.expression)
      : ruleOrExpression;

  const id = rule.id || `rule_${Math.random().toString(36).slice(2, 10)}`;
  const field = rule.field || 'status';
  const op: AssertionOperator = rule.operator || '==';
  const expected = rule.expected;
  const name = rule.name || rule.expression || `${field} ${op} ${expected}`;

  // 1. Resolve actual value safely from metrics rawFieldMap or via safeGetProperty
  let actual: any = metrics.rawFieldMap[field];
  if (actual === undefined) {
    actual = safeGetProperty(metrics, field);
  }

  // Fallback for direct properties on root run/execution
  if (actual === undefined) {
    if (field === 'status') actual = metrics.rawFieldMap['status'];
    else if (field === 'error' || field === 'errors') actual = metrics.reliability.errorCount;
    else if (field === 'cost') actual = metrics.cost.totalCostUsd;
    else if (field === 'latency' || field === 'duration') actual = metrics.latency.totalDurationMs;
  }

  // 2. Evaluate operator
  let passed = false;

  switch (op) {
    case '==':
      if (typeof actual === 'number' || typeof expected === 'number') {
        passed = Number(actual) === Number(expected);
      } else {
        passed = String(actual ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
      }
      break;

    case '!=':
      if (typeof actual === 'number' || typeof expected === 'number') {
        passed = Number(actual) !== Number(expected);
      } else {
        passed = String(actual ?? '').toLowerCase() !== String(expected ?? '').toLowerCase();
      }
      break;

    case '<':
      passed = Number(actual ?? 0) < Number(expected);
      break;

    case '<=':
      passed = Number(actual ?? 0) <= Number(expected);
      break;

    case '>':
      passed = Number(actual ?? 0) > Number(expected);
      break;

    case '>=':
      passed = Number(actual ?? 0) >= Number(expected);
      break;

    case 'contains':
      if (Array.isArray(actual)) {
        passed = actual.includes(expected);
      } else {
        passed = String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
      }
      break;

    case 'not_contains':
      if (Array.isArray(actual)) {
        passed = !actual.includes(expected);
      } else {
        passed = !String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
      }
      break;

    case 'exists':
      passed = actual !== undefined && actual !== null && actual !== '' && actual !== 0;
      break;

    case 'not_exists':
      passed = actual === undefined || actual === null || actual === '' || actual === 0;
      break;

    default:
      passed = false;
      break;
  }

  // 3. Locate evidence spans
  const evidenceSpanIds: string[] = [];
  const evidenceEventTypes: string[] = [];

  if (field.includes('error') || field.includes('reliability')) {
    for (const s of spans) {
      if (
        s.span_type === 'guardrail_block' ||
        (s.response_payload && /"error"/i.test(s.response_payload))
      ) {
        evidenceSpanIds.push(s.id);
        if (!evidenceEventTypes.includes(s.span_type)) evidenceEventTypes.push(s.span_type);
      }
    }
  } else if (field.includes('latency') || field.includes('duration') || field.includes('critical_path')) {
    // Find slowest span as evidence
    const slowest = [...spans].sort((a, b) => (b.latency_ms || 0) - (a.latency_ms || 0))[0];
    if (slowest) {
      evidenceSpanIds.push(slowest.id);
      evidenceEventTypes.push(slowest.span_type);
    }
  } else if (field.includes('cost')) {
    // Find most expensive span as evidence
    const priciest = [...spans].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))[0];
    if (priciest) {
      evidenceSpanIds.push(priciest.id);
      evidenceEventTypes.push(priciest.span_type);
    }
  } else if (field.includes('tool')) {
    for (const s of spans) {
      if (s.span_type === 'tool_call') {
        evidenceSpanIds.push(s.id);
        if (!evidenceEventTypes.includes(s.span_type)) evidenceEventTypes.push(s.span_type);
      }
    }
  }

  // 4. Construct human-readable message
  let message = '';
  if (passed) {
    message = `Assertion passed: ${name} (actual: ${actual})`;
  } else {
    message = `Assertion failed: expected ${field} to ${op} ${expected}, but actual value was ${actual}`;
  }

  return {
    id,
    name,
    expression: rule.expression || `${field} ${op} ${expected}`,
    status: passed ? 'passed' : 'failed',
    expected,
    actual,
    operator: op,
    field,
    message,
    evidence: {
      spanIds: evidenceSpanIds.slice(0, 10),
      eventTypes: evidenceEventTypes,
      metric: field,
      timestamp: Date.now()
    }
  };
}
