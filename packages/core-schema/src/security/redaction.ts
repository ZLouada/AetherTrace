/**
 * AetherTrace Centralized Secret Detection & Redaction Engine
 */

export const REDACTED_MARKER = '[REDACTED]';

export interface SecretPatternRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const SECRET_RULES: SecretPatternRule[] = [
  // Anthropic Keys (must precede generic sk- to prevent shadowing)
  {
    name: 'ANTHROPIC_API_KEY',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]'
  },
  // OpenAI Keys (sk-..., sk-proj-..., sk-admin-...)
  {
    name: 'OPENAI_API_KEY',
    pattern: /\bsk-(?!(?:ant-))(?:proj-|admin-)?[a-zA-Z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:OPENAI_KEY]'
  },
  // AWS Access Key ID
  {
    name: 'AWS_ACCESS_KEY_ID',
    pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:AWS_KEY_ID]'
  },
  // AWS Secret Access Key (heuristics for 40-char base64 following aws indicators)
  {
    name: 'AWS_SECRET_KEY',
    pattern: /(?:aws_secret_access_key|aws_secret_key|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    replacement: '$1: [REDACTED:AWS_SECRET]'
  },
  // Google API Key
  {
    name: 'GOOGLE_API_KEY',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    replacement: '[REDACTED:GOOGLE_KEY]'
  },
  // GitHub Personal Access Tokens
  {
    name: 'GITHUB_TOKEN',
    pattern: /\bgh[pousr]_[0-9a-zA-Z]{36,}\b/g,
    replacement: '[REDACTED:GITHUB_TOKEN]'
  },
  // GitLab Personal Access Tokens
  {
    name: 'GITLAB_TOKEN',
    pattern: /\bglpat-[0-9a-zA-Z\-_]{20,}\b/g,
    replacement: '[REDACTED:GITLAB_TOKEN]'
  },
  // JSON Web Tokens (JWT)
  {
    name: 'JWT_TOKEN',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
    replacement: '[REDACTED:JWT]'
  },
  // Bearer Tokens
  {
    name: 'BEARER_AUTH',
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'Bearer [REDACTED]'
  },
  // Basic Auth Credentials
  {
    name: 'BASIC_AUTH',
    pattern: /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi,
    replacement: 'Basic [REDACTED]'
  },
  // Private Key Blocks (RSA, EC, DSA, OPENSSH, PGP)
  {
    name: 'PRIVATE_KEY',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:PRIVATE_KEY]'
  },
  // Database Connection Strings with Credentials
  {
    name: 'DATABASE_URL',
    pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi,
    replacement: '[REDACTED:DATABASE_URL]'
  }
];

// Sensitive structured field names (case-insensitive)
export const SENSITIVE_KEY_NAMES = new Set([
  'api_key',
  'apikey',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'client_secret',
  'clientsecret',
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'passwd',
  'pwd',
  'secret',
  'private_key',
  'privatekey',
  'token',
  'auth_token',
  'authtoken',
  'session_id',
  'sessionid',
  'x-api-key',
  'x-auth-token',
  'credentials',
  'credential',
  'id_rsa'
]);

// Operational keys that contain 'token' but should NOT be redacted
export const OPERATIONAL_TOKEN_KEYS = new Set([
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'max_tokens',
  'tokens',
  'token_count'
]);

export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  if (OPERATIONAL_TOKEN_KEYS.has(lower)) return false;

  const clean = lower.replace(/[-_]/g, '');
  if (SENSITIVE_KEY_NAMES.has(lower)) return true;
  for (const s of SENSITIVE_KEY_NAMES) {
    if (clean === s.replace(/[-_]/g, '')) return true;
  }

  // Common sensitive key compound patterns
  if (/(password|passwd|secret|api_?key|auth_?token|credential|private_?key)/i.test(key)) {
    return true;
  }

  return false;
}

/**
 * Redacts known secret tokens in a string.
 */
export function redactString(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const rule of SECRET_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

export const redactText = redactString;

/**
 * Recursively inspects and redacts any JS value (primitives, arrays, objects).
 * Safe against circular structures and prototype pollution.
 */
export function redactValue<T = any>(val: T, visited: WeakSet<object> = new WeakSet()): T {
  if (val === null || val === undefined) return val;

  // Primitives
  if (typeof val === 'string') {
    // If the string is valid JSON, parse it, redact the inner structure, and re-stringify
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(val);
        const redacted = redactValue(parsed, visited);
        return JSON.stringify(redacted) as unknown as T;
      } catch {
        // Not valid JSON, proceed with normal string pattern redaction
      }
    }
    return redactString(val) as unknown as T;
  }

  if (typeof val !== 'object') {
    return val;
  }

  // Circular reference defense
  if (visited.has(val as object)) {
    return '[CIRCULAR]' as unknown as T;
  }
  visited.add(val as object);

  // Arrays
  if (Array.isArray(val)) {
    return val.map((item) => redactValue(item, visited)) as unknown as T;
  }

  // Plain objects
  const result: Record<string, any> = {};
  for (const [key, propVal] of Object.entries(val)) {
    // Prototype pollution defense: never copy prototype keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (isSensitiveKey(key)) {
      result[key] = REDACTED_MARKER;
    } else {
      result[key] = redactValue(propVal, visited);
    }
  }

  return result as T;
}
