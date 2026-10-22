# Changelog

All notable changes to **AetherTrace** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-22

### Added
- **Phase 1: Trace Foundation & Data Integrity**
  - Atomic trace aggregation with SQLite WAL mode persistence.
  - Topological DAG parent-child span ancestry traversal.
  - Needleman-Wunsch sequence alignment for semantic execution diffs.
  - Streaming token usage classification (`reported`, `estimated`, `unavailable`).
  - Standardized semantic event taxonomy (`LLM`, `TOOL`, `AGENT`, `HTTP`, `USER`, `SYSTEM`, `RETRY`, `ERROR`).

- **Phase 2: Agent Execution Model**
  - Explicit hierarchical execution support (nested agents, parallel fan-out, and structured retries).
  - TypeScript SDK with `AsyncLocalStorage` and Python SDK with `contextvars` context propagation.
  - Full-fidelity `.trace.json` export and import round-trip.

- **Phase 3: Interactive Visual Debugger**
  - Flight Deck visualizer built with Next.js 15, `@xyflow/react`, and Dagre hierarchical layout.
  - Live bidirectional WebSocket telemetry bus on port 4000 (`ws://localhost:4000/ws`).
  - Interactive Inspector Drawer with JSON payload syntax highlighting and ancestry paths.
  - Chronological Timeline waterfall offset visualization.

- **Phase 4: Time Travel & Chaos Engine**
  - In-memory HTTP socket interception for mid-flight live breakpoints.
  - Human-in-the-loop prompt mutation, model substitution, and $0.00 mock responses.
  - Chaos fault injection (synthetic HTTP 429 rate limits, 502 crashes, malformed JSON, and latency delays).
  - Multi-generation fork lineage pruning.

- **Phase 5: Diff Arena & CI Regression Gates**
  - Side-by-side run comparison matrix with executive spend and latency delta scorecards.
  - Deterministic CI regression test assertion command (`aethertrace assert`).

- **Phase 6: Git & Reproducibility Engine**
  - Automated Git metadata capture (`commit_sha`, `branch`, working tree cleanliness, and source fingerprints).
  - Dependency lockfile hashing (`pnpm-lock.yaml`, `package-lock.json`) and environment fingerprinting.
  - CLI commands: `aethertrace inspect`, `provenance`, `compare`, and `reproduce`.

- **Phase 7: Security & Trust Engine**
  - Zero-eval breakpoint condition sandbox and dynamic property accessors blocking prototype pollution.
  - High-confidence multi-provider secret detection and deep recursive redaction.
  - Strict SSRF shield preventing loopback, cloud metadata (169.254.x), and RFC1918 targeting.
  - Replay safety policies (`pure`, `read_only`, `mutating`) with explicit confirmation gates.

- **Phase 8: Search & Developer UX Engine**
  - Zero-eval AST-based query parser supporting phrases, numeric comparisons, durations, and negation.
  - SQLite FTS5 inverted index with BM25 relevance ranking.
  - Unified `⌘K` Command Palette with instant search, filter chips, and deep-linking.
  - Cross-run error pattern discovery (`aethertrace errors`).

- **Phase 9: Design System & Product UX**
  - Centralized design system tokens for surfaces, borders, and typography.
  - 13 strongly-typed UI component primitives in `apps/flight-deck/src/design-system/`.
  - Accessible `:focus-visible` outline rings and `@media (prefers-reduced-motion: reduce)` compliance.
  - Compact 48px TopBar and high-density technical aesthetic.

- **Phase 10: Open Source Productization & Release Engineering**
  - Docker multi-stage build, healthcheck endpoint, persistent volume mount, and `compose.yaml`.
  - Comprehensive CLI distribution with `--version`, `-v`, and clean help flags.
  - Standalone runnable quickstarts in `examples/quickstart/`, `examples/llm-agent/`, etc.
  - Structured user-centric documentation hierarchy in `docs/`.
  - Automated CI test matrix running all 14 verification phases.
