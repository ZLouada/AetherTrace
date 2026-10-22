/**
 * AetherTrace URL & Query Parameter Sanitization
 */

export const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'signature',
  'sig',
  'auth',
  'client_secret',
  'code',
  'session_id'
]);

export const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * Sanitizes URLs by redacting sensitive query parameter values.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  try {
    const parsed = new URL(rawUrl);
    let modified = false;

    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    }

    // Strip password in userinfo (e.g. https://user:pass@example.com)
    if (parsed.password) {
      parsed.password = '[REDACTED]';
      modified = true;
    }

    return modified ? parsed.toString() : rawUrl;
  } catch {
    // If not a valid standalone URL, apply heuristic regex
    return rawUrl.replace(
      /([?&](?:token|access_token|api_key|apikey|key|secret|password|sig|signature)=)([^&#\s]+)/gi,
      '$1[REDACTED]'
    );
  }
}

/**
 * Validates a URL for safe rendering as an active clickable link in UI.
 * Returns null if scheme is dangerous (e.g. javascript:, data:, file:, vbscript:).
 */
export function sanitizeLinkUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  // Quick pre-check for dangerous pseudo-protocols
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!SAFE_URL_SCHEMES.has(parsed.protocol.toLowerCase())) {
      return null;
    }
    return sanitizeUrl(parsed.toString());
  } catch {
    // Relative safe path (e.g. /api/runs or #tag)
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
      return trimmed;
    }
    return null;
  }
}
