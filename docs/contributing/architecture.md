# Architecture Guide for Contributors

This document explains the technical foundations of AetherTrace to help new contributors make targeted, confident changes without destabilizing core engines.

---

## 1. System Invariants

When adding features or refactoring code, always adhere to these non-negotiable principles:

1. **Local-First & Zero-Cloud:** Never introduce remote analytics, external telemetry services, or cloud database requirements. All telemetry must persist in local SQLite (`.trace.sqlite`).
2. **Zero-Eval Security Sandbox:** Never execute user-provided code or expressions via `eval()` or `Function()`. Breakpoint conditions and search queries use AST-based tokenizers and deterministic property lookups with prototype pollution defenses.
3. **Secret Redaction by Default:** Never write raw API keys (`sk-...`, `AKIA...`, `ghp_...`) into `.trace.sqlite` or search index projections. All values must pass through `redactValue()`.
4. **Deterministic Lineage:** Replays and forks must maintain topological integrity: ancestor nodes are copied, sibling branches are pruned, and cache hits truthfully report `0ms` and `$0.00`.
5. **Design Discipline:** The Flight Deck UI adheres to a high-density, technical aesthetic ("Wireshark for AI Agents"). Do not add generic purple/blue gradients, neon glows, glassmorphism blurs, or oversized border radii.

---

## 2. Core Package Responsibilities

### `@aethertrace/core-schema` (`packages/core-schema`)
- **Storage:** SQLite schema defined in Drizzle ORM (`trace_runs`, `trace_spans`, `trace_search`, `saved_searches`).
- **Diff Engine:** Needleman-Wunsch sequence alignment (`diff.ts`).
- **Security:** Secret redaction pipeline (`security/redactor.ts`), SSRF shield (`security/ssrf.ts`), and replay policy classifier (`security/replay-policy.ts`).
- **Search Engine:** Zero-eval AST parser and SQLite FTS5 search queries (`search/`).
- **Provenance:** Git metadata, lockfile fingerprints, and environment detection (`provenance.ts`).

### `@aethertrace/pricing-engine` (`packages/pricing-engine`)
- Exact token pricing lookup for OpenAI, Anthropic, Google Gemini, and open models.
- Calculates exact USD cost for prompt and completion tokens.

### `@aethertrace/proxy-server` (`apps/proxy-server`)
- Hono-based HTTP server listening on `:4000`.
- Intercepts `/v1/chat/completions`.
- Evaluates chaos faults, circuit breakers, and live breakpoints.
- Broadcasts real-time events over WebSocket (`/ws`).
- Exposes diagnostics via `/health` and `/api/system/status`.

### `flight-deck` (`apps/flight-deck`)
- Next.js 15 UI with `@xyflow/react` (React Flow v12) and Dagre.
- Real-time WebSocket connection to proxy.
- Centralized design system in `src/design-system/`.

### `@aethertrace/sdk` (`packages/sdk-ts`) & `aethertrace` (`packages/sdk-python`)
- Thread-safe, async-safe context propagation via `AsyncLocalStorage` and `contextvars`.
- Injects HTTP headers into outbound requests automatically.
