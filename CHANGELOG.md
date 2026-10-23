# Changelog

All notable changes to **AetherTrace** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-10-22

### Added
- **Phase 11: Agent Intelligence Engine**
  - **Deterministic Agent Understanding:** 100% mathematical, local-first intelligence with zero external LLMs, zero cloud dependencies, and zero `eval`.
  - **Agent & Sub-Agent Hierarchies:** $O(N)$ single-pass grouping, parent-child agent linking, nesting depth derivation, and token/cost/tool/retry aggregation.
  - **Tool Chains:** Coherent step-by-step grouping of tool invocations, inputs, results, durations, and retry outcomes.
  - **Parallel Execution Groups:** Concurrency detection using strict temporal overlap ($\max(s_1, s_2) < \min(e_1, e_2)$) with zero-recursion bottom-up propagation, slowest branch isolation, and synchronization span identification.
  - **Retry Chains & Failure Hotspots:** Root failed span linkage, attempt sequence tracing, and calculation of `mostRetriedOperation`, `mostFailedTool`, and financial retry cost impact.
  - **Critical Path Dynamic Programming:** $O(V+E)$ longest dependency path algorithm using typed arrays (`Float64Array`, `Int32Array`) to isolate runtime bottlenecks and percentage contributions.
  - **Causal Taxonomy:** Strict tri-part classification (`CAUSAL`, `STRUCTURAL`, `TEMPORAL`) separating operational triggers from parent containment and sequential execution.
  - **Proxy Server API:** `GET /api/runs/:id/intelligence` exposing structured intelligence payloads with instant in-memory LRU caching for completed runs.
  - **Flight Deck Visual Intelligence:** Interactive `AgentGroupNode` containers, collapsible agent hierarchies, glowing Critical Path highlight with filter toggle, and causal context in the Inspector Drawer.
  - **CLI Inspection Briefing:** `aethertrace inspect <run_id>` formatting complete agent hierarchy trees, critical path bottlenecks, tool chains, parallel groups, and failure hotspots.
  - **10k-Span Scalability:** Verified performance of 100 spans in 2.31ms, 1,000 spans in 19.25ms, and 10,000 spans in 233.51ms.

- **Phase 12: Replay & Experiment Studio**
  - **Persistent Experiments & Variants:** Full CRUD and SQLite persistence (`experiments`, `experiment_variants`) managing multi-variant execution branching from any baseline run.
  - **Topological Prefix Caching:** Preserves unmutated ancestor spans prior to the fork point at $0.00 spend and 0ms duration (`execution_origin: 'cached_replay'`).
  - **Mutation Studio:** Deterministic mutation types (`prompt`, `model`, `tool_args`, `mock_tool`) with automatic price recalculation via `@aethertrace/pricing-engine`.
  - **Bounded Concurrency Worker Pool:** Concurrent batch variant replay pool capped at limit 2, preventing local resource starvation.
  - **Failure Isolation:** Sandboxed variant execution where syntax, tool, or runtime errors in one variant do not cancel sibling branches.
  - **Multi-Variant Comparison Scorecards:** Sub-10ms ($9.65\text{ms}$ avg) analytical scorecards comparing tokens, latency, cost deltas %, duration deltas %, and node-level semantic DAG diffs.
  - **Flight Deck Experiment Studio:** 3-tab modal (`Variants & Mutations`, `Comparison Matrix`, `Replay History`), global shortcut `X`, `⌘K` palette integration, and one-click Diff Arena launcher.
  - **CLI Experiment Suite:** `aethertrace experiment` commands (`list`, `create`, `inspect`, `variant-add`, `run`, `compare`) for terminal-first experiment management.
- **Phase 13: Evaluation & Optimization Engine**
  - **Deterministic Local Evaluation Engine:** 100% mathematical, local-first assertion evaluation with zero external LLMs, zero cloud dependencies, and zero `eval()`. Average evaluation runtime <3ms (2.99ms benchmarked).
  - **Zero-Eval Assertion DSL & CI Regression Gate:** Safe, sandbox-enforced assertion language supporting operators (`==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `not_contains`, `exists`, `not_exists`), domain aliases (`duration_ms`, `total_tokens`, `total_cost`, `reliability_score`, `has_errors`), and tool presence checks (`tool "<name>" must exist`). Command-line gate `aethertrace evaluate assert` with deterministic exit codes (`0` = pass, `1` = fail, `2` = error).
  - **Precise Failure Localization & Structured Evidence:** Failed assertions map directly to offending span IDs, capturing metric name, actual value, expected threshold, comparison operator, and evidence descriptions.
  - **Deterministic Error Clustering & Secret Redaction:** Normalizes dynamic variables (`<IP>`, `:<PORT>`, `<NUM>`, `<UUID>`, `<PATH>`, `<TIMESTAMP>`) into canonical cluster fingerprints with first/last seen timestamps and culprit span links, while auto-redacting API keys and passwords.
  - **Causal Root-Cause Analyzer:** Traverses causal and parent-child lineage to separate primary triggers from cascading downstream retries, timeouts, and fallback errors.
  - **Actionable Optimization Signals:** 5 polymorphic heuristics detecting cost hotspots (expensive models/spans), critical path latency bottlenecks, retry hotspots, prompt token bloat, and sequential tool parallelism opportunities with quantified savings.
  - **Continuous Run Regression Evaluator:** Comparative regression checks between runs, variants, or experiments computing assertion deltas, score changes, metric diffs, and newly introduced failure regressions.
  - **Proxy Server REST API:** `/api/evaluations` endpoints (`POST /run`, `GET /`, `GET /:id`, `GET /target/:type/:id`, `DELETE /:id`, `GET /:id/export?format=json|markdown`).
  - **Flight Deck Evaluation Studio:** 5-tab evaluation studio modal (`Overview & Metrics`, `Assertions`, `Root Cause & Errors`, `Optimization Signals`, `Evaluation History`), global shortcut `E`, command palette action (`⌘K`), clickable span deep-linking, real-time DSL rule builder, and one-click JSON/Markdown report export.
  - **CLI Evaluation Suite:** `aethertrace evaluate` commands (`list`, `run`, `assert`, `inspect`, `failures`, `errors`, `optimize`, `compare`, `export`).

- **Phase 14: Ecosystem & Integrations**
  - **100% Local-First Ecosystem Interop:** Seamlessly debug agents built with external frameworks without rewriting codebase logic, and without any third-party cloud collectors or SaaS accounts.
  - **OpenTelemetry OTLP JSON (v1) Mapping:** Full bidirectional support for OTLP HTTP Protobuf-JSON v1 (`POST /v1/traces`), translating OpenTelemetry GenAI semantic conventions (`gen_ai.*`, `llm.*`) to native AetherTrace execution events (`llm_call`, `tool_call`, `agent_invocation`, `http_request`, `guardrail_block`, `error`), and exporting runs back with `aethertrace.*` extension attributes.
  - **Deterministic Pricing Engine Derivation:** Automatically calculates prompt and completion costs for imported OTel spans using `@aethertrace/pricing-engine`, labeling usage status as `estimated`.
  - **Zero-Trust Security & PII Redaction:** Mandatory deep regex scrubbing on all imported OpenTelemetry payloads and attributes, redacting API keys, bearer tokens, and credentials prior to database insertion.
  - **Framework Adapters (LangChain & LangGraph):** Zero-dependency duck-typed `AetherTraceCallbackHandler` for TypeScript and Python intercepting model, tool, and chain lifecycles and linking parent-child DAG relationships.
  - **Transparent SDK Wrappers & Function Decorators:** `wrapOpenAI` client routing, and `wrapTool` / `wrapAgent` higher-order function decorators for single-line instrumentation with automatic timing and error capture.
  - **Deduplication & Idempotency Guards:** Header-based coordination protocol (`X-AetherTrace-Span-Id`, `X-AetherTrace-Instrumented`) preventing duplicate spans when both framework handlers and the proxy interceptor observe calls.
  - **Proxy Server REST APIs:** OTLP collector (`POST /v1/traces`), file import (`POST /api/runs/import/otel`), and export (`GET /api/runs/:id/export/otel`).
  - **Flight Deck & CLI UX:** Telemetry source origin badges in Inspector Drawer (`OpenTelemetry OTLP`, `LangChain Adapter`, `Python SDK`, `AetherTrace SDK`), topbar OTel origin badges, CLI commands `aethertrace otel import` and `export`, and full downstream compatibility with Phase 11 Intelligence and Phase 13 Evaluation.

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
