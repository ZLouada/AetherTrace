# AetherTrace — Security Model & Architecture (Phase 7)

## Architectural Principle: Defense in Depth for Local AI Infrastructure

AetherTrace is designed around the core tenet that **trace payloads and agent executions are untrusted data**. Developers inspecting complex multi-agent workflows must not be exposed to credential exfiltration, arbitrary code execution, server-side request forgery (SSRF), or uncontrolled cloud expenditure.

```
                          INGRESS & INTERCEPTION
                                    │
                                    ▼
                          ┌────────────────────┐
                          │   Payload Limits   │ ◄── Bounded memory (512KB payload, 10MB req)
                          └─────────┬──────────┘
                                    │
                                    ▼
                          ┌────────────────────┐
                          │    SSRF Shield     │ ◄── Block RFC1918, 127.0.0.1, 169.254.169.254
                          └─────────┬──────────┘
                                    │
                                    ▼
                          ┌────────────────────┐
                          │   Redaction Core   │ ◄── High-confidence API keys, tokens, auth
                          └─────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
          ┌─────────────────────┐       ┌─────────────────────┐
          │   SQLite Storage    │       │ WebSocket Broadcast │
          │ (Redacted at rest)  │       │ (Sanitized in flight│
          └─────────────────────┘       └─────────────────────┘
```

---

## 1. Zero-Eval Policy & Safe Property Accessor

To support dynamic breakpoint pausing (e.g. `payload.usage.total_tokens > 2000` or `event_type == 'tool'`), the engine must evaluate condition rules against span attributes.

### What is Prohibited:
- No invocation of JavaScript `eval()` or `Function()`.
- No dynamic compilation of expressions into executable bytecode.

### What is Enforced (`packages/core-schema/src/security/sandbox.ts`):
- `safeGetProperty(target, path)`: Traverses object trees using deterministic dot-separated paths.
- **Forbidden Properties Denylist:**
  ```typescript
  const FORBIDDEN_PROPERTIES = new Set([
    '__proto__',
    'constructor',
    'prototype',
    'globalThis',
    'process',
    'eval',
    'Function',
    'require',
    'import',
  ]);
  ```
- If an attacker or malformed trace supplies a property path traversing prototype or process globals, traversal terminates immediately returning `undefined`, and a `breakpoint_condition_blocked` security audit event is logged.
- Comparison operators (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`) operate purely on primitive values (numbers, strings, booleans).

---

## 2. Redaction Architecture

Credentials must never be persisted to `.trace.sqlite`, sent to the Flight Deck UI, or exported to `.trace.json` bundles.

### Detection Mechanisms:
1. **High-Confidence Regex Rules:**
   - **OpenAI:** `sk-[A-Za-z0-9_-]{20,}` and `sk-proj-[A-Za-z0-9_-]{20,}`
   - **Anthropic:** `sk-ant-[A-Za-z0-9_-]{20,}` (evaluated before legacy OpenAI patterns to prevent prefix shadowing)
   - **AWS Access Keys:** `AKIA[0-9A-Z]{16}`
   - **Google Gemini / Cloud Keys:** `AIzaSy[A-Za-z0-9_-]{33}`
   - **GitHub & GitLab PATs:** `ghp_[A-Za-z0-9]{36}`, `glpat-[A-Za-z0-9_-]{20,}`
   - **Authorization Headers:** `Bearer <token>`, `Basic <base64>`
   - **Database Connection Strings:** `postgres://user:pass@host/db`, `mysql://...`, `mongodb://...`
   - **Private Cryptographic Keys:** `-----BEGIN [A-Z ]*PRIVATE KEY-----`
2. **Deep Object Redaction & Operational Preservation:**
   - Compound key heuristics redact properties named `password`, `apiKey`, `client_secret`, etc.
   - **Operational Key Preservation (`OPERATIONAL_TOKEN_KEYS`):** Crucial LLM token counters (`prompt_tokens`, `completion_tokens`, `total_tokens`, `input_tokens`, `output_tokens`) are explicitly protected from naive token substring matches.
   - **Circular Reference Defense:** Object traversal maintains a `WeakSet` of visited references, safely substituting circular structures with `[CIRCULAR]`.

---

## 3. SSRF Shield (Server-Side Request Forgery)

When forwarding requests or resolving targets via `x-target-url` or `x-target-base-url`:

1. **Protocol Restriction:** Only `http:` and `https:` schemes are allowed. Schemes like `file:`, `gopher:`, `ftp:`, `javascript:` are rejected immediately.
2. **IP & Range Denylist:**
   - Loopback: `127.0.0.0/8`, `::1`, `localhost`
   - RFC 1918 Private Ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Cloud Metadata / Link-Local: `169.254.0.0/16`, `fe80::/10`
   - Hex / Decimal Encodings: e.g., `2130706433` (`127.0.0.1`) or `0x7f000001`
3. **HTTP Redirect Validation:**
   - When following redirects, `validateRedirect()` inspects the subsequent `Location` target before sending the next hop.

---

## 4. Resource Bounds & Import Hardening

To guard against DoS via memory consumption or disk exhaustion:

| Parameter | Limit | Enforcement Point |
| :--- | :--- | :--- |
| **Max Request Body** | 10 MB | HTTP Middleware |
| **Max Import Bundle** | 50 MB | `POST /api/runs/import` |
| **Max Payload Size** | 512 KB | Span ingestion (`truncateWithMetadata`) |
| **Max Spans per Run** | 5,000 | Ingestion & bundle validation |
| **Max Nesting Depth** | 32 levels | Recursive JSON validation |
| **Identifier Length** | 128 chars | Regex `/^[a-zA-Z0-9_\-\.]{1,128}$/` |
| **Audit Log Capacity** | 500 events | In-memory Ring Buffer |

---

## 5. Security Audit Telemetry

Security violations and sensitive actions are recorded in an in-memory ring buffer (`packages/core-schema/src/security/audit.ts`):
- `secret_redacted`: Triggered during span redaction.
- `ssrf_blocked`: Triggered when an internal or private target is requested.
- `payload_truncated`: Triggered when span payloads exceed size limits.
- `breakpoint_condition_blocked`: Triggered on prototype pollution or forbidden property access.
- `trace_bundle_rejected`: Triggered on invalid or malicious trace imports.
- `live_replay_confirmed`: Triggered when live replay is authorized.
- `fork_created`: Triggered on branch creation.

The audit log is queryable via `GET /api/security/audit` and exposed on the Flight Deck status indicator.
