import { eq } from 'drizzle-orm';
import { trace_runs, trace_spans, type TraceRun, type TraceSpan } from '../schema.js';
import { recordSecurityAudit, DEFAULT_LIMITS } from '../security/index.js';
import { type OtlpExportTraceServiceRequest } from './types.js';
import { mapOtlpToAetherTrace } from './mapper.js';

export interface ImportOtlpResult {
  success: boolean;
  runId: string;
  runName: string;
  spanCount: number;
  totalTokens: number;
  totalCostUsd: number;
  status: string;
}

/**
 * Safely imports an OTLP ExportTraceServiceRequest into the local SQLite database.
 */
export function importOtlpTrace(
  db: any,
  sqlite: any,
  request: OtlpExportTraceServiceRequest,
  options: { runNameOverride?: string; runIdOverride?: string } = {}
): ImportOtlpResult {
  const { run, spans } = mapOtlpToAetherTrace(request, options);

  const tx = sqlite.transaction(() => {
    // Delete conflicting spans if re-importing the same trace ID
    sqlite.prepare('DELETE FROM trace_spans WHERE run_id = ?').run(run.id);
    sqlite.prepare('DELETE FROM trace_runs WHERE id = ?').run(run.id);

    // Insert run
    db.insert(trace_runs).values(run).run();

    // Insert spans in batches
    if (spans.length > 0) {
      for (const span of spans) {
        db.insert(trace_spans).values(span).run();
      }
    }
  });

  tx();

  recordSecurityAudit({
    operation: 'otel_trace_imported',
    runId: run.id,
    result: 'allowed',
    details: {
      runName: run.name,
      spanCount: spans.length,
      totalCostUsd: run.total_cost_usd,
      totalTokens: run.total_tokens
    }
  });

  return {
    success: true,
    runId: run.id,
    runName: run.name || 'imported-run',
    spanCount: spans.length,
    totalTokens: run.total_tokens || 0,
    totalCostUsd: run.total_cost_usd || 0,
    status: run.status || 'completed'
  };
}

/**
 * Validates and imports raw OTLP JSON string.
 */
export function parseAndImportOtlpJson(
  db: any,
  sqlite: any,
  rawJson: string,
  options: { runNameOverride?: string; runIdOverride?: string } = {}
): ImportOtlpResult {
  const byteLength = Buffer.byteLength(rawJson, 'utf-8');
  if (byteLength > DEFAULT_LIMITS.MAX_IMPORT_BYTES) {
    recordSecurityAudit({
      operation: 'otel_trace_imported',
      result: 'blocked',
      reason: `OTel payload exceeds maximum limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`
    });
    throw new Error(`Payload exceeds maximum import limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    throw new Error(`Invalid OTLP JSON payload: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OTLP payload must be an object');
  }

  return importOtlpTrace(db, sqlite, parsed as OtlpExportTraceServiceRequest, options);
}
