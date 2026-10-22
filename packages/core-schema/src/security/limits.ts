/**
 * AetherTrace Resource Bounds & Payload Truncation Engine
 */

export const DEFAULT_LIMITS = {
  MAX_PAYLOAD_STRING_BYTES: 512 * 1024, // 512 KB per span request/response payload
  MAX_REQUEST_BODY_BYTES: 10 * 1024 * 1024, // 10 MB HTTP request body
  MAX_IMPORT_BYTES: 50 * 1024 * 1024, // 50 MB .trace.json bundle import
  MAX_SPANS_PER_RUN: 5000,
  MAX_NESTING_DEPTH: 32,
  MAX_STRING_LENGTH: 1_000_000
};

export interface TruncatedPayloadResult {
  text: string;
  truncated: boolean;
  original_bytes: number;
  stored_bytes: number;
}

/**
 * Safely bounds string content to maxBytes with explicit audit metadata.
 * Never silently drops content without marking truncation.
 */
export function truncateWithMetadata(
  content: string | undefined | null,
  maxBytes: number = DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES
): TruncatedPayloadResult {
  if (content === null || content === undefined) {
    return { text: '', truncated: false, original_bytes: 0, stored_bytes: 0 };
  }

  const str = typeof content === 'string' ? content : String(content);
  const origBytes = Buffer.byteLength(str, 'utf-8');

  if (origBytes <= maxBytes) {
    return {
      text: str,
      truncated: false,
      original_bytes: origBytes,
      stored_bytes: origBytes
    };
  }

  // Truncate to boundary
  const markerPrefix = `\n... [TRUNCATED: original ${origBytes} bytes, stored `;
  const markerSuffix = ` bytes]`;
  const estimatedMarkerBytes = 80;
  const targetContentBytes = Math.max(100, maxBytes - estimatedMarkerBytes);

  let sliceLength = Math.min(str.length, targetContentBytes);
  let sliced = str.slice(0, sliceLength);
  while (Buffer.byteLength(sliced, 'utf-8') > targetContentBytes && sliceLength > 0) {
    sliceLength -= 50;
    sliced = str.slice(0, Math.max(0, sliceLength));
  }

  const storedBytes = Buffer.byteLength(sliced, 'utf-8');
  const finalMarker = `\n... [TRUNCATED: original ${origBytes} bytes, stored ${storedBytes} bytes]`;

  return {
    text: sliced + finalMarker,
    truncated: true,
    original_bytes: origBytes,
    stored_bytes: storedBytes
  };
}

/**
 * Checks an object's nesting depth to prevent stack overflow DoS.
 */
export function getObjectDepth(obj: any, currentDepth = 1): number {
  if (!obj || typeof obj !== 'object') return currentDepth;
  if (currentDepth > DEFAULT_LIMITS.MAX_NESTING_DEPTH) return currentDepth;

  let maxChildDepth = currentDepth;
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const val = obj[key];
    if (val && typeof val === 'object') {
      const d = getObjectDepth(val, currentDepth + 1);
      if (d > maxChildDepth) maxChildDepth = d;
      if (maxChildDepth > DEFAULT_LIMITS.MAX_NESTING_DEPTH) break;
    }
  }

  return maxChildDepth;
}
