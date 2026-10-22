# AetherTrace Architecture: Phase 11 Readiness Audit & Baseline

> **Document Type:** Phase 11 Technical Audit & Architectural Baseline  
> **Target Release:** AetherTrace v0.2.0 (Phase 11 — Agent Intelligence)  
> **Status:** Completed & Approved  
> **Author:** AetherTrace Core Architecture  
> **Date:** October 2026  

---

## 1. Existing Agent Model

In Phase 2, AetherTrace formalized the agent execution hierarchy using structured event semantics:
- Spans with `span_type: 'agent_state'` or `agent_name` carry agent boundary identity.
- In `AgentStatePayload`:
  ```typescript
  export interface AgentStatePayload {
    agent_name: string;
    status: 'started' | 'running' | 'completed' | 'failed' | 'paused';
    parent_agent_name?: string | null;
    task?: string;
    metadata?: Record<string, any>;
  }
  ```
- Child agents link to their parent agent either structurally via `parent_span_id` pointing to the delegating agent's span, or semantically via `parent_agent_name` in headers / payload.
- Every span (`llm_call`, `tool_call`, `http_call`, `retry`, `guardrail_block`) possesses an `agent_name` field indicating which agent was active in the call stack when the span was emitted.
- In both TypeScript (`traceAgent`) and Python (`trace_agent`) SDKs, context propagation maintains the active `agent_name` and `parent_agent_name` via `AsyncLocalStorage` and `contextvars`.

---

## 2. Existing Span Model

The foundational span entity is defined in `packages/core-schema/src/schema.ts` and validated via `TraceSpanZodSchema` in `types.ts`:
- **Identifiers & Foreign Keys:** `id` (`span_<uuid>`), `run_id` (foreign key to `trace_runs.id`), `parent_span_id` (nullable predecessor pointer in DAG), `source_span_id` (pointer to source span in replays/forks).
- **Semantics:** `span_type` enum (`llm_call`, `tool_call`, `agent_state`, `guardrail_block`, `http_call`, `user_input`, `system_event`, `retry`).
- **Telemetry & Accounting:** `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `cache_hit` (0 or 1), `usage_status` (`reported`, `estimated`, `unavailable`), `execution_origin` (`original`, `cached_replay`, `new_execution`, `modified`, `mocked`).
- **Payloads & Integrity:** `request_payload` (JSON string), `response_payload` (JSON string), `request_hash` (SHA-256 canonical hash), `created_at` (epoch ms).

---

## 3. Existing Graph Model

The DAG visualization is powered by `@xyflow/react` and `dagre` in `apps/flight-deck`:
- `getLayoutedElements(spans, selectedSpanId, direction)` in `apps/flight-deck/src/lib/layout.ts`:
  - Builds a `dagre.graphlib.Graph` with `rankdir` (`TB` or `LR`).
  - Constructs edges by checking `parent_span_id` against the set of span IDs. If `parent_span_id` is present, it creates a branch edge. If `null` and index > 0, it falls back to chaining from the preceding chronological span.
  - Generates React Flow nodes with `type: 'spanNode'` and dimensions 320x175 px.
  - Calculates positions $(x, y)$ via `dagre.layout(dagreGraph)`.
- In `core-schema/src/types.ts`:
  - `buildExecutionTree(spans)` constructs an in-memory N-ary tree with `depth` levels and `category` resolution in $O(N)$ time.
  - `getAncestryPath(spans, spanId)` traverses upstream via `parent_span_id` in $O(\text{depth})$ time.

---

## 4. Existing Lineage Model

AetherTrace tracks lineage across two distinct dimensions:
1. **Intra-Run Span Lineage:** Predecessor/successor links established by `parent_span_id` and `ExecutionTreeNode` children arrays.
2. **Inter-Run Multi-Generation Lineage:** Tracked via `trace_runs.parent_run_id` and `trace_runs.forked_at_span_id`. Resolved by `getRunLineage(allRuns, targetRunId)` into `ancestors`, `current`, and `descendants` (`root`, `ancestor`, `parent`, `current`, `fork`, `replay`) with generation depths.
3. **Execution Origin Lineage:** Each span tracks `execution_origin` (`original`, `cached_replay`, `new_execution`, `modified`, `mocked`) and `source_span_id`.

---

## 5. Existing Retry Representation

Retry semantics were introduced in Phase 2 and validated in Phase 4/5:
- `span_type: 'retry'`
- `RetryEventPayload`:
  ```typescript
  export interface RetryEventPayload {
    original_span_id: string;
    attempt: number;
    reason: string;
    error_type?: string;
  }
  ```
- `getRetryChains(spans)` in `packages/core-schema/src/types.ts` resolves pairs of `{ original, retry, attempt, reason }`.
- In `SpanNode.tsx`, retry spans display a distinct rotate icon (`RotateCcw`), `RETRY` badge, and attempt details extracted from payload.

---

## 6. Existing Parallel Representation

Parallel execution occurs when multiple sibling spans share the same `parent_span_id` and execute concurrently (overlapping wall-clock time intervals $[t_{\text{start}}, t_{\text{start}} + \text{latency}]$):
- In `examples/phase2-execution-model-test.ts` (Test 3): Parallel agent fan-out is tested with a supervisor dispatching tasks to `SubAgent_Alpha` and `SubAgent_Beta`.
- In `Timeline.tsx`: Spans are rendered as horizontal bars positioned by relative start offset $\frac{t - t_{\min}}{\Delta t}$ and width $\frac{\text{duration}}{\Delta t}$, visually displaying concurrent parallel bars.
- Prior to Phase 11, there is no explicit structural grouping or metric extraction (wall time vs slowest branch, synchronization points) for parallel branches.

---

## 7. Existing Causal Representation

AetherTrace currently captures causal error origins and diff divergences:
- `discoverErrors(db, limit)` in `packages/core-schema/src/search/errors.ts` aggregates failure signatures across runs and isolates the causal span.
- `getAncestryPath(spans, spanId)` provides the structural causal predecessor sequence leading to any target node.
- Spans resulting from circuit breakers or chaos injections link directly to the failing or triggering payload.
- However, edges in the graph currently have no explicit semantic edge types (`caused_by`, `retry_of`, `depends_on`, `synchronizes_with`).

---

## 8. Existing Performance Architecture

Phase 10 performance profile (`docs/performance/phase10-profile.md`):
- **100 Spans Concurrent Ingestion:** 1,273ms (78.6 req/sec) with atomic SQLite WAL consistency.
- **1,000 Spans Graph Layout:** Dagre layout in ~900ms; chronological timeline in 1ms.
- **10,000 Spans Ancestry Traversal:** 13.4ms (SLA: < 200ms).
- **10,000 Spans Breakpoint Matching:** 8.0ms (SLA: < 100ms).
- **Search Queries (FTS5):** 2–3ms.
- **Memory Footprint:** Proxy: ~52 MB RSS, Flight Deck: ~85 MB RSS.
- **Critical Requirement for Phase 11:** Intelligence analysis over 10,000 spans must complete in $< 50\text{ms}$ and must never run inside React render loops. Computations must be pure, deterministic, and cacheable.

---

## 9. Existing UI Architecture

Flight Deck (`apps/flight-deck`):
- **Layout Shell:** TopBar (48px fixed) + 3-pane workstation (RunSidebar 280px, center DagCanvas, InspectorDrawer 460px) + collapsible Timeline bottom tray (160px).
- **Design System (`src/design-system`):** Strict dark technical aesthetic (Zinc `#09090b`, `#111114`, `#18181c`, `#202024`, `#2c2c32`), monospace metrics, accessible focus rings, reduced-motion awareness.
- **Modal Dialogs:** CommandPalette (`⌘K`), DiffArenaModal (`D`), BreakpointModal (`B`), ChaosModal (`C`).
- **Real-Time Bus:** WebSocket connection to `ws://localhost:4000/ws` updating runs and spans dynamically.

---

## 10. Reusable Primitives

The following existing components and functions will be reused without alteration:
- **Design System Primitives:** `Badge`, `Button`, `IconButton`, `DataRow`, `Divider`, `EmptyState`, `Input`, `LoadingState`, `Modal`, `Panel`, `Select`, `StatusIndicator`, `Tooltip`, `tokens.ts`.
- **Event Taxonomies & Colors:** `resolveEventCategory(spanType)`, `getCategoryStyle(categoryKey)`.
- **Lineage Algorithms:** `buildExecutionTree`, `getAncestryPath`, `getRunLineage`.
- **Search & Filter Primitives:** `searchParser`, `evaluateBreakpointCondition`.
- **Database Utilities:** `getDatabase()`, `resolveDbPath()`.

---

## 11. Required Schema & Type Extensions

No breaking database schema migrations are necessary; all Phase 11 intelligence is deterministically derivable from existing `trace_runs` and `trace_spans` tables.
In `packages/core-schema/src/intelligence/types.ts`, we define:
```typescript
export interface AgentSummary {
  agentName: string;
  parentAgentName: string | null;
  depth: number;
  spanCount: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'running' | 'paused';
  startTime: number;
  endTime: number;
  childAgentCount: number;
  toolCallCount: number;
  llmCallCount: number;
  retryCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
  spanIds: string[];
}

export interface AgentHierarchyNode {
  agent: AgentSummary;
  children: AgentHierarchyNode[];
}

export interface ToolChainStep {
  spanId: string;
  toolName: string;
  arguments: any;
  result: any;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  isRetry: boolean;
  attempt?: number;
}

export interface ToolChain {
  id: string;
  agentName: string;
  toolName: string;
  spanIds: string[];
  steps: ToolChainStep[];
  totalDurationMs: number;
  finalStatus: 'success' | 'error';
  retryCount: number;
  hasFailures: boolean;
}

export interface ParallelBranch {
  branchIndex: number;
  rootSpanId: string;
  agentName: string;
  spanIds: string[];
  durationMs: number;
  startTime: number;
  endTime: number;
  status: 'completed' | 'failed' | 'running';
}

export interface ParallelGroup {
  id: string;
  parentSpanId: string | null;
  branches: ParallelBranch[];
  branchCount: number;
  totalSpanCount: number;
  wallClockDurationMs: number;
  longestBranchDurationMs: number;
  shortestBranchDurationMs: number;
  slowestBranchIndex: number;
  synchronizationSpanId?: string | null;
}

export interface RetryAttempt {
  spanId: string;
  attempt: number;
  durationMs: number;
  status: 'success' | 'error';
  costUsd: number;
  errorReason?: string;
}

export interface IntelligentRetryChain {
  id: string;
  originalSpanId: string;
  operationName: string;
  agentName: string;
  attempts: RetryAttempt[];
  retryCount: number;
  failedAttemptsCount: number;
  successfulAttemptIndex?: number;
  totalRetryDurationMs: number;
  totalRetryCostUsd: number;
  finalStatus: 'success' | 'failed';
}

export interface CriticalPathSpan {
  spanId: string;
  agentName: string;
  spanType: string;
  label: string;
  startTime: number;
  durationMs: number;
  percentageOfCriticalPath: number;
}

export interface CriticalPathAnalysis {
  durationMs: number;
  runDurationMs: number;
  coveragePercentage: number;
  spanIds: string[];
  spans: CriticalPathSpan[];
  longestSpan: CriticalPathSpan | null;
}

export type CausalRelationType =
  | 'child_of'
  | 'caused_by'
  | 'depends_on'
  | 'retry_of'
  | 'continues'
  | 'parallel_with'
  | 'synchronizes_with';

export type CausalClass = 'CAUSAL' | 'TEMPORAL' | 'STRUCTURAL';

export interface CausalRelation {
  sourceSpanId: string;
  targetSpanId: string;
  relationType: CausalRelationType;
  classification: CausalClass;
  explanation: string;
}

export interface FailureHotspots {
  mostRetriedOperation: string | null;
  mostFailedTool: string | null;
  longestRetryChainCount: number;
  highestRetryCostUsd: number;
  totalErrors: number;
}

export interface ExecutionIntelligence {
  runId: string;
  analyzedAt: number;
  agents: AgentSummary[];
  agentHierarchy: AgentHierarchyNode[];
  toolChains: ToolChain[];
  parallelGroups: ParallelGroup[];
  retryChains: IntelligentRetryChain[];
  criticalPath: CriticalPathAnalysis;
  causalRelations: CausalRelation[];
  failureHotspots: FailureHotspots;
}
```

---

## 12. Required API Extensions

Add to `apps/proxy-server/src/routes/traces.ts`:
- `GET /api/runs/:id/intelligence`:
  - Returns `200 OK` with JSON payload `{ success: true, intelligence: ExecutionIntelligence }`.
  - Cached in-memory per run if the run status is `'completed'`, or recomputed on request for active `'running'` sessions.
  - Sub-millisecond calculation using the pure core engine.

---

## 13. Required UI Extensions

1. **Inspector Drawer Intelligence Enhancements:**
   - Add an **Intelligence** tab in `InspectorDrawer.tsx` alongside `Overview`, `Fork IDE`, and `JSON`.
   - Displays Agent Hierarchy & Summary metrics, Tool Chain execution breakdown, Parallel Group stats, Retry Chain history, and Causal Context (`Caused by`, `Current`, `Caused`, `Failure origin`).
2. **DAG Canvas Focus Modes & Filters:**
   - Filter bar: `All`, `Agents`, `LLMs`, `Tools`, `Errors`, `Retries`, `Critical Path`, `Failures`.
   - Focus Actions: `Focus Agent`, `Focus Critical Path`, `Focus Failure`, `Focus Retry Chain`, `Reset View`.
   - Collapse / Expand: Collapsing agent groups into summary nodes showing child span counts and aggregate latency, expanding back to detailed spans on click.
   - Critical path visual emphasis: Highlighting critical path edges and nodes, dimming non-critical nodes when `Critical Path` focus mode is active.
3. **Timeline & Command Palette:**
   - Visual indicator on timeline for spans on the critical path.
   - Command palette shortcuts for intelligence actions (`Focus Critical Path`, `Filter: Errors`, `Filter: Tools`, `Collapse Agents`).

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| Large Trace Analysis Latency | UI lag on 10,000 spans | Algorithms strictly $O(N)$ or $O(V + E)$ with single-pass maps; no nested loops. Cache derived intelligence on server and client. |
| Over-zealous Parallel Detection | Falsely identifying siblings as parallel | Strictly verify concurrent wall-clock intervals $[t_1, t_1 + d_1] \cap [t_2, t_2 + d_2] \neq \emptyset$ in addition to shared parentage. |
| Inaccurate Critical Path | Misleading developer about bottlenecks | Topological traversal using dynamic programming / longest path on DAG respecting dependency order and branch synchronizations. |
| Visual Clutter | Overwhelming UI with badges | Keep information density compact and aligned with existing design system tokens; collapse groups cleanly by default for large traces. |
| Breaking Existing Tests | CI regression failure | Ensure all existing Phase 1–10 test fixtures and schemas remain 100% unaltered. Run entire test matrix before and after. |

---

## 15. Backward Compatibility Strategy

- **Format Version Integrity:** The `.trace.json` schema remains at Version `1.0`. No new mandatory fields are introduced.
- **Database Non-Destructiveness:** The SQLite tables `trace_runs` and `trace_spans` remain structurally unchanged. No destructive migrations.
- **Trace Ingestion:** Raw proxy behavior on port 4000 continues to accept OpenAI and SDK requests with zero breaking changes.
- **Existing Tests:** All 10 existing phase verification scripts continue to pass without modifications.
