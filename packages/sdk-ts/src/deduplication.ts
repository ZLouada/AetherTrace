/**
 * AetherTrace Deduplication & Idempotency Context Helpers
 * Prevents double-instrumentation when both framework callbacks and HTTP proxy observe a call.
 */

import { randomUUID } from 'node:crypto';

export interface DeduplicationMarker {
  spanId: string;
  operationId: string;
  source: 'sdk' | 'langchain' | 'openai' | 'custom';
  timestamp: number;
}

const activeOperations = new Map<string, DeduplicationMarker>();

/**
 * Registers an in-flight operation to prevent secondary layers from duplicating the span.
 */
export function registerOperation(spanId?: string, source: DeduplicationMarker['source'] = 'sdk'): DeduplicationMarker {
  const opId = randomUUID();
  const id = spanId || `span_${randomUUID()}`;
  const marker: DeduplicationMarker = {
    spanId: id,
    operationId: opId,
    source,
    timestamp: Date.now()
  };
  activeOperations.set(id, marker);
  return marker;
}

/**
 * Checks whether an operation is already instrumented.
 */
export function isOperationTracked(spanId: string): boolean {
  return activeOperations.has(spanId);
}

/**
 * Clears an in-flight operation marker after completion.
 */
export function unregisterOperation(spanId: string): void {
  activeOperations.delete(spanId);
}

/**
 * Returns HTTP headers signaling to the interceptor proxy that this call is already client-instrumented.
 */
export function getDeduplicationHeaders(spanId?: string): Record<string, string> {
  const id = spanId || `span_${randomUUID()}`;
  return {
    'X-AetherTrace-Span-Id': id,
    'X-AetherTrace-Instrumented': 'client'
  };
}
