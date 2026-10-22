/**
 * AetherTrace Security Audit Trail Engine
 */

import { randomUUID } from 'node:crypto';
import type { SecurityAuditEvent } from './types.js';
import { redactValue } from './redaction.js';

const MAX_AUDIT_LOG_SIZE = 200;
const auditLogBuffer: SecurityAuditEvent[] = [];

/**
 * Records a security audit event into the ring buffer.
 * Automatically sanitizes details to prevent secret leakage into the audit trail.
 */
export function recordSecurityAudit(
  event: Omit<SecurityAuditEvent, 'id' | 'timestamp'>
): SecurityAuditEvent {
  const auditEvent: SecurityAuditEvent = {
    id: `sec_${randomUUID()}`,
    timestamp: Date.now(),
    operation: event.operation,
    runId: event.runId,
    spanId: event.spanId,
    result: event.result,
    reason: event.reason,
    details: event.details ? redactValue(event.details) : undefined
  };

  auditLogBuffer.unshift(auditEvent);
  if (auditLogBuffer.length > MAX_AUDIT_LOG_SIZE) {
    auditLogBuffer.pop();
  }

  return auditEvent;
}

/**
 * Returns recent security audit log entries.
 */
export function getSecurityAuditLog(limit = 50): SecurityAuditEvent[] {
  return auditLogBuffer.slice(0, Math.min(limit, auditLogBuffer.length));
}

/**
 * Clears the in-memory audit log (primarily for test resets).
 */
export function clearSecurityAuditLog(): void {
  auditLogBuffer.length = 0;
}
