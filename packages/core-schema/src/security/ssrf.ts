/**
 * AetherTrace Server-Side Request Forgery (SSRF) Defense Engine
 */

import { isIP } from 'node:net';

export interface SsrfValidationResult {
  safe: boolean;
  allowed: boolean;
  reason?: string;
  normalizedUrl?: string;
}

/**
 * Checks whether an IPv4 numeric value falls within a given CIDR block.
 */
function ipInCidr(ipNum: number, cidrBase: number, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipNum & mask) === (cidrBase & mask);
}

/**
 * Parses dotted decimal or alternate representations of IPv4 addresses into a 32-bit uint.
 */
function parseIpv4ToNumber(rawHost: string): number | null {
  // Strip enclosing brackets for IPv6 if present
  let host = rawHost.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  // Handle pure decimal integer (e.g. 2130706433 -> 127.0.0.1)
  if (/^\d+$/.test(host)) {
    const num = Number(host);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return num >>> 0;
    }
  }

  // Handle hex format (e.g. 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const num = parseInt(host, 16);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return num >>> 0;
    }
  }

  // Standard dotted format (may contain octal or hex in parts)
  const parts = host.split('.');
  if (parts.length === 4) {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      const p = parts[i];
      let val: number;
      if (p.startsWith('0x') || p.startsWith('0X')) {
        val = parseInt(p, 16);
      } else if (p.length > 1 && p.startsWith('0')) {
        val = parseInt(p, 8); // Octal
      } else if (/^\d+$/.test(p)) {
        val = parseInt(p, 10);
      } else {
        return null;
      }

      if (isNaN(val) || val < 0 || val > 255) return null;
      result = ((result << 8) | val) >>> 0;
    }
    return result;
  }

  return null;
}

/**
 * Checks if an IPv4 uint belongs to private, loopback, or metadata networks.
 */
function isPrivateOrReservedIpv4(ipNum: number): boolean {
  // 0.0.0.0/8 (Current network)
  if (ipInCidr(ipNum, 0x00000000, 8)) return true;

  // 127.0.0.0/8 (Loopback)
  if (ipInCidr(ipNum, 0x7f000000, 8)) return true;

  // 10.0.0.0/8 (RFC1918 Private)
  if (ipInCidr(ipNum, 0x0a000000, 8)) return true;

  // 172.16.0.0/12 (RFC1918 Private)
  if (ipInCidr(ipNum, 0xac100000, 12)) return true;

  // 192.168.0.0/16 (RFC1918 Private)
  if (ipInCidr(ipNum, 0xc0a80000, 16)) return true;

  // 169.254.0.0/16 (Link-Local, AWS/GCP Metadata 169.254.169.254)
  if (ipInCidr(ipNum, 0xa9fe0000, 16)) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (ipInCidr(ipNum, 0x64400000, 10)) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (ipInCidr(ipNum, 0xe0000000, 4) || ipInCidr(ipNum, 0xf0000000, 4)) return true;

  return false;
}

/**
 * Checks if an IPv6 address string belongs to loopback, link-local, or unique-local.
 */
function isPrivateOrReservedIpv6(host: string): boolean {
  let clean = host.toLowerCase().trim();
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1);
  }

  // ::1 loopback
  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
  // :: unspecified
  if (clean === '::' || clean === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:')) {
    const v4Part = clean.replace('::ffff:', '');
    const num = parseIpv4ToNumber(v4Part);
    if (num !== null && isPrivateOrReservedIpv4(num)) return true;
  }

  // fe80::/10 (Link-Local)
  if (/^fe[89ab][0-9a-f]:/i.test(clean) || clean.startsWith('fe80:')) return true;

  // fc00::/7 (Unique Local)
  if (/^f[cd][0-9a-f]{2}:/i.test(clean)) return true;

  return false;
}

/**
 * Known internal hostnames strictly blocked from outbound requests.
 */
export const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254'
]);

/**
 * Validates a target URL against SSRF policy.
 */
export function validateTargetUrl(
  rawUrl: string,
  options: { allowPrivateNetwork?: boolean } = {}
): SsrfValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, allowed: false, reason: 'Missing or empty target URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, allowed: false, reason: 'Malformed URL syntax' };
  }

  // Protocol check: only http and https allowed
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { safe: false, allowed: false, reason: `Forbidden URL scheme '${protocol}' (only http: and https: allowed)` };
  }

  const host = parsed.hostname.toLowerCase();

  // Explicit opt-out flag for testing/internal proxy setups
  if (options.allowPrivateNetwork) {
    return { safe: true, allowed: true, normalizedUrl: parsed.toString() };
  }

  // Check forbidden hostnames & suffix patterns
  if (FORBIDDEN_HOSTNAMES.has(host)) {
    return { safe: false, allowed: false, reason: `Access to internal host '${host}' is blocked by SSRF policy` };
  }

  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return { safe: false, allowed: false, reason: `Access to internal domain '${host}' is blocked by SSRF policy` };
  }

  // Check IPv4
  const ipv4Num = parseIpv4ToNumber(host);
  if (ipv4Num !== null) {
    if (isPrivateOrReservedIpv4(ipv4Num)) {
      return { safe: false, allowed: false, reason: `Target IP address '${host}' resides in private or reserved network space` };
    }
  }

  // Check IPv6
  if (isIP(host) === 6 || host.includes(':')) {
    if (isPrivateOrReservedIpv6(host)) {
      return { safe: false, allowed: false, reason: `Target IPv6 address '${host}' resides in private or loopback network space` };
    }
  }

  return { safe: true, allowed: true, normalizedUrl: parsed.toString() };
}

/**
 * Validates HTTP redirect location header to prevent SSRF bypass via 301/302 redirects.
 */
export function validateRedirect(
  originalUrl: string,
  redirectLocation: string,
  options: { allowPrivateNetwork?: boolean } = {}
): SsrfValidationResult {
  if (!redirectLocation) {
    return { safe: false, allowed: false, reason: 'Empty redirect location' };
  }

  try {
    const resolvedUrl = new URL(redirectLocation, originalUrl).toString();
    return validateTargetUrl(resolvedUrl, options);
  } catch {
    return { safe: false, allowed: false, reason: 'Invalid redirect URL resolution' };
  }
}
