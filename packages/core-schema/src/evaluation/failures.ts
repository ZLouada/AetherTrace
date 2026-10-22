/**
 * AetherTrace — Structured Failure Analysis Engine (Phase 13)
 */

import type { TraceSpan } from '../schema.js';
import type { AssertionResult, FailureItem } from './types.js';
import type { ExecutionIntelligence } from '../intelligence/types.js';

import { analyzeExecutionIntelligence } from '../intelligence/engine.js';

export function analyzeFailures(
  assertions: AssertionResult[],
  spans: TraceSpan[],
  intelOrRunId?: ExecutionIntelligence | string,
  runId: string = 'unknown_run'
): FailureItem[] {
  const failures: FailureItem[] = [];
  let intel: ExecutionIntelligence;
  let targetRunId = runId;

  if (typeof intelOrRunId === 'string') {
    targetRunId = intelOrRunId;
    intel = analyzeExecutionIntelligence(spans);
  } else if (intelOrRunId && typeof intelOrRunId === 'object' && 'retryChains' in intelOrRunId) {
    intel = intelOrRunId;
  } else {
    intel = analyzeExecutionIntelligence(spans);
  }

  for (const a of assertions) {
    if (a.status !== 'failed') continue;

    const spanIds: string[] = [];
    const eventTypes: string[] = [];
    let severity: 'critical' | 'warning' = 'critical';
    let explanation = a.message;

    // Localize failure based on field
    if (a.field.includes('error') || a.field.includes('reliability')) {
      severity = 'critical';
      for (const s of spans) {
        if (
          s.span_type === 'guardrail_block' ||
          (s.response_payload && /"error"/i.test(s.response_payload))
        ) {
          spanIds.push(s.id);
          if (!eventTypes.includes(s.span_type)) eventTypes.push(s.span_type);
        }
      }
      explanation = `Observed ${a.actual} errors across execution. Relevant spans: ${spanIds.slice(0, 3).join(', ')}`;
    } else if (a.field.includes('cost')) {
      severity = 'critical';
      // Pick most expensive spans
      const sorted = [...spans].sort((x, y) => (y.cost_usd || 0) - (x.cost_usd || 0));
      for (const s of sorted.slice(0, 3)) {
        if ((s.cost_usd || 0) > 0) {
          spanIds.push(s.id);
          if (!eventTypes.includes(s.span_type)) eventTypes.push(s.span_type);
        }
      }
      explanation = `Total cost ($${Number(a.actual).toFixed(6)}) exceeded expectation of ${a.operator} $${Number(a.expected).toFixed(6)}. Top contributor: span ${spanIds[0] || 'none'}`;
    } else if (a.field.includes('latency') || a.field.includes('duration') || a.field.includes('critical_path')) {
      severity = 'warning';
      if (intel.criticalPath.longestSpan) {
        spanIds.push(intel.criticalPath.longestSpan.spanId);
        eventTypes.push('llm_call');
      }
      explanation = `Duration (${a.actual}ms) exceeded threshold (${a.operator} ${a.expected}ms). Longest critical path bottleneck: ${intel.criticalPath.longestSpan?.label || 'unknown'} (${intel.criticalPath.longestSpan?.durationMs || 0}ms)`;
    } else if (a.field.includes('retry')) {
      severity = 'warning';
      for (const rc of intel.retryChains) {
        for (const att of rc.attempts) {
          spanIds.push(att.spanId);
        }
      }
      explanation = `Retry count (${a.actual}) exceeded limit of ${a.operator} ${a.expected}. Traced ${intel.retryChains.length} retry chain(s)`;
    } else if (a.field.includes('tool')) {
      severity = 'critical';
      for (const s of spans) {
        if (s.span_type === 'tool_call') {
          spanIds.push(s.id);
          if (!eventTypes.includes(s.span_type)) eventTypes.push(s.span_type);
        }
      }
      explanation = `Tool call expectation violated: ${a.field} ${a.operator} ${a.expected} (actual: ${a.actual})`;
    } else if (a.field === 'status') {
      severity = 'critical';
      explanation = `Run status '${a.actual}' failed expectation ${a.operator} '${a.expected}'`;
    }

    // Attach any evidence spans from assertion if not already found
    if (spanIds.length === 0 && a.evidence?.spanIds && a.evidence.spanIds.length > 0) {
      spanIds.push(...a.evidence.spanIds);
    }
    if (eventTypes.length === 0 && a.evidence?.eventTypes) {
      eventTypes.push(...a.evidence.eventTypes);
    }

    failures.push({
      id: `fail_${a.id}`,
      assertionId: a.id,
      assertionName: a.name,
      rule: a.expression,
      actualValue: a.actual,
      expectedValue: a.expected,
      runId,
      spanIds: spanIds.slice(0, 10),
      eventTypes,
      explanation,
      severity
    });
  }

  return failures;
}
