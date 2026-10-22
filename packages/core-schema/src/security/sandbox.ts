/**
 * AetherTrace Zero-Eval & Property Accessor Sandbox Guard
 */

export const FORBIDDEN_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'globalThis',
  'process',
  'require',
  'import',
  'eval',
  'Function',
  'mainModule',
  'binding'
]);

export function isForbiddenProperty(propName: string): boolean {
  if (!propName || typeof propName !== 'string') return false;
  return FORBIDDEN_PROPERTY_NAMES.has(propName.trim().toLowerCase());
}

/**
 * Safely traverses nested properties without prototype pollution or eval.
 */
export function safeGetProperty(target: any, path: string): any {
  if (!target || typeof target !== 'object' || !path || typeof path !== 'string') {
    return undefined;
  }

  const parts = path.split('.');
  let current = target;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const cleanPart = part.trim();

    if (isForbiddenProperty(cleanPart)) {
      return undefined;
    }

    // Never access prototype properties directly
    if (!Object.prototype.hasOwnProperty.call(current, cleanPart) && typeof current[cleanPart] === 'function') {
      return undefined;
    }

    current = current[cleanPart];
  }

  return current;
}
