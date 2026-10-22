# AetherTrace — Interactive AI-Agent Debugger Architecture

## 1. Overview & Vision

AetherTrace provides a local, first-principles interactive debugger for autonomous AI agent systems.
It transforms execution analysis from passive telemetry into an active debugging loop:

```text
OBSERVE → INTERCEPT → PAUSE → INSPECT → MODIFY → REPLAY → FORK → DIFF → VERIFY
```

The Flight Deck interface (`apps/flight-deck`) couples a **Hierarchical Directed Acyclic Graph (DAG)** with an **Execution Timeline**, an **Event Inspector**, **Live Mid-Flight Breakpoints**, and **Lineage-Aware Time-Travel Replay & Forking**.

---

## 2. Debugger Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AETHERTRACE FLIGHT DECK                                 │
├─────────────────────────────────────────┬──────────────────────────────────────────────┤
│ TOP BAR: Telemetry & Status             │ RUN STATUS: ● RUNNING | 2,401 tok | $0.0142  │
├────────────┬────────────────────────────┴──────────────────────┬───────────────────────┤
│            │                                                   │                       │
│ RUNS       │              EXECUTION GRAPH                      │   EVENT INSPECTOR     │
│            │                                                   │                       │
│ Run #184   │              ┌─────────────────┐                  │   AGENT: Supervisor   │
│ (Live)     │              │  HumanOperator  │ (USER)           │   TYPE:  tool_call    │
│            │              └────────┬────────┘                  │   STATUS: Success     │
│ Run #183   │                       │                           │   TIMING: 142ms       │
│ (Replay)   │              ┌────────┴────────┐                  │                       │
│            │              │ FraudSupervisor │ (AGENT)          │   ARGUMENTS:          │
│ Run #182   │              └────────┬────────┘                  │   { "ip": "..." }     │
│ (Fork)     │                       │                           │                       │
│            │         ┌─────────────┴─────────────┐             │   RESULT:             │
│            │         │                           │             │   { "risk": 0.88 }    │
│            │ ┌───────┴───────┐           ┌───────┴───────┐     │                       │
│            │ │   gpt-4o      │ (LLM)     │ ip_reputation │     │   ACTIONS:            │
│            │ └───────────────┘           └───────┬───────┘     │   [ Replay From Here ]│
│            │                                     │             │   [ Fork From Here ]  │
│            │                             ┌───────┴───────┐     │   [ Set Breakpoint ]  │
│            │                             │  Blocklist    │     │                       │
│            │                             └───────────────┘     │                       │
├────────────┴───────────────────────────────────────────────────┴───────────────────────┤
│ EXECUTION TIMELINE (Waterfall):                                                       │
│ 0ms                                    500ms                                  1000ms  │
│ USER  ██                                                                              │
│ AGENT   ████                                                                          │
│ LLM         ████████████████                                                          │
│ TOOL                        ████████                                                  │
│ HTTP                                ████                                              │
│ RETRY                                   ██████                                        │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ COMMAND PALETTE (Cmd+K): Quick navigation, breakpoint toggle, diff arena, chaos mode │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Debugger State Model & Synchronization

The debugger state is maintained in `apps/flight-deck/src/app/page.tsx` and synchronized across all four interaction panes:

```typescript
interface DebuggerState {
  // Navigation & Selection
  selectedRunId: string | null;
  selectedSpan: TraceSpan | null;
  runs: TraceRun[];
  spans: TraceSpan[];

  // Execution Lifecycle State
  executionStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'breaker_tripped';

  // Panel Visibilities
  isTimelineOpen: boolean;
  isCommandPaletteOpen: boolean;
  isDiffModalOpen: boolean;
  isChaosModalOpen: boolean;

  // Live Telemetry & Control
  wsConnected: boolean;
  breakpointConfig: BreakpointConfig | null;
  pendingBreakpoints: PendingBreakpoint[];
  chaosConfig: ChaosConfig | null;
}
```

### State Synchronization Flow:
1. **Selecting a Run**: Fetches spans via `GET /api/runs/:id/spans`, resets `selectedSpan`, recalculates Dagre layout, and updates the timeline waterfall window.
2. **Selecting a Span** (via Graph click, Timeline bar click, or Keyboard `↑`/`↓`): Updates `selectedSpan`, highlights the corresponding node with restrained `ring-1 ring-zinc-400` styling, scrolls the timeline into focus, and populates the `InspectorDrawer`.
3. **Live WebSocket Event**: When a `SPAN_CREATED`, `RUN_UPDATED`, or `BREAKPOINT_HIT` arrives, the active run's spans reload in memory, triggering a layout transition without full page reload.

---

## 4. Execution Graph Architecture

- **Engine**: `@xyflow/react` (React Flow v12) + `dagre`.
- **Topological Invariant**: If `parent_span_id` exists in the current span set, an edge `parent -> child` is established. If `parent_span_id` is null (or root), it anchors the sub-tree.
- **Node Semantics**:
  - `USER`: Human input prompts.
  - `AGENT`: Autonomous agent contexts and coordination states.
  - `LLM`: Generative language model inferences with token and model metrics.
  - `TOOL`: Deterministic tools, calculators, and MCP function calls.
  - `HTTP`: External outbound network requests.
  - `ERROR`: Exceptions, circuit breaker blocks, and chaos faults.
  - `RETRY`: Error recovery spans explicitly linked to failed targets.
- **Orientation**: Switchable between Vertical (`TB`) and Horizontal (`LR`) via one-click toggle.

---

## 5. Event Inspector & Data Safety

The `InspectorDrawer` is organized into five structured, high-density sections:
1. **Header & Identifiers**: Event ID with 1-click clipboard copy, close button (`Esc`).
2. **Paused Breakpoint Banner**: When a span is intercepted mid-flight, an unmistakable amber banner provides inline prompt mutation (`textarea`), synthetic mock override (`$0.00` cost), or call abort (`HTTP 403`).
3. **Metadata Grid**: Type, Agent Name, Model/Target, Timestamp (`HH:MM:ss.SSS`), Duration, Latency, and USD Cost.
4. **Token Accounting Fidelity**: Authoritative provider tokens (`reported`), streaming approximations (`estimated`), or unreached faults (`unavailable`).
5. **Contextual Payloads**:
   - For `tool_call`: Formatted input arguments, execution result, and error states.
   - For `llm_call`: Collapsible prompt messages list and assistant response.
   - For `retry`: Target span pointer, attempt number, and backoff reason.
   - For `agent_state`: Parent agent pointer, role, and capabilities.
   - Safe rendering: Large payloads are collapsed by default with JSON formatting and copy buttons.

---

## 6. Execution Timeline Architecture

The `Timeline` component renders a horizontal waterfall chart at the base of the Flight Deck:
- **Time Offsets**: Computed relative to the first span's `created_at` timestamp.
- **Bar Widths**: Proportional to `latency_ms` relative to total execution duration.
- **Visual Cues**: Color-coded by semantic category (Sky for TOOL, Teal for HTTP, Amber for RETRY, Rose for ERROR, Emerald for 0ms cached replay).
- **Two-Way Synchronization**: Clicking any timeline bar selects the span in the DAG graph and opens its inspection drawer.

---

## 7. Live Breakpoint Engine & Resolution

When an outbound LLM call matches a breakpoint rule (or carries an `X-Breakpoint: true` header):
1. **Hold Socket Open**: The proxy inserts a placeholder span, marks `trace_runs.status = 'paused'`, and suspends the HTTP connection on an in-memory `Promise`.
2. **WebSocket Broadcast**: Emits `{ type: "BREAKPOINT_HIT", data: { spanId, runId, agentName, model, requestPayload } }`.
3. **Flight Deck Interception**: The UI marks the node with `● PAUSED — Awaiting Operator` and opens the mutation editor.
4. **Resolution Endpoint** (`POST /api/breakpoints/:spanId/resolve`):
   - **`resume`**: Forwards the mutated prompt to upstream LLM; execution continues on open socket.
   - **`mock`**: Returns a synthetic response instantly at `$0.00` cost.
   - **`abort`**: Rejects the call with HTTP 403 and records a `guardrail_block` span.

---

## 8. Lineage-Aware Replay & Time-Travel Forking

### 8.1. Replay From Here (`POST /api/spans/:id/replay`)
- Creates a new run with name `Replay of <original>`.
- Preserves common prefix ancestors up to the selected span.
- Marks all copied spans with `cache_hit: 1` (`0ms` latency, `$0.00` cost).
- Links `parent_run_id` and `forked_at_span_id`.

### 8.2. Fork From Here (`POST /api/spans/:id/fork`)
- Traverses topological ancestors of the target span and prunes all sibling or downstream branches.
- Creates a new run, copies the ancestral prefix, and dispatches mutated completions downstream.

---

## 9. Run Diff Arena Integration

Accessible directly via TopBar, RunSidebar, or keyboard shortcut `D`:
- Calls `GET /api/runs/:baseId/diff/:targetId`.
- Employs Needleman-Wunsch sequence alignment across spans.
- Categorizes steps into `identical_cached`, `modified_fork`, `inserted`, `removed`, and `diverged_downstream`.
- Displays token, cost, and latency delta scorecards.

---

## 10. Performance & Scalability Strategy

- **Dagre Graph Layout**: Evaluates 1,000 nodes in under 700ms; sub-tree caching avoids re-layouts during leaf-node additions.
- **Virtualization & Memoization**: Individual `SpanNode` components are wrapped in `React.memo` with shallow comparison, avoiding re-renders when other spans update.
- **WebSocket Deduplication**: Incoming messages are indexed by `runId` and `spanId`, preventing duplicate rendering passes.
- **Zero Heavyweight Frameworks**: Command Palette and Timeline are built with native zero-dependency React state.
