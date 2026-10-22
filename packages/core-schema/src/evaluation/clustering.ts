/**
 * AetherTrace — Deterministic Error Clustering Engine (Phase 13)
 */

import type { TraceSpan } from '../schema.js';
import type { ErrorCluster } from './types.js';
import { redactSensitiveData } from '../security/redaction.js';

/**
 * Normalizes error strings to collapse dynamic variables (UUIDs, timestamps, file paths)
 * into deterministic canonical patterns while redacting credentials.
 */
export function normalizeErrorMessage(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown Error';

  let cleaned = raw;

  // 1. Redact secrets first
  cleaned = redactSensitiveData(cleaned);

  // 2. Replace UUIDs (e.g. 550e8400-e29b-41d4-a716-446655440000)
  cleaned = cleaned.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>');

  // 3. Replace hex hashes (e.g. 0x1234abcd or 40-char git shas)
  cleaned = cleaned.replace(/\b[0-9a-f]{32,64}\b/gi, '<HASH>');
  cleaned = cleaned.replace(/0x[0-9a-fA-F]+/g, '<HEX>');

  // 4. Replace IP addresses (e.g. 192.168.1.1 or 127.0.0.1)
  cleaned = cleaned.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>');

  // 5. Replace file paths (e.g. /home/... or C:\...)
  cleaned = cleaned.replace(/(?:\/[a-zA-Z0-9_\-\.]+)+/g, '<PATH>');
  cleaned = cleaned.replace(/(?:[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+)/g, '<PATH>');

  // 6. Replace timestamps in ISO format
  cleaned = cleaned.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>');

  // 7. Replace port numbers and numeric values/durations (e.g. 800ms, 900ms)
  cleaned = cleaned.replace(/:\d+\b/g, ':<PORT>');
  cleaned = cleaned.replace(/\b\d+(?:ms|s|m|kb|mb)?\b/gi, '<NUM>');

  // 8. Collapse consecutive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned.slice(0, 200);
}

export function clusterErrors(spans: TraceSpan[]): ErrorCluster[] {
  const clusterMap = new Map<string, {
    errorType: string;
    normalizedMessage: string;
    occurrences: number;
    affectedRuns: Set<string>;
    affectedSpans: Set<string>;
    affectedTools: Set<string>;
    affectedModels: Set<string>;
    earliestOccurrence: number;
    samplePayload?: any;
  }>();

  for (const s of spans) {
    let hasError = false;
    let errorType = 'GenericError';
    let rawMsg = '';
    let parsedRes: any = null;

    if (s.response_payload) {
      try {
        parsedRes = JSON.parse(s.response_payload);
      } catch {}
    }

    // Check 1: Guardrail block
    if (s.span_type === 'guardrail_block') {
      hasError = true;
      errorType = 'GuardrailViolation';
      rawMsg = parsedRes?.message || parsedRes?.reason || 'Guardrail blocked execution';
    }

    // Check 2: Error in response payload
    if (parsedRes?.error) {
      hasError = true;
      if (typeof parsedRes.error === 'object') {
        errorType = parsedRes.error.type || parsedRes.error.code || 'APIError';
        rawMsg = parsedRes.error.message || JSON.stringify(parsedRes.error);
      } else {
        rawMsg = String(parsedRes.error);
        if (rawMsg.toLowerCase().includes('timeout')) errorType = 'ToolTimeout';
        else if (rawMsg.toLowerCase().includes('rate limit') || rawMsg.toLowerCase().includes('429')) errorType = 'RateLimitError';
        else if (rawMsg.toLowerCase().includes('invalid argument') || rawMsg.toLowerCase().includes('param')) errorType = 'InvalidToolArguments';
        else errorType = 'RuntimeError';
      }
    }

    // Check 3: HTTP status code error
    const statusCode = parsedRes?.status_code || parsedRes?.statusCode;
    if (statusCode && statusCode >= 400) {
      hasError = true;
      if (statusCode === 429) errorType = 'RateLimitError';
      else if (statusCode === 504 || statusCode === 408) errorType = 'TimeoutError';
      else if (statusCode >= 500) errorType = 'UpstreamServerError';
      else errorType = `HTTP_${statusCode}`;
      if (!rawMsg) rawMsg = `HTTP Error ${statusCode}`;
    }

    // Check 4: String search in payload if not caught
    if (!hasError && s.response_payload && /"error"/i.test(s.response_payload)) {
      hasError = true;
      errorType = 'UnhandledError';
      rawMsg = s.response_payload.slice(0, 150);
    }

    if (!hasError) continue;

    const normalized = normalizeErrorMessage(rawMsg || errorType);
    const clusterKey = `${errorType}::${normalized}`;

    let cluster = clusterMap.get(clusterKey);
    if (!cluster) {
      cluster = {
        errorType,
        normalizedMessage: normalized,
        occurrences: 0,
        affectedRuns: new Set(),
        affectedSpans: new Set(),
        affectedTools: new Set(),
        affectedModels: new Set(),
        earliestOccurrence: s.created_at,
        samplePayload: parsedRes?.error || parsedRes || rawMsg
      };
      clusterMap.set(clusterKey, cluster);
    }

    cluster.occurrences++;
    cluster.affectedRuns.add(s.run_id);
    cluster.affectedSpans.add(s.id);
    if (s.model) cluster.affectedModels.add(s.model);
    if (s.span_type === 'tool_call') {
      try {
        const req = JSON.parse(s.request_payload || '{}');
        const toolName = req.tool_name || req.function?.name || req.name || s.model || 'tool';
        cluster.affectedTools.add(toolName);
      } catch {}
    }
    if (s.created_at < cluster.earliestOccurrence) {
      cluster.earliestOccurrence = s.created_at;
    }
  }

  // Convert to array sorted by occurrences descending
  const results: ErrorCluster[] = [];
  let clusterIdx = 1;

  for (const [_, c] of clusterMap.entries()) {
    results.push({
      id: `cluster_${clusterIdx++}`,
      errorType: c.errorType,
      normalizedMessage: c.normalizedMessage,
      occurrences: c.occurrences,
      affectedRuns: Array.from(c.affectedRuns),
      affectedSpans: Array.from(c.affectedSpans),
      affectedTools: Array.from(c.affectedTools),
      affectedModels: Array.from(c.affectedModels),
      earliestOccurrence: c.earliestOccurrence,
      samplePayload: c.samplePayload
    });
  }

  return results.sort((a, b) => b.occurrences - a.occurrences);
}
