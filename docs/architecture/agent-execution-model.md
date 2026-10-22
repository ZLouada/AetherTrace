# AetherTrace — Agent Execution Model Specification

## 1. Executive Summary

AetherTrace is **the local debugger for AI agents**, enabling the core developer loop:
```text
OBSERVE → INTERCEPT → PAUSE → INSPECT → MODIFY → REPLAY → FORK → DIFF → VERIFY
```

Before Phase 2, telemetry systems and early AetherTrace iterations modeled execution as a flat sequence of HTTP calls or generic spans. However, real-world autonomous agents are **hierarchical state machines**: agents invoke tools, spin up nested sub-agents, handle transient network failures with retries, and delegate to specialized workers.

Phase 2 formalizes this into a **Structured Agent Execution Model**:

```text
RUN
├── USER
├── AGENT
│   ├── LLM
│   ├── TOOL
│   ├── HTTP
│   ├── RETRY
│   └── AGENT (nested child)
├── ERROR
└── SYSTEM
```

---

## 2. Core Entities & Taxonomy

Every execution event is captured as a span in the Directed Acyclic Graph (DAG) with an explicit `span_type` mapped to an `EventCategory`:

| Entity | `span_type` | `EventCategory` | Role & Semantics |
| :--- | :--- | :--- | :--- |
| **RUN** | *(container)* | `SYSTEM` | The root session boundary. Aggregates total token usage, financial cost, duration, and maintains fork lineage pointers (`parent_run_id`, `forked_at_span_id`). |
| **USER** | `user_input` | `USER` | The human initiator or mid-flight steering input. Holds the initiating prompt or human-in-the-loop guidance. |
| **AGENT** | `agent_state` | `AGENT` | The autonomous agent context. Defines the agent identity, role, system instructions, and parent agent (enabling multi-tier delegation). |
| **LLM** | `llm_call` | `LLM` | Generative language model inferences. Captures model name, input messages, output completions, token usage fidelity, financial cost, and SHA-256 request hash. |
| **TOOL** | `tool_call` | `TOOL` | Tool, function, or API executions invoked by the agent. Captures tool name, input arguments, execution result, latency, and error state. |
| **HTTP** | `http_call` | `HTTP` | Generic external HTTP network calls executed by the agent runtime outside of standard LLM gateway routing. |
| **RETRY** | `retry` | `RETRY` | Explicit error recovery attempt. Stores pointer to failed target span (`original_span_id`), retry attempt index, and backoff reason. |
| **ERROR** | `guardrail_block` | `ERROR` / `SYSTEM` | Failures, exceptions, circuit-breaker trips, and chaos fault injections. |
| **SYSTEM** | `system_event` | `SYSTEM` | Engine-level operational events, cache checkpoints, and proxy lifecycle signals. |

---

## 3. Strongly Typed Payloads

Non-LLM spans enforce strict TypeScript and JSON schemas for their `request_payload` and `response_payload`:

### 3.1. Tool Call Payloads
```typescript
interface ToolCallPayload {
  tool_name: string;
  arguments: Record<string, any>;
  tool_call_id?: string;
}

interface ToolResultPayload {
  tool_name: string;
  result?: any;
  error?: any;
  is_error: boolean;
}
```

### 3.2. Agent State Payloads
```typescript
interface AgentStatePayload {
  agent_name: string;
  parent_agent_name?: string | null;
  state: 'active' | 'idle' | 'waiting' | 'completed' | 'failed';
  role?: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
}
```

### 3.3. Retry Payloads
```typescript
interface RetryEventPayload {
  original_span_id: string;
  attempt: number;
  max_attempts?: number;
  retry_reason?: string;
  strategy?: 'linear' | 'exponential_backoff' | 'immediate';
  delay_ms?: number;
}
```

### 3.4. HTTP Telemetry Payloads
```typescript
interface HttpEventPayload {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}

interface HttpResultPayload {
  status_code: number;
  headers?: Record<string, string>;
  body?: any;
  error?: string;
}
```

---

## 4. Execution Tree & Graph Algorithms

Rather than forcing nested JSON structures that prevent streaming, indexing, and atomic updates, AetherTrace stores spans in a **flat relational format with parent pointer edges** (`parent_span_id`), reconstructible into an arbitrary execution tree in $O(N)$ time.

### 4.1. Tree Reconstruction (`buildExecutionTree`)
The core schema provides `buildExecutionTree(spans: TraceSpan[]): ExecutionTreeNode[]`. It:
1. Maps all spans by `id` in $O(N)$ time.
2. Identifies root spans (`parent_span_id === null` or parent not found in span set).
3. Connects child nodes to their parents and assigns continuous `depth` levels ($0$ for root, $1$ for direct children, etc.).
4. Preserves chronological order within sibling groups.

```typescript
export interface ExecutionTreeNode {
  span: TraceSpan;
  category: EventCategory;
  depth: number;
  children: ExecutionTreeNode[];
}
```

### 4.2. Ancestry Traversal (`getAncestryPath`)
To trace the lineage from a leaf node (e.g. a failing tool call) all the way back to the root user command, `getAncestryPath(spans, spanId)` traverses upstream via `parent_span_id`, returning an ordered array from Root $\rightarrow \dots \rightarrow$ Target.

### 4.3. Retry Chain Resolution (`getRetryChains`)
Detects all `retry` spans and associates them with their original failed spans, enabling visual badges and automated diffing of retry efficiency:
```typescript
export interface RetryChain {
  originalSpanId: string;
  failedSpan?: TraceSpan;
  retries: TraceSpan[];
  successfulSpan?: TraceSpan;
}
```

---

## 5. Architectural Patterns

### 5.1. Hierarchical Multi-Agent Delegation
When a supervisor agent delegates work to a specialized worker:
```text
DirectorAgent (agent_state)
└── ManagerAgent (agent_state, parent_agent_name = "DirectorAgent")
    └── WorkerAgent (agent_state, parent_agent_name = "ManagerAgent")
        └── Tool Execution (tool_call)
```
Each child agent span records `parent_agent_name` in its `AgentStatePayload` and links its `parent_span_id` to the delegating agent's span.

### 5.2. Parallel Agent Fan-Out
When a supervisor agent fans out tasks to parallel sub-agents:
```text
SupervisorAgent (parent_span_id: null)
├── SubAgent_Alpha (parent_span_id: span_sup) ──> Tool_Alpha
└── SubAgent_Beta  (parent_span_id: span_sup) ──> Tool_Beta
```
Both sub-agents share the supervisor's `span_id` as their `parent_span_id`. When Time-Travel Forking from `SubAgent_Alpha`, AetherTrace's topological pruning algorithm preserves the supervisor and Alpha, cleanly pruning the sibling Beta branch.

### 5.3. Resilient Tool Retries
When an external tool fails due to a transient error (e.g., HTTP 429 or network timeout):
```text
TOOL (charge_card) ──> ERROR (429 RateLimit) ──> RETRY (attempt: 1) ──> TOOL (charge_card [success])
```
The retry span explicitly links to the failed tool call via `original_span_id`, maintaining causal traceability without corrupting the linear DAG ancestry.

---

## 6. Token Accounting & Usage Fidelity

To preserve absolute trust during debugging and regression testing, AetherTrace strictly tracks how token numbers were derived:

1. **`reported`**: The upstream model provider returned an authoritative `usage` block with `prompt_tokens` and `completion_tokens`.
2. **`estimated`**: The response was streamed via SSE without a trailing usage block, so tokens were estimated using local heuristics (~4 chars/token).
3. **`unavailable`**: Injected faults, circuit-breaker blocks, or failed network calls that never reached an LLM backend. Tokens are recorded as $0$, cost as $\$0.00$.

**Rule:** AetherTrace **NEVER** synthesizes fake token counts. If tokens were not consumed, they are marked as `unavailable`.

---

## 7. Storage Rationale & Privacy Guardrails

### 7.1. Why Flat Relational Storage?
AetherTrace persists execution spans into SQLite (`trace_spans`) rather than a single nested JSON document for four key reasons:
1. **Atomic Ingestion:** Spans can be inserted incrementally as they happen without reading and rewriting an entire JSON tree.
2. **Crash Resilience:** If an agent process crashes mid-flight, all spans committed up to that point remain intact on disk.
3. **High-Performance Querying:** SQLite indexes on `(run_id, created_at)` and `(parent_span_id)` allow instant sub-millisecond filtering, pagination, and DAG ancestry resolution.
4. **Time-Travel Forking:** Forking creates a new run by referencing an existing span boundary without copying deep tree structures.

### 7.2. Privacy & Redaction
- AetherTrace captures developer-facing agent requests, tools, and responses.
- Private reasoning tokens or hidden internal system prompts flagged for redaction are excluded from trace exports.
- Exported `.trace.json` bundles are fully portable, inspectable, and editable JSON.

---

## 8. Verification & Test Suite

The execution model is rigorously verified in `examples/phase2-execution-model-test.ts` across 9 core test suites:

- **Test 1:** Simple Agent Execution (`USER -> AGENT -> LLM -> TOOL -> LLM`)
- **Test 2:** Nested Agents Hierarchy (`Director -> Manager -> Worker -> Tool`)
- **Test 3:** Parallel Agents Fan-Out (`Supervisor -> [Alpha -> Tool A, Beta -> Tool B]`)
- **Test 4:** Structured Retry Semantics (`TOOL -> ERROR -> RETRY -> TOOL`)
- **Test 5:** LLM Usage Status Fidelity (`reported`, `estimated`, `unavailable`)
- **Test 6:** Complex Agent Trace Export & Import Round-Trip
- **Test 7:** Backward Compatibility with Phase 1 Trace Fixtures
- **Test 8:** Fork Compatibility with Complex Agent Traces (Sibling Pruning)
- **Test 9:** Semantic Diff Arena with Tool Mutations and Retries
