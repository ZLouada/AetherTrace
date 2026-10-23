# AetherTrace Flight Deck & Developer Experience Architecture

## 1. Overview & Vision

AetherTrace Flight Deck is the **interactive workstation for AI agent developers**, designed with the precision, ergonomics, and responsiveness of Wireshark, Bloomberg Terminals, and Chrome DevTools.

Rather than treating AI agent traces as static log tables or disconnected JSON dumps, Flight Deck exposes execution as an interactive, multi-dimensional directed acyclic graph (DAG) coupled with real-time telemetry, synchronized timeline waterfalls, in-line mutation, time-travel forks, and diagnostic evaluations.

---

## 2. Workstation Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│ TopBar: Telemetry, Live WebSocket Pulse, Sim, Breakpoints, Chaos, Diffs│
├───────────────┬───────────────────────────────────┬────────────────────┤
│               │                                   │                    │
│  RunSidebar   │            DagCanvas              │  InspectorDrawer   │
│               │  - Interactive React Flow DAG     │                    │
│  - Run list   │  - Pinned & Multi-Select Nodes    │  - Span & Agent    │
│  - Statuses   │  - Minimap & Fit View             │    Intelligence    │
│  - Latency    │  - Filter Pills (Pins, LLM, Err)  │  - Multi-Select    │
│  - Cost       │  - Collapsible Agent Subgraphs    │    Aggregates      │
│  - Parents    │  - Critical Path Highlighting     │  - Child Spans Nav │
│  - Realtime   │                                   │  - Live Fork IDE   │
│               │                                   │                    │
├───────────────┴───────────────────────────────────┴────────────────────┤
│ Timeline: Synchronized Waterfall, Pinned Badges, Critical Path Glow    │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The 3-Pane Layout

1. **Left Pane (`RunSidebar`)**:
   - Filterable catalog of runs across all sessions, forks, and replays.
   - Live execution status badges (running, paused, completed, error).
   - Side-by-side run comparison triggers.

2. **Center Pane (`DagCanvas`)**:
   - High-performance React Flow DAG layout calculated deterministically via `dagre`.
   - Node-level indicators for pinned spans, multi-selection borders, agent group cards, and held breakpoints.
   - Native minimap rendering in the bottom-right corner with real-time viewport tracker.
   - Quick "Fit View" button (`G`) and Direction toggle (Top-Bottom vs. Left-Right).

3. **Right Pane (`InspectorDrawer`)**:
   - Tabbed inspector: Inspector, Intelligence, Fork IDE, and Raw JSON.
   - Pinned toggle (`P`) in header for quick bookmarking.
   - Multi-Selection Aggregator: When multiple nodes are selected via Shift/Cmd+Click, instantly computes total cost, total latency, total tokens, error rate, and involved agent/model rosters.
   - Child Spans navigation table: Direct click-through to any descendant span.

4. **Bottom Waterfall (`Timeline`)**:
   - Temporal execution Gantt chart synchronized with the DAG canvas.
   - Visual `PIN` badges on bookmarked spans.
   - Amber glow on critical path spans.

---

## 3. Developer Workstation Capabilities

### 3.1 Pinned Spans Workflow
- Developers can pin critical or suspicious spans (e.g., tool calls returning unexpected schema, slow LLM inferences).
- Spans can be pinned via:
  - Header button in `InspectorDrawer`
  - Keyboard shortcut `P`
  - Action inside the Command Palette (`Cmd+K` / `Ctrl+K`)
- Filter bar provides a dedicated **📌 Pinned** filter pill to isolate bookmarked spans instantly across both the DAG and Timeline.

### 3.2 Multi-Selection & Metric Aggregation
- Developers can select multiple spans via `Shift + Click` or `Cmd/Ctrl + Click`.
- Selected spans receive a distinctive focus ring (`ring-2 ring-indigo-500/50`).
- The `InspectorDrawer` detects multi-selection state and renders an aggregate summary card:
  - Aggregate USD spend (rounded to microdollars: `$0.000001`)
  - Aggregate latency (ms)
  - Combined token count (prompt + completion)
  - Error count and failed span list
  - Roster of involved agent identities and model architectures

### 3.3 Single-Key DAG Navigation
- `[`: Jump to parent span (`parent_span_id`).
- `]`: Jump to first child span (`parent_span_id === currentSpan.id`).
- `J` / `ArrowDown`: Step forward to next sequential span.
- `K` / `ArrowUp`: Step backward to previous span.
- `F`: Fast-cycle through filter presets (`all` -> `pinned` -> `agents` -> `llms` -> `tools` -> `retries` -> `errors`).
- `T`: Toggle bottom Timeline waterfall.
- `I`: Toggle Inspector drawer.
- `Space`: Pause or Resume active execution run.

### 3.4 Command Palette (`Cmd+K` / `Ctrl+K`)
The centralized command engine supports fuzzy-searched execution of developer operations:
- **Navigation**: Search runs and spans by name, ID, or prompt snippet.
- **Actions**:
  - `Pin / Unpin Active Span` (`P`)
  - `Fit Graph View` (`G`)
  - `Jump to Parent Span` (`[`)
  - `Jump to Child Span` (`]`)
  - `Filter to Pinned Spans`
  - `Clear All Filters`
  - `Pause / Resume Run` (`Space`)
  - `Replay Selected Span`
  - `Toggle Conditional Breakpoints` (`B`)
  - `Open Diff Arena` (`D`)
  - `Open Chaos Studio` (`C`)
  - `Open Experiment Studio` (`X`)
  - `Open Evaluation Studio` (`E`)

---

## 4. Local-First State Performance

All Flight Deck developer state (pins, multi-selections, collapsed agent subgraphs, viewport zoom levels) is kept in browser memory using React hooks and fast hash sets (`Set<string>`), guaranteeing:
- **Zero SQLite overhead** for transient UI states.
- **Sub-millisecond UI reactivity** even when managing traces with 10,000+ spans.
- **Immediate timeline-DAG synchronization** without polling.
