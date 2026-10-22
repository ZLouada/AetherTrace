# AetherTrace — UI & Feature Screenshots Gallery

This directory contains high-fidelity visual captures of the core user interfaces, debugging canvases, and diagnostic tooling in **AetherTrace** ("Wireshark for AI Agents").

---

## 1. Execution DAG & Flight Deck UI
> **File:** `01_execution_dag.png`

The central telemetry Flight Deck interface. Displays a hierarchical, interactive execution DAG canvas powered by `@xyflow/react` and Dagre layout, complete with live top-bar metrics (Run Latency, Execution Cost in USD, Total Token Counts, LLM & Tool call counters) and a left sidebar listing all historical and live runs with execution status badges.

![Execution DAG Canvas](01_execution_dag.png)

### Key Capabilities:
- **Hierarchical Node Topology:** Visualizes root agent orchestrations, sub-agents, LLM inference calls, tool executions, and retry cascades.
- **Real-Time Telemetry Bar:** Instant visibility into aggregate spend ($USD), total prompt/completion tokens, and active WebSocket connections.
- **Run History Sidebar:** Instant navigation across runs, search filtering, and quick fork indicators.

---

## 2. Event & Node Inspector Drawer
> **File:** `02_inspector_drawer.png`

Sliding right-side inspector drawer triggered upon selecting any node or span in the DAG canvas. Provides comprehensive audit metadata, provenance tracking, and the interactive Time-Travel Fork & Replay IDE.

![Inspector Drawer](02_inspector_drawer.png)

### Key Capabilities:
- **Git & Environment Provenance:** Displays exact commit hash (`main@3ca640e`), branch name, run ID, and span ID.
- **Resource Accounting:** Exact latency breakdown (ms), token consumption (prompt vs completion), and calculated API costs.
- **Payload Inspection:** Formatted JSON viewer for input parameters, tool arguments, system prompts, and raw LLM completions.
- **Time-Travel Actions:** Dedicated **Replay From Here** and **Fork From Here** triggers to re-run from historical state at \$0.00 cost.

---

## 3. Waterfall Execution Timeline
> **File:** `03_execution_timeline.png`

A synchronized bottom-tray waterfall timeline providing microsecond-level timing visibility across distributed multi-agent operations.

![Execution Timeline](03_execution_timeline.png)

### Key Capabilities:
- **Offset & Duration Visualizer:** Relative horizontal span bars colored by event type (`agent`, `llm`, `tool`, `guardrail`).
- **Critical Path & Latency Bottleneck Isolation:** Pinpoint which tool calls or model generations are slowing down execution.
- **Bidirectional Highlighting:** Selecting a timeline bar highlights the corresponding node on the DAG canvas and vice-versa.

---

## 4. Command Palette (⌘K) & Full-Text Search
> **File:** `04_command_palette_search.png`

Global search and quick-action launcher accessible via `⌘K` or `Ctrl+K`. Powered by local SQLite FTS5 (Full-Text Search) with BM25 ranking for millisecond search over millions of tokens and spans.

![Command Palette](04_command_palette_search.png)

### Key Capabilities:
- **Semantic Filter Chips:** Fast filtering syntax (`status:error`, `event:tool`, `cost:>0.10`, `duration:>3s`, `model:gpt-4o`).
- **Instant Search Index:** Search across prompts, completions, tool inputs/outputs, error messages, and agent identifiers.
- **Keyboard Navigation:** Full keyboard navigation (`↑`/`↓` and `Enter`) to jump directly to any span or trigger modals.

---

## 5. Side-by-Side Diff Arena
> **File:** `05_diff_arena.png`

Visual regression comparison tool that compares two runs (Baseline vs Target / Fork) side-by-side to highlight cost, latency, and structural execution differences.

![Diff Arena](05_diff_arena.png)

### Key Capabilities:
- **Executive Delta Scorecard:** Visual comparison of financial spend (`$0.000690 -> $0.000000`, -100.0% savings), wall-clock latency, and token totals.
- **Reproducibility & Provenance Matching:** Side-by-side diffing of Git branches, commit hashes, and dependency states.
- **Aligned Span Step Diff:** Identifies added, deleted, modified, and unchanged nodes with visual prompt/response diff highlighting.

---

## 6. Live Breakpoint & Interception Rules
> **File:** `06_breakpoint_interceptor.png`

"Burp Suite for AI Agents" modal. Configures live WebSocket interception rules to halt running agents mid-flight before upstream LLM calls or tool invocations are executed.

![Breakpoint Interceptor](06_breakpoint_interceptor.png)

### Key Capabilities:
- **Zero-Eval Conditional Rules:** Safe rule expressions (e.g. `cost > 0.10`, `tool == "bash"`, `agent == "Worker"`) evaluated without risky `eval()`.
- **Live Connection Suspension:** Holds incoming HTTP sockets suspended in-flight, allowing operators to inspect, mutate prompts, or inject synthetic mock completions.
- **Granular Filter Scopes:** Target specific agents, model identifiers, or error conditions.

---

## 7. Chaos Engineering & Fault Injection Console
> **File:** `07_chaos_engineering.png`

Resilience testing console to inject synthetic errors and network perturbations into agent execution pipelines to test self-healing loops.

![Chaos Engineering Console](07_chaos_engineering.png)

### Key Capabilities:
- **Synthetic Fault Types:** Simulate HTTP 429 Rate Limiting, HTTP 500/502 Internal Server Errors, Network Latency delays/jitter, and Corrupted / Malformed JSON payloads.
- **Adjustable Fault Probability:** Granular percentage slider (0% to 100%) to test probabilistic resilience.
- **Guardrail Audit Trails:** Automatically logs all injected faults as `guardrail_block` spans for debugging analysis.
