# AetherTrace — UI & Feature Screenshots Gallery

This directory contains high-fidelity visual captures of the core user interfaces, debugging canvases, and diagnostic tooling in **AetherTrace v0.2.0** ("Wireshark for AI Agents").

All captures are generated in Retina 2x resolution (1920×1080) against live local execution traces.

---

## 1. Execution DAG & Flight Deck UI
> **File:** `01_execution_dag.png`

The central telemetry Flight Deck interface. Displays an interactive execution DAG canvas powered by `@xyflow/react` and Dagre layout, complete with live top-bar metrics (Run Latency, Execution Cost in USD, Total Token Counts, LLM & Tool call counters), an interactive bottom-right MiniMap, quick-filter pills (Pinned, Agents, LLMs, Tools, Retries, Errors, Critical Path), and a left sidebar listing historical and live runs.

![Execution DAG Canvas](01_execution_dag.png)

### Key Capabilities:
- **Hierarchical Node Topology:** Visualizes root agent orchestrations, sub-agents, LLM inference calls, tool executions, and retry cascades.
- **Interactive MiniMap & Layout Engine:** Smooth panning, zooming, and instant bird's-eye spatial orientation across complex distributed traces.
- **Critical Path Highlighting:** Glowing visual accents highlighting the bottleneck path responsible for total run duration.
- **Span Pinning (`P`):** Pin key reference spans to keep them highlighted across navigation and filtering.
- **Real-Time Telemetry Bar:** Instant visibility into aggregate spend ($USD), total prompt/completion tokens, and active WebSocket connections.

---

## 2. Event & Node Inspector Drawer
> **File:** `02_inspector_drawer.png`

Sliding right-side inspector drawer triggered upon selecting any node or span in the DAG canvas (or via single-key navigation `J`/`K`). Provides comprehensive audit metadata, provenance tracking, OpenTelemetry source attribution, and the interactive Time-Travel Fork & Replay IDE.

![Inspector Drawer](02_inspector_drawer.png)

### Key Capabilities:
- **Git & Environment Provenance:** Displays exact commit hash, branch name, run ID, and span ID.
- **Telemetry Source Tagging:** Distinguishes native AetherTrace SDK calls, OpenTelemetry OTLP imports, and proxy-intercepted traffic.
- **Resource Accounting:** Exact latency breakdown (ms), token consumption (prompt vs completion), and calculated API costs.
- **Child Spans Navigation:** Immediate jump links to downstream tool calls or nested sub-agent executions.
- **Time-Travel Actions:** Dedicated **Replay From Here** and **Fork From Here** triggers to re-run from historical state at \$0.00 cost.

---

## 3. Waterfall Execution Timeline
> **File:** `03_execution_timeline.png`

A synchronized bottom-tray waterfall timeline (`T`) providing microsecond-level timing visibility across distributed multi-agent operations.

![Execution Timeline](03_execution_timeline.png)

### Key Capabilities:
- **Offset & Duration Visualizer:** Relative horizontal span bars colored by event type (`agent`, `llm`, `tool`, `retry`, `guardrail`).
- **Critical Path & Latency Bottleneck Isolation:** Pinpoint which tool calls or model generations are slowing down execution.
- **Bidirectional Highlighting:** Selecting a timeline bar highlights the corresponding node on the DAG canvas and vice-versa.
- **Pinned Spans Badging:** Pinned spans display prominent visual badges for rapid cross-referencing.

---

## 4. Command Palette (⌘K) & Full-Text Search
> **File:** `04_command_palette_search.png`

Global search and quick-action launcher accessible via `⌘K` or `Ctrl+K`. Powered by local SQLite FTS5 (Full-Text Search) with BM25 ranking for millisecond search over millions of tokens and spans.

![Command Palette](04_command_palette_search.png)

### Key Capabilities:
- **Semantic Filter Chips:** Fast filtering syntax (`status:error`, `event:tool`, `cost:>0.10`, `duration:>3s`, `model:gpt-4o`, `agent:researcher`).
- **Instant Search Index:** Search across prompts, completions, tool inputs/outputs, error messages, and agent identifiers.
- **Workstation Command Actions:** One-keystroke triggering of Diff Arena, Experiment Studio, Evaluation Studio, Chaos Engine, and Breakpoints.
- **Full Keyboard Navigation:** `↑`/`↓` and `Enter` to jump directly to any span or execute actions.

---

## 5. Side-by-Side Diff Arena
> **File:** `05_diff_arena.png`

Visual regression comparison tool (`D`) that compares two runs (Baseline vs Target / Fork) side-by-side to highlight cost, latency, and structural execution differences using Needleman-Wunsch sequence alignment.

![Diff Arena](05_diff_arena.png)

### Key Capabilities:
- **Executive Delta Scorecard:** Visual comparison of financial spend (`$0.042500 -> $0.002750`, -93.5% savings), wall-clock latency, and token totals.
- **Reproducibility & Provenance Matching:** Side-by-side diffing of Git branches, commit hashes, lockfiles, and environment runtimes.
- **Aligned Span Step Diff:** Identifies added, deleted, modified, and unchanged nodes with visual prompt/response diff highlighting.
- **Diverged Downstream Analysis:** Pinpoints the exact branch point where execution diverged from the baseline.

---

## 6. Live Breakpoint & Interception Rules
> **File:** `06_breakpoint_interceptor.png`

"Burp Suite for AI Agents" modal (`B`). Configures live WebSocket interception rules to halt running agents mid-flight before upstream LLM calls or tool invocations are executed.

![Breakpoint Interceptor](06_breakpoint_interceptor.png)

### Key Capabilities:
- **Zero-Eval Conditional Rules:** Safe rule expressions (e.g. `cost > 0.10`, `tool == "bash"`, `agent == "Worker"`) evaluated without risky `eval()`.
- **Live Connection Suspension:** Holds incoming HTTP sockets suspended in-flight, allowing operators to inspect, mutate prompts, or inject synthetic mock completions.
- **Granular Filter Scopes:** Target specific agents, model identifiers, or error conditions.
- **Mock Completion Injection:** Return synthetic responses directly from the debugger at \$0.00 token cost.

---

## 7. Chaos Engineering & Fault Injection Console
> **File:** `07_chaos_engineering.png`

Resilience testing console (`C`) to inject synthetic errors and network perturbations into agent execution pipelines to test self-healing loops.

![Chaos Engineering Console](07_chaos_engineering.png)

### Key Capabilities:
- **Synthetic Fault Types:** Simulate HTTP 429 Rate Limiting, HTTP 500/502 Internal Server Errors, Network Latency delays/jitter, and Corrupted / Malformed JSON payloads.
- **Adjustable Fault Probability:** Granular percentage slider (0% to 100%) to test probabilistic resilience.
- **Header-Level Targeting:** Test specific calls on demand via `X-Chaos-Inject: rate_limit` or `corrupt_json`.
- **Guardrail Audit Trails:** Automatically logs all injected faults as `guardrail_block` spans for debugging analysis.

---

## 8. Replay & Experiment Studio
> **File:** `08_experiment_studio.png`

Autonomous experimentation workstation (`X`) introduced in **Phase 12**. Turns any existing run into a controlled multi-variant experiment. Operators can create variants, mutate prompts, override tool behaviors, swap models, and replay deterministically.

![Experiment Studio](08_experiment_studio.png)

### Key Capabilities:
- **Multi-Variant Branching:** Branch multiple execution hypotheses from a single baseline run.
- **Granular Mutation IDE:** Mutate system prompts, user messages, tool arguments, mock tool responses, or model identifiers (`gpt-4o` ➔ `gpt-4o-mini`).
- **Flexible Replay Modes:** Execute variants in `cache_only` (100% deterministic, \$0.00), `mock_mutated` (mock upstream, mutate target), or `live_replay` (re-hit upstream providers).
- **Batch Variant Execution:** Run all variants concurrently with live progress indicators.

---

## 9. Evaluation & Optimization Studio
> **File:** `09_evaluation_studio.png`

Deterministic evaluation and optimization engine (`E`) introduced in **Phase 13**. Provides explainable rule assertions, automated root-cause diagnostics, and actionable optimization signals without opaque "AI judges".

![Evaluation Studio](09_evaluation_studio.png)

### Key Capabilities:
- **Deterministic Assertion DSL:** Express rules cleanly (`status == completed`, `errors.count == 0`, `retries.count <= 2`, `cost <= $0.10`, `duration <= 5000ms`).
- **Executive Pass/Fail Scorecard:** Instant verification of assertion compliance with granular pass rates.
- **Automated Root-Cause Isolation:** Deterministic ranking of primary failure candidates with span attribution.
- **Actionable Optimization Signals:** Identifies model spend dominance, redundant retry loops, and expensive tool calls with estimated \$ savings.
- **Exportable Quality Reports:** One-click export to structured JSON or GitHub-flavored Markdown.

---

## 10. Multi-Variant Comparison Matrix
> **File:** `10_multi_variant_matrix.png`

Side-by-side scorecard within Experiment Studio comparing all executed variants against the baseline source run.

![Multi-Variant Comparison Matrix](10_multi_variant_matrix.png)

### Key Capabilities:
- **Cross-Variant Scorecard:** Compares status, total cost, cost delta ($ and %), duration, duration delta, and token usage side-by-side.
- **Visual Delta Indicators:** High-contrast green indicators for cost savings (e.g. `-$0.0450 (-100.0%)`) and latency reductions (e.g. `-180 ms`).
- **Direct Diff Arena Launch:** One-click `Diff` button on any variant row to open the Side-by-Side Diff Arena directly.
