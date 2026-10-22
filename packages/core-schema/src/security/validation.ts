/**
 * AetherTrace Trace Import Validation, Path Traversal Defense, and ID Sanitization
 */

import { resolve, normalize, isAbsolute } from 'node:path';
import { DEFAULT_LIMITS, getObjectDepth } from './limits.js';

export const ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;

/**
 * Validates an identifier (runId, spanId, etc.) against injection and path traversal.
 */
export function validateIdentifier(id: any, fieldName = 'ID'): { valid: boolean; error?: string } {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { valid: false, error: `${fieldName} must be a non-empty string` };
  }

  // Reject path traversal patterns
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    return { valid: false, error: `${fieldName} contains illegal path traversal or control characters` };
  }

  // Reject SQL injection / shell control characters
  if (id.includes(';') || id.includes("'") || id.includes('"') || id.includes('`') || id.includes('--')) {
    return { valid: false, error: `${fieldName} contains illegal SQL or shell control characters` };
  }

  if (!ID_REGEX.test(id)) {
    return { valid: false, error: `${fieldName} does not match allowed format (1-128 alphanumeric, dash, underscore, dot)` };
  }

  return { valid: true };
}

/**
 * Validates a filesystem path against directory traversal attacks.
 */
export function validateFilePath(
  targetPath: string,
  allowedRootDir: string = process.cwd()
): { valid: boolean; resolvedPath?: string; error?: string } {
  if (!targetPath || typeof targetPath !== 'string') {
    return { valid: false, error: 'File path must be a non-empty string' };
  }

  // Reject null bytes and obvious traversal attempts
  if (targetPath.includes('\0')) {
    return { valid: false, error: 'File path contains illegal null bytes' };
  }

  const normalized = normalize(targetPath);
  const resolved = isAbsolute(normalized) ? normalized : resolve(allowedRootDir, normalized);
  const resolvedRoot = resolve(allowedRootDir);

  // Path must be within allowedRootDir
  if (!resolved.startsWith(resolvedRoot)) {
    return { valid: false, error: `Path traversal detected: '${targetPath}' resolves outside allowed directory '${allowedRootDir}'` };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Recursively scans an object for prototype pollution injection keys.
 */
export function hasPrototypePollutionKeys(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;

  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    const val = obj[key];
    if (val && typeof val === 'object') {
      if (hasPrototypePollutionKeys(val)) return true;
    }
  }

  return false;
}

/**
 * Validates an imported .trace.json bundle against strict schema and resource limits.
 */
export function validateTraceBundle(bundle: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return { valid: false, errors: ['Import payload must be a JSON object'] };
  }

  // 1. Prototype pollution check
  if (hasPrototypePollutionKeys(bundle)) {
    return { valid: false, errors: ['Import payload contains illegal prototype keys (__proto__, constructor, prototype)'] };
  }

  // 2. Maximum nesting depth check
  const depth = getObjectDepth(bundle);
  if (depth > DEFAULT_LIMITS.MAX_NESTING_DEPTH) {
    return { valid: false, errors: [`Payload nesting depth (${depth}) exceeds maximum allowed (${DEFAULT_LIMITS.MAX_NESTING_DEPTH})`] };
  }

  // 3. Run validation
  const run = bundle.run || bundle;
  if (!run || typeof run !== 'object') {
    errors.push('Missing required "run" object in trace bundle');
  } else {
    const idCheck = validateIdentifier(run.id, 'run.id');
    if (!idCheck.valid) errors.push(idCheck.error!);

    if (run.name && (typeof run.name !== 'string' || run.name.length > 256)) {
      errors.push('run.name must be a string <= 256 characters');
    }

    if (run.parent_run_id) {
      const parentCheck = validateIdentifier(run.parent_run_id, 'run.parent_run_id');
      if (!parentCheck.valid) errors.push(parentCheck.error!);
    }

    if (run.forked_at_span_id) {
      const forkCheck = validateIdentifier(run.forked_at_span_id, 'run.forked_at_span_id');
      if (!forkCheck.valid) errors.push(forkCheck.error!);
    }

    if (run.total_tokens !== undefined && (typeof run.total_tokens !== 'number' || run.total_tokens < 0)) {
      errors.push('run.total_tokens must be a non-negative number');
    }

    if (run.total_cost_usd !== undefined && (typeof run.total_cost_usd !== 'number' || run.total_cost_usd < 0)) {
      errors.push('run.total_cost_usd must be a non-negative number');
    }
  }

  // 4. Spans validation
  const spans = bundle.spans || [];
  if (!Array.isArray(spans)) {
    errors.push('bundle.spans must be an array');
  } else {
    if (spans.length > DEFAULT_LIMITS.MAX_SPANS_PER_RUN) {
      errors.push(`Spans count (${spans.length}) exceeds maximum limit (${DEFAULT_LIMITS.MAX_SPANS_PER_RUN})`);
    }

    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (!s || typeof s !== 'object') {
        errors.push(`Span at index ${i} is not a valid object`);
        continue;
      }

      const spanIdCheck = validateIdentifier(s.id, `spans[${i}].id`);
      if (!spanIdCheck.valid) {
        errors.push(spanIdCheck.error!);
        break; // Stop spamming errors
      }

      if (s.parent_span_id) {
        const parentSpanCheck = validateIdentifier(s.parent_span_id, `spans[${i}].parent_span_id`);
        if (!parentSpanCheck.valid) {
          errors.push(parentSpanCheck.error!);
          break;
        }
      }

      if (s.prompt_tokens !== undefined && (typeof s.prompt_tokens !== 'number' || s.prompt_tokens < 0)) {
        errors.push(`spans[${i}].prompt_tokens must be a non-negative number`);
        break;
      }
      if (s.completion_tokens !== undefined && (typeof s.completion_tokens !== 'number' || s.completion_tokens < 0)) {
        errors.push(`spans[${i}].completion_tokens must be a non-negative number`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
