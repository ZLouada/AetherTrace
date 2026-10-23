# AetherTrace Architecture: Phase 15 Audit
## Flight Deck & Developer Experience Baseline

> **Document Type:** Architectural & UX Audit Baseline  
> **Target Release:** AetherTrace v0.2.0 (Phase 15 — Flight Deck & Developer Experience)  
> **Status:** Completed & Approved  
> **Author:** AetherTrace Core Architecture  
> **Date:** October 2026  

---

## 1. Executive Summary

Phase 15 represents the developer experience and visual workstation culmination of AetherTrace v0.2.0.
AetherTrace has completed:
- Phase 11: Agent Intelligence (topological understanding, tool chains, parallel groups, retries, critical path)
- Phase 12: Replay & Experiment Studio (multi-variant experiments, prefix caching, mutation studio, comparison scorecards)
- Phase 13: Evaluation & Optimization Engine (zero-eval assertion DSL, evidence clustering, root cause, optimization signals)
- Phase 14: Ecosystem & Integrations (OTel OTLP v1, LangChain adapters, OpenAI wrappers, deduplication guards)

The objective of Phase 15 is to integrate these disparate subsystems into a unified, coherent, keyboard-first developer workstation:
> **“Wireshark for AI Agents: the local-first visual debugger, live interceptor, and time-travel replay engine.”**

This audit reviews the current Flight Deck architecture, identifies usability gaps, documents interaction inconsistencies, and establishes the precise engineering plan for Phase 15.

---

## 2. Flight Deck Information Architecture & Component Inventory

### Current Structural Layout:
```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TopBar (Brand, Search Bar / ⌘K, Run Status, Controls, Breakpoints, Modals)  │
├──────────────┬────────────────────────────────────────────────┬──────────────┤
│              │                                                │              │
│  RunSidebar  │                   DagCanvas                    │  Inspector   │
│ (Run List,   │          (React Flow Execution DAG,            │    Drawer    │
│  Filters,    │         MiniMap, Controls, Filters)            │ (Span/Agent, │
│  Search)     │                                                │  Fork IDE,   │
│              │                                                │  Replay)     │
│              │                                                │              │
├──────────────┴────────────────────────────────────────────────┴──────────────┤
│                  Timeline (Waterfall Execution Tray, 0-100%)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Analysis:
1. **`TopBar.tsx`:** Provides global status, simulation launcher, trace import/export, breakpoint toggle, chaos mode, Diff Arena launcher, Experiment Studio launcher, and Evaluation Studio launcher.
   - *Audit finding:* Lacks quick-access indicators for pinned spans or active multi-selection count.
2. **`RunSidebar.tsx`:** Lists execution sessions with monospace metrics ($ spend, latency, span count, status dot). Supports status filtering and search query parsing (`status:error`, `cost:>0.01`, etc.).
   - *Audit finding:* Run switching smoothly refreshes DAG and timeline, but could provide faster shortcut navigation.
3. **`DagCanvas.tsx`:** Powered by `@xyflow/react` and `dagre`. Renders `SpanNode` and `AgentGroupNode`. Features orientation toggling (Vertical/Horizontal), critical path focus, and agent group collapsing.
   - *Audit finding:* Needs keyboard navigation (`[` for parent, `]` for first child, `G` to fit view), support for pinned nodes, and multi-selection box/click handling.
4. **`SpanNode.tsx`:** Renders semantic category badges (LLM, TOOL, HTTP, RETRY, ERROR, AGENT), timing, cost, and execution origin badges (Held, Chaos, Modified, Mocked, 0ms Cached).
   - *Audit finding:* Needs visual indicator for pinned state (`📌`) and multi-selected state outline.
5. **`InspectorDrawer.tsx`:** Tabs for Inspector, Intelligence, Fork IDE, and Raw JSON. Displays identity, model, tokens, costs, payloads, and provenance.
   - *Audit finding:* Needs 1-click Pin/Unpin action, parent/child quick jump buttons, and a clean Multi-Selection overview mode when multiple spans are active.
6. **`Timeline.tsx`:** Waterfall tray rendering chronological spans relative to execution start/end.
   - *Audit finding:* Synchronized with `selectedSpanId`, but should indicate pinned spans with a subtle marker and support smooth graph centering on click.
7. **`CommandPalette.tsx`:** Fast `⌘K` palette with local action triggers and remote FTS5 search queries.
   - *Audit finding:* Missing commands for Pin/Unpin Span, Center Selected Node, Navigate Parent/Child, and Clear Graph Filters.
8. **`DiffArenaModal.tsx`:** Side-by-side run comparison with Needleman-Wunsch alignment and delta scorecards.
   - *Audit finding:* Fully operational; needs clear integration links from Evaluation optimization signals.
9. **`ExperimentStudio.tsx`:** 3-tab modal for variants, comparison matrices, and replay histories.
   - *Audit finding:* Fully operational; needs direct "Evaluate Variant" button bridging to Phase 13.
10. **`EvaluationPanel.tsx`:** 5-tab modal for overview, assertions, root causes, optimization signals, and history.
    - *Audit finding:* Fully operational; optimization signals should allow one-click launching of Experiment Studio with suggested mutation templates.

---

## 3. Keyboard-First Interaction Audit

The current keyboard shortcuts in `FlightDeckPage` are:
- `⌘K` / `Ctrl+K`: Open/close Command Palette
- `Esc`: Close open modals/drawers or deselect span
- `T`: Toggle timeline tray
- `I`: Toggle inspector drawer
- `B`: Toggle conditional breakpoints modal
- `D`: Open Diff Arena
- `C`: Open Chaos modal
- `X`: Open Experiment Studio
- `E`: Open Evaluation Studio
- `Space`: Pause / Resume active run
- `J` / `↓`: Select next span
- `K` / `↑`: Select previous span

### Gaps Identified:
- `P`: Pin / unpin current selected span
- `[`: Select parent of currently selected span
- `]`: Select child / successor of currently selected span
- `G`: Center graph on selected span or fit-view if none selected
- `F`: Focus filter bar

---

## 4. Multi-Selection & Pinned Spans Architecture

### Pinned Spans:
- Developers debugging large traces (100–10,000 spans) need to anchor key reference spans: the root cause error, an expensive LLM call, a slow tool, or a critical fork point.
- State: `pinnedSpanIds: Set<string>` stored in React session state.
- Presentation:
  - Small gold pin badge on `SpanNode`.
  - Quick-access pinned span filter chip in `DagCanvas`.
  - Pin toggle button in `InspectorDrawer` header.
  - Pin action in `CommandPalette`.

### Multi-Selection:
- Use case: Selecting 2–10 spans to quickly inspect aggregated cost, total duration, shared models, or launch comparative diffs.
- State: `selectedSpanIds: Set<string>`.
- Interaction: Shift+Click or Cmd+Click on DAG nodes adds/removes spans from selection set.
- Presentation:
  - Multi-selected nodes receive a high-contrast accent ring.
  - `InspectorDrawer` displays a Multi-Selection Summary card (total spans, combined cost, total latency, unique agents, common attributes).

---

## 5. Large Trace Performance & Scalability (100 to 10,000 Spans)

- Dagre hierarchical layouts on 1,000+ spans can take >100ms. In Phase 11, agent group collapsing was introduced to collapse hundreds of sub-agent spans into a single summary node, keeping Dagre graph size <50 nodes.
- For 10,000 spans:
  - React Flow node rendering virtualization keeps DOM nodes bounded to the viewport.
  - Active filtering (e.g. `Filter: Errors`, `Filter: Critical Path`, `Filter: Pinned`) drastically prunes rendering overhead.
  - Memory consumption remains strictly bounded.

---

## 6. Implementation Plan for Phase 15

1. **Pinned Spans & Multi-Selection Engine:**
   - Add `pinnedSpanIds` and `selectedSpanIds` state to `page.tsx`.
   - Update `DagCanvas.tsx` to pass pin/selection status to `SpanNode`.
   - Update `SpanNode.tsx` with pin icon, multi-select active ring, and click handlers.
   - Update `InspectorDrawer.tsx` with pin toggle, parent/child navigation links, and multi-selection aggregate summary.
2. **Graph Navigation & Keyboard Polish:**
   - Add keyboard listeners for `P` (pin/unpin), `[` (parent jump), `]` (child jump), `G` (center/fit view), and `F` (filter).
   - Add parent & child jump buttons in `InspectorDrawer`.
3. **Workflow Bridges:**
   - Experiment Studio -> "Evaluate Variant" direct launch.
   - Evaluation Studio -> "Create Experiment from Optimization Signal" direct launch.
4. **Command Palette Expansion:**
   - Add actions for: Pin/Unpin Span, Center Selected Node, Jump to Parent, Jump to Child, Filter to Pinned, and Clear Filters.
5. **Verification & Testing:**
   - Create comprehensive deterministic test suite `examples/phase15-developer-experience-test.ts`.
