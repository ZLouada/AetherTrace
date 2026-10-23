import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  getDatabase,
  trace_runs,
  DEFAULT_LIMITS,
  recordSecurityAudit,
  parseAndImportOtlpJson
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';

export const otelRouter = new Hono();

/**
 * POST /v1/traces - Standard OpenTelemetry OTLP/HTTP Trace Collector Endpoint
 */
otelRouter.post('/v1/traces', async (c) => {
  const { db, sqlite } = getDatabase();

  const rawText = await c.req.text();
  if (Buffer.byteLength(rawText, 'utf-8') > DEFAULT_LIMITS.MAX_IMPORT_BYTES) {
    recordSecurityAudit({
      operation: 'otel_trace_imported',
      result: 'blocked',
      reason: `OTLP payload exceeds limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`
    });
    return c.json({
      error: 'Payload Too Large',
      message: `Payload exceeds limit (${DEFAULT_LIMITS.MAX_IMPORT_BYTES} bytes)`
    }, 413);
  }

  try {
    const result = parseAndImportOtlpJson(db, sqlite, rawText);

    const run = db.select().from(trace_runs).where(eq(trace_runs.id, result.runId)).limit(1).all()[0];
    if (run) {
      broadcastEvent({
        type: 'RUN_CREATED',
        data: run,
        runId: result.runId
      });
    }

    // Return standard OTLP JSON success response
    return c.json({
      partialSuccess: {}
    }, 200);
  } catch (err: any) {
    recordSecurityAudit({
      operation: 'otel_trace_imported',
      result: 'blocked',
      reason: err.message
    });
    return c.json({
      error: 'Bad Request',
      message: err.message || 'Invalid OTLP trace payload'
    }, 400);
  }
});
