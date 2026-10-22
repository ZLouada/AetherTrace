# AetherTrace — Threat Model & Risk Analysis (Phase 7)

This document formalizes the threat model for **AetherTrace**, the local developer infrastructure and debugging proxy for AI agents ("Wireshark for AI Agents").

---

## 1. Trust Boundaries & Operational Context

AetherTrace operates primarily as a **local-first, developer-machine infrastructure**. It intercepts, records, replays, and debugs agent interactions with LLM providers, internal microservices, tools, and vector stores.

### Trust Domains:
1. **Developer Machine (Trusted Zone):**
   - The developer running the CLI and Flight Deck UI.
   - Local configuration files (`.aethertrace/config.json`, `.trace.sqlite`).
2. **Untrusted Agent Payloads & External Imports (Untrusted Zone):**
   - Agent outputs, tool call arguments, external tool outputs, third-party web responses.
   - Imported `.trace.json` bundles originating from other developers, CI runners, or community issue trackers.
   - Upstream LLM responses (which may contain prompt injections or embedded secrets).
3. **Upstream Providers & Network Perimeters (Protected Boundary):**
   - Upstream LLM APIs (OpenAI, Anthropic, Gemini, local Ollama).
   - Localhost and private intranet services (internal DBs, cloud metadata endpoints `169.254.169.254`, VPCs).

---

## 2. Threat Matrix (T1 – T12)

| Threat ID | Threat Vector | Impact | Mitigation Strategy | Implemented Component |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | **Secret / Credential Exfiltration** | High | Multi-engine regex matching + recursive object redaction on store & export | `core-schema/security/redaction.ts` |
| **T2** | **Server-Side Request Forgery (SSRF)** | Critical | Strict private IP / loopback / cloud metadata denylist + redirect validation | `core-schema/security/ssrf.ts` & proxy route |
| **T3** | **Unintended Side Effects on Replay** | High | Tool safety classification (pure vs mutating) + dry-run/mock enforcement | `core-schema/security/replay-policy.ts` |
| **T4** | **Breakpoint Code Execution (RCE)** | Critical | Zero-eval safe property accessor; absolute ban on `eval()` and `Function()` | `core-schema/security/sandbox.ts` |
| **T5** | **Path Traversal via IDs / Bundles** | High | Strict alphanumeric regex validation on all run/span/trace IDs | `core-schema/security/validation.ts` |
| **T6** | **Denial of Service (DoS) via Traces** | Medium | Bounded payload limits (512KB span, 50MB bundle, 5,000 max spans) | `core-schema/security/limits.ts` |
| **T7** | **Financial Runaway on Replay** | High | Pre-replay cost calculation + mandatory confirmation gate for live spend | `core-schema/security/replay-policy.ts` & traces route |
| **T8** | **XSS / Malicious Link Schemes** | Medium | Strict URI protocol validator blocking `javascript:`, `data:`, `file:` | `core-schema/security/urls.ts` |
| **T9** | **Unauthenticated Network Access** | Medium | Optional token auth via `AETHERTRACE_AUTH_TOKEN` + localhost binding by default | `proxy-server/index.ts` |
| **T10** | **Memory Exhaustion via Logs** | Medium | Fixed-size ring buffer for security audit events + bounded WebSocket connections | `core-schema/security/audit.ts` |
| **T11** | **Trace Tampering & Lineage Spoofing** | Medium | Parent DAG cycle detection + cryptographic lineage hash verification | `core-schema/dag/` & `git/provenance.ts` |
| **T12** | **Accidental Secret Leakage in Exports** | High | Mandatory redaction pass on all exported `.trace.json` bundles | `proxy-server/routes/traces.ts` |

---

## 3. Detailed Threat Analysis & Mitigations

### T1: Secret & Credential Exfiltration
- **Vulnerability:** AI agents frequently manipulate raw API keys, bearer tokens, passwords, and private certificates within prompts, environment variables, and tool outputs. Unsanitized traces could commit secrets to git, export them to teammates, or persist them in plain text SQLite.
- **Mitigation:** AetherTrace implements an active dual-layer redaction pipeline. High-confidence regex engines identify OpenAI keys (`sk-proj-...`, `sk-...`), Anthropic keys (`sk-ant-...`), AWS Access IDs (`AKIA...`), Google API keys (`AIzaSy...`), GitHub/GitLab PATs (`ghp_...`, `glpat-..`), PEM keys, database URLs, and bearer headers. Furthermore, an object walker redacts sensitive key patterns (`apiKey`, `password`, `secret`) while strictly preserving operational token counts (`prompt_tokens`, `total_tokens`).

### T2: Server-Side Request Forgery (SSRF)
- **Vulnerability:** When acting as a proxy, an agent or trace bundle might configure `x-target-url` or `x-target-base-url` pointing to internal services (e.g., `http://169.254.169.254/latest/meta-data/` or `http://localhost:6379`).
- **Mitigation:** The SSRF shield parses target hostnames and resolved IPs against IPv4/IPv6 loopback (`127.0.0.0/8`, `::1`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata ranges (`169.254.0.0/16`), and alternative encodings (decimal, hex). Targets are evaluated before any upstream connection or circuit-breaker bypass. Redirects are validated iteratively.

### T3 & T7: Unintended Mutation & Financial Runaway during Replay
- **Vulnerability:** Replaying an agent execution could re-trigger mutating side-effect tools (e.g., `delete_database_table`, `send_email`, `charge_card`) or incur high financial cost by invoking costly model endpoints unconstrained.
- **Mitigation:** The Replay Engine classifies tools into `pure`, `read_only`, `mutating`, and `unknown`. In `cache_only` mode, network execution is prohibited. In `safe_replay` mode, mutating tools are automatically mocked with cached responses. In `live_replay` mode, an upfront cost estimation is calculated; live calls require an explicit `confirm_live: true` flag in the request body, preventing accidental billing spikes.

### T4: Prototype Pollution & Breakpoint AST Injection
- **Vulnerability:** Breakpoint conditions evaluate JSON attributes (e.g. `payload.usage.total_tokens > 500`). Using JavaScript `eval()` or `Function()` would permit arbitrary code execution if trace conditions contain malicious payloads.
- **Mitigation:** Strict **Zero-Eval Policy**. Property resolution uses a deterministic, non-eval path traversal (`safeGetProperty`) that explicitly rejects dangerous prototype and runtime properties (`__proto__`, `constructor`, `prototype`, `globalThis`, `process`, `eval`).

### T5 & T6: Resource Exhaustion & Path Traversal in Trace Bundles
- **Vulnerability:** Malicious trace bundles imported via `POST /api/runs/import` could contain directory traversal sequences in run/span IDs (`../../etc/passwd`) or billion-laughs JSON structures that exhaust host memory.
- **Mitigation:** Identifiers must strictly conform to `/^[a-zA-Z0-9_\-\.]{1,128}$/`. Path traversals and SQL injection characters are rejected with HTTP 400. Imported files are bounded to 50MB, spans to 5,000 maximum per run, individual payload objects to 512KB, and object nesting depth to 32 levels.
