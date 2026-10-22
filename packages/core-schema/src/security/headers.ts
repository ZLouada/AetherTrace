/**
 * AetherTrace HTTP Header Sanitization & Policy
 */

export const DENIED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'api-key',
  'x-access-token',
  'x-openai-api-key',
  'x-anthropic-api-key',
  'x-aws-access-key-id',
  'x-aws-secret-access-key',
  'x-amz-security-token'
]);

export const SAFE_DIAGNOSTIC_HEADERS = new Set([
  'content-type',
  'content-length',
  'accept',
  'accept-encoding',
  'user-agent',
  'host',
  'connection',
  'x-run-id',
  'x-run-name',
  'x-span-id',
  'x-parent-span-id',
  'x-agent-name',
  'x-replay-mode',
  'x-mock-upstream',
  'x-breakpoint',
  'x-chaos-inject',
  'x-target-base-url'
]);

export function isDeniedHeader(headerName: string): boolean {
  if (!headerName) return false;
  return DENIED_HEADERS.has(headerName.toLowerCase());
}

export function isSafeHeader(headerName: string): boolean {
  if (!headerName) return false;
  return SAFE_DIAGNOSTIC_HEADERS.has(headerName.toLowerCase());
}

/**
 * Sanitizes HTTP headers for trace storage or export.
 * Denied headers are stripped or redacted.
 */
export function sanitizeHeaders(
  headers: Record<string, any> | undefined | null,
  options: { redactInsteadOfDrop?: boolean; strictAllowlistOnly?: boolean } = {}
): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};

  const sanitized: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const strVal = String(rawValue ?? '');

    // 1. If denied header
    if (isDeniedHeader(lowerKey)) {
      if (options.redactInsteadOfDrop) {
        sanitized[key] = '[REDACTED]';
      }
      continue;
    }

    // 2. Strict allowlist mode
    if (options.strictAllowlistOnly && !isSafeHeader(lowerKey)) {
      continue;
    }

    // 3. Keep sanitized value
    sanitized[key] = strVal;
  }

  return sanitized;
}
