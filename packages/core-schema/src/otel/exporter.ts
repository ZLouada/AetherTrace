import { createHash } from 'node:crypto';
import { redactValue } from '../security/redaction.js';
import type { TraceRun, TraceSpan } from '../schema.js';
import {
  type OtlpExportTraceServiceRequest,
  type OtlpSpan,
  type OtlpResourceSpans,
  recordToOtlpAttributes
} from './types.js';

/**
 * Deterministically formats an AetherTrace run ID as an OTel 32-hex trace ID.
 */
export function runIdToOtlpTraceId(runId: string): string {
  if (runId.startsWith('run_otel_')) {
    const raw = runId.replace(/^run_otel_/, '');
    if (/^[a-f0-9]{32}$/i.test(raw)) {
      return raw.toLowerCase();
    }
  }
  // Deterministic 32-character hex hash
  return createHash('sha256').update(runId).digest('hex').slice(0, 32);
}

/**
 * Deterministically formats an AetherTrace span ID as an OTel 16-hex span ID.
 */
export function spanIdToOtlpSpanId(spanId?: string | null): string {
  if (!spanId) return '';
  if (spanId.startsWith('span_otel_')) {
    const raw = spanId.replace(/^span_otel_/, '');
    if (/^[a-f0-9]{16}$/i.test(raw)) {
      return raw.toLowerCase();
    }
  }
  // Deterministic 16-character hex hash
  return createHash('sha256').update(spanId).digest('hex').slice(0, 16);
}

/**
 * Exports an AetherTrace run and its spans into a standard OTLP JSON ExportTraceServiceRequest.
 */
export function mapAetherTraceToOtlp(
  run: TraceRun,
  spans: TraceSpan[]
): OtlpExportTraceServiceRequest {
  const traceId = runIdToOtlpTraceId(run.id);

  const otlpSpans: OtlpSpan[] = spans.map((span) => {
    const spanId = spanIdToOtlpSpanId(span.id);
    const parentSpanId = span.parent_span_id ? spanIdToOtlpSpanId(span.parent_span_id) : '';

    const startNs = BigInt(span.created_at) * 1_000_000n;
    const latencyNs = BigInt(span.latency_ms || 0) * 1_000_000n;
    const endNs = startNs + latencyNs;

    let reqPayload: any = null;
    let resPayload: any = null;

    try {
      if (span.request_payload) reqPayload = JSON.parse(span.request_payload);
    } catch {
      reqPayload = span.request_payload;
    }

    try {
      if (span.response_payload) resPayload = JSON.parse(span.response_payload);
    } catch {
      resPayload = span.response_payload;
    }

    // Build attributes
    const attrRecord: Record<string, any> = {
      // Standard GenAI & General OTel conventions
      'service.name': 'aethertrace',
      'aethertrace.version': '1.1',
      'aethertrace.span_type': span.span_type,
      'aethertrace.agent_name': span.agent_name,
      'aethertrace.execution_origin': span.execution_origin || 'original',
      'aethertrace.cost_usd': span.cost_usd || 0.0,
      'aethertrace.usage_status': span.usage_status || 'unavailable',
      'aethertrace.cache_hit': Boolean(span.cache_hit),
      'aethertrace.original_span_id': span.id
    };

    if (span.source_span_id) {
      attrRecord['aethertrace.source_span_id'] = span.source_span_id;
    }

    if (span.model) {
      attrRecord['gen_ai.request.model'] = span.model;
      attrRecord['gen_ai.response.model'] = span.model;
      attrRecord['gen_ai.system'] = span.model.toLowerCase().includes('claude')
        ? 'anthropic'
        : span.model.toLowerCase().includes('gemini')
        ? 'google'
        : 'openai';
    }

    if (span.prompt_tokens !== null && span.prompt_tokens !== undefined) {
      attrRecord['gen_ai.usage.input_tokens'] = span.prompt_tokens;
    }
    if (span.completion_tokens !== null && span.completion_tokens !== undefined) {
      attrRecord['gen_ai.usage.output_tokens'] = span.completion_tokens;
    }

    if (span.span_type === 'tool_call') {
      const toolName = reqPayload?.tool_name || span.agent_name;
      attrRecord['gen_ai.tool.name'] = toolName;
      if (reqPayload?.arguments) {
        attrRecord['gen_ai.tool.call.arguments'] = typeof reqPayload.arguments === 'string'
          ? reqPayload.arguments
          : JSON.stringify(reqPayload.arguments);
      }
      if (resPayload?.result !== undefined) {
        attrRecord['gen_ai.tool.call.result'] = typeof resPayload.result === 'string'
          ? resPayload.result
          : JSON.stringify(resPayload.result);
      }
    }

    // Check for errors
    let isError = false;
    let errorMessage = '';
    if (resPayload?.status === 'error' || resPayload?.error) {
      isError = true;
      errorMessage = typeof resPayload.error === 'string' ? resPayload.error : resPayload.error?.message || 'Error';
    }

    const safeAttrs = redactValue(attrRecord);
    const otlpAttrs = recordToOtlpAttributes(safeAttrs);

    const otlpSpan: OtlpSpan = {
      traceId,
      spanId,
      parentSpanId: parentSpanId || undefined,
      name: `${span.span_type}: ${span.agent_name}`,
      kind: span.span_type === 'tool_call' ? 1 : span.span_type === 'http_call' ? 3 : 1,
      startTimeUnixNano: startNs.toString(),
      endTimeUnixNano: endNs.toString(),
      attributes: otlpAttrs,
      status: isError ? { code: 2, message: errorMessage } : { code: 1 }
    };

    return otlpSpan;
  });

  const resourceAttrs = recordToOtlpAttributes(
    redactValue({
      'service.name': run.name || 'aethertrace-agent',
      'aethertrace.run_id': run.id,
      'aethertrace.run_status': run.status,
      'aethertrace.total_cost_usd': run.total_cost_usd,
      'aethertrace.total_tokens': run.total_tokens
    })
  );

  const resourceSpan: OtlpResourceSpans = {
    resource: {
      attributes: resourceAttrs
    },
    scopeSpans: [
      {
        scope: {
          name: '@aethertrace/core-schema',
          version: '0.2.0'
        },
        spans: otlpSpans
      }
    ]
  };

  return {
    resourceSpans: [resourceSpan]
  };
}
