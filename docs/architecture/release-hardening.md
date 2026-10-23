# AetherTrace v0.2.0 Release Hardening & Verification Architecture

## 1. Executive Overview

AetherTrace v0.2.0 is the major evolution of the local-first AI agent debugger. Where v0.1.0 established tracing, pausing, mutating, replaying, and visual debugging, v0.2.0 delivers the complete understanding, experimentation, evaluation, optimization, and integration workstation:

- **v0.1.0**: Debug your agent.
- **v0.2.0**: Understand, experiment with, evaluate, and optimize your agent.

This document details the hardening, security defenses, migration invariants, and verification matrix that make v0.2.0 enterprise-ready and stable for open source distribution under the MIT license.

---

## 2. Compatibility & Migration Invariants

### 2.1 Backward Compatibility with v0.1.0 Traces
- AetherTrace v0.2.0 natively reads, validates, imports, and processes traces exported from v0.1.0.
- All downstream intelligence (sub-agent grouping, tool chain reconstruction, critical path finding) and evaluation engines gracefully operate on v0.1 traces with missing modern metadata without throwing schema errors or returning `NaN`.
- Ingestion pipelines automatically populate default values (`request_hash = 'unknown'`, `execution_origin = 'original'`, `usage_status = 'reported'`).

### 2.2 Database Schema & SQLite WAL Resilience
- **Storage**: Embedded SQLite via `better-sqlite3` and `drizzle-orm`.
- **Concurrency**: SQLite database is unconditionally initialized in `WAL` mode (`PRAGMA journal_mode = WAL`) with `busy_timeout = 5000` to prevent locks between proxy interception, CLI queries, and the Flight Deck UI.
- **Auto-Migrations**: DDL operations are strictly idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, safe column alter checks). Database files created under v0.1 seamlessly upgrade to v0.2 without data loss.
- **Full-Text Search**: SQLite FTS5 table `trace_search` is maintained for rapid sub-millisecond keyword lookup.

---

## 3. Security, Privacy & Trust Guarantees

AetherTrace adheres to a strict **Zero-Cloud, Zero-Eval, Zero-Tracking** security architecture:

1. **Local-First Boundary**:
   - Runs on `127.0.0.1` by default.
   - Zero telemetry packets, tracking pixels, or third-party phone-home calls.
   - All evaluations are computed locally using deterministic rule engines.

2. **Secret Redaction**:
   - Ingestion and proxy boundaries automatically sanitize OpenAI API keys (`sk-...`), Anthropic keys (`sk-ant-...`), AWS credentials (`AKIA...`), JWT tokens (`Bearer eyJ...`), and RSA private keys.
   - Redacted fields are replaced with clean placeholders (`[REDACTED:OPENAI_KEY]`, `[REDACTED:JWT]`) before database storage and WebSocket emission.

3. **SSRF Defense**:
   - Outbound replay and proxy routing utilize `validateTargetUrl` to strictly block access to link-local cloud metadata (`169.254.169.254`), loopbacks (`127.0.0.1`), decimal/hex-encoded IPs, and internal domains (`.internal`, `.local`).

4. **Prototype Pollution Protection**:
   - Deep cloning and JSON payload traversals strictly filter `__proto__`, `constructor`, and `prototype` keys.

---

## 4. Standardized Versioning (0.2.0)

All monorepo packages, manifests, CLIs, and service banners are synchronized to `0.2.0`:
- `package.json` (root) -> `0.2.0`
- `@aethertrace/core-schema` -> `0.2.0`
- `@aethertrace/pricing-engine` -> `0.2.0`
- `@aethertrace/sdk` (TypeScript) -> `0.2.0`
- `@aethertrace/cli` -> `0.2.0`
- `@aethertrace/proxy-server` -> `0.2.0`
- `@aethertrace/flight-deck` -> `0.2.0`
- `aethertrace` (Python SDK) -> `0.2.0`

---

## 5. Deployment & Container Architecture

- **Multi-stage Dockerfile**: Based on `node:22-bookworm-slim`, compiles all packages and packages both the Interceptor Proxy (port `4000`) and Flight Deck UI (port `3000`).
- **Volume persistence**: Persistent volume mount `/data` for SQLite database `.trace.sqlite`.
- **Healthcheck**: Automated health monitoring via `curl -f http://localhost:4000/health`.
- **Signal handling**: `scripts/docker-entrypoint.sh` implements trap handlers for `SIGTERM` and `SIGINT` to cleanly close child node processes and flush SQLite WAL logs.
