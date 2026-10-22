# AetherTrace Trace Format — Schema v1 Specification

## Version
- **Format Version:** `1.0`
- **Schema URI:** `https://aethertrace.dev/schemas/v1/trace.json`
- **MIME Type:** `application/vnd.aethertrace.trace+json`

---

## JSON Structure

A valid AetherTrace v1 bundle is a JSON object with top-level properties:

```json
{
  "version": "1.0",
  "exported_at": 1792620437259,
  "run": { ... },
  "spans": [ ... ],
  "provenance": { ... }
}
```

---

## 1. Top-Level Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `version` | `string` | **Yes** | Schema version identifier (must be `"1.0"`). |
| `exported_at` | `integer` | **Yes** | Epoch timestamp in milliseconds when the bundle was serialized. |
| `run` | `object` | **Yes** | The session record containing run-level aggregates and lineage. |
| `spans` | `array<object>` | **Yes** | Chronological and topological list of all execution spans in the run. |
| `provenance` | `object \| null` | No | Git repository metadata, runtime environment, dependency lockfiles, and reproducibility scorecard. |

---

## 2. The `run` Object

Represents the overall multi-agent execution session.

```json
{
  "id": "run_a824e8bc-6def-4512-bc91-2856f8f53701",
  "name": "Production-Incident-Triager-6085",
  "status": "completed",
  "total_tokens": 118,
  "total_cost_usd": 0.000783,
  "parent_run_id": null,
  "forked_at_span_id": null,
  "created_at": 1792620436000
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Unique identifier for the trace session (UUID or prefixed slug). |
| `name` | `string` | **Yes** | Human-readable label for the run. |
| `status` | `string` | **Yes** | One of: `"running"`, `"paused"`, `"completed"`, `"failed"`, `"breaker_tripped"`. |
| `total_tokens` | `integer` | **Yes** | Sum of all prompt and completion tokens across all spans (>= 0). |
| `total_cost_usd` | `number` | **Yes** | Calculated cost in USD based on model pricing (>= 0.0). |
| `parent_run_id` | `string \| null` | **Yes** | Identifier of parent run if created via Time-Travel Forking, else `null`. |
| `forked_at_span_id` | `string \| null` | **Yes** | Span ID in parent run where execution branched, else `null`. |
| `provenance` | `string \| null` | No | Serialized JSON string of `RunProvenance` metadata (Git, environment, dependencies). |
| `mutations` | `string \| null` | No | Serialized JSON array of `SpanMutation` records (`span_id`, `field`, `before`, `after`) documenting human or automated interventions. |
| `created_at` | `integer` | **Yes** | Epoch timestamp in milliseconds when run was initiated. |

---

## 3. The `spans` Array Element

Each element in `spans` represents a node in the Directed Acyclic Graph (DAG).

```json
{
  "id": "span_74a1048e-3512-4d61-95f2-f3ded39f8be7",
  "run_id": "run_a824e8bc-6def-4512-bc91-2856f8f53701",
  "parent_span_id": null,
  "span_type": "llm_call",
  "agent_name": "Planner",
  "model": "gpt-4o",
  "request_payload": "{\"messages\":[{\"role\":\"user\",\"content\":\"Triage latency incident\"}]}",
  "response_payload": "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"Diagnosing root cause...\"}}]}",
  "prompt_tokens": 17,
  "completion_tokens": 21,
  "cost_usd": 0.000253,
  "latency_ms": 172,
  "cache_hit": 0,
  "usage_status": "reported",
  "request_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_at": 1792620436100
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Unique identifier for the span (`span_<uuid>`). |
| `run_id` | `string` | **Yes** | Foreign key linking to `run.id`. |
| `parent_span_id` | `string \| null` | **Yes** | ID of immediate predecessor span in the DAG, or `null` for root nodes. |
| `span_type` | `string` | **Yes** | Enum: `"llm_call"`, `"tool_call"`, `"agent_state"`, `"guardrail_block"`, `"http_call"`, `"user_input"`, `"system_event"`, `"retry"`. |
| `agent_name` | `string` | **Yes** | Label identifying agent (e.g. `"Planner"`, `"Researcher"`, `"Coder"`). |
| `model` | `string \| null` | No | LLM model identifier (e.g. `"gpt-4o"`, `"claude-3-5-sonnet"`), or `null` for non-LLM spans. |
| `request_payload` | `string \| null` | No | Serialized JSON string of outbound request parameters and messages. |
| `response_payload` | `string \| null` | No | Serialized JSON string of inbound provider completion or tool output. |
| `prompt_tokens` | `integer` | **Yes** | Number of input prompt tokens counted or estimated (>= 0). |
| `completion_tokens` | `integer` | **Yes** | Number of generated completion tokens counted or estimated (>= 0). |
| `cost_usd` | `number` | **Yes** | Computed USD cost for this individual span (>= 0.0). |
| `latency_ms` | `integer` | **Yes** | Elapsed wall-clock execution time in milliseconds (>= 0). |
| `cache_hit` | `integer` | **Yes** | `1` if served from deterministic replay cache / forked prefix, `0` otherwise. |
| `execution_origin` | `string` | No | Provenance classification: `"original"`, `"cached_replay"`, `"new_execution"`, `"modified"`, or `"mocked"`. |
| `source_span_id` | `string \| null` | No | Ancestor span identifier from which this replayed, forked, or modified span originated. |
| `usage_status` | `string` | **Yes** | Enum: `"reported"`, `"estimated"`, `"unavailable"`. |
| `request_hash` | `string` | **Yes** | SHA-256 hex digest computed over canonical request payload (`model`, `messages`, `tools`, `temperature`). |
| `created_at` | `integer` | **Yes** | Epoch timestamp in milliseconds when span was committed. |

---

## 4. Typed Event Payloads (`request_payload` / `response_payload`)

Phase 2 introduces strongly typed payload contracts for non-LLM execution spans. In each case, payloads are encoded as JSON strings in `request_payload` and `response_payload`:

### A. Tool Execution (`span_type === 'tool_call'`)
- **`request_payload` (`ToolCallPayload`)**:
  ```json
  {
    "tool_name": "database_query",
    "arguments": { "query": "SELECT count(*) FROM users" },
    "tool_call_id": "call_db_01"
  }
  ```
- **`response_payload` (`ToolResultPayload`)**:
  ```json
  {
    "tool_name": "database_query",
    "result": { "count": 1420 },
    "error": null,
    "is_error": false
  }
  ```

### B. Agent State & Hierarchy (`span_type === 'agent_state'`)
- **`request_payload` (`AgentStatePayload`)**:
  ```json
  {
    "agent_name": "ResearcherAgent",
    "parent_agent_name": "DirectorAgent",
    "state": "active",
    "role": "Equity Analyst",
    "capabilities": ["web_search", "sec_query"]
  }
  ```

### C. Retries & Error Recovery (`span_type === 'retry'`)
- **`request_payload` (`RetryEventPayload`)**:
  ```json
  {
    "original_span_id": "span_fail_01",
    "attempt": 1,
    "max_attempts": 3,
    "retry_reason": "Upstream rate limit 429",
    "strategy": "exponential_backoff"
  }
  ```

### D. HTTP Network Calls (`span_type === 'http_call'`)
- **`request_payload` (`HttpEventPayload`)**:
  ```json
  {
    "method": "POST",
    "url": "https://api.external.com/v1/charge",
    "headers": { "Accept": "application/json" },
    "body": { "amount": 100 }
  }
  ```
- **`response_payload` (`HttpResultPayload`)**:
  ```json
  {
    "status_code": 200,
    "headers": { "content-type": "application/json" },
    "body": { "charge_id": "ch_123" }
  }
  ```

### E. Errors & Guardrails (`span_type === 'guardrail_block'`)
- **`request_payload` (`ErrorEventPayload`)**:
  ```json
  {
    "error_type": "RateLimitError",
    "status_code": 429,
    "message": "Too many requests",
    "stack": null
  }
  ```

---

## 5. The `provenance` Object (Phase 6 / Git & Reproducibility)

Optional top-level object capturing the exact execution environment:

```json
{
  "git": {
    "repository_root": "/home/user/my-agent-repo",
    "commit_sha": "3ca640e6db765d8467c769e2f21fa819eb7a4fda",
    "short_sha": "3ca640e",
    "branch": "main",
    "dirty": false,
    "detached_head": false,
    "git_version": "git version 2.56.0",
    "source_fingerprint": "b8264998ae875eb3c48e42643d4dd38644cc7693780e16a87d034cfdafcc569f"
  },
  "environment": {
    "os": "linux",
    "architecture": "x64",
    "runtime": { "name": "node", "version": "v22.23.3" },
    "aethertrace_version": "0.4.0",
    "package_manager": "pnpm"
  },
  "dependencies": {
    "lockfile_type": "pnpm-lock.yaml",
    "lockfile_fingerprint": "1937f4d222dfb8ac62a598a85f858db9f9dcc007e771b0637455b6e64d390649",
    "lockfile_path": "pnpm-lock.yaml"
  },
  "reproducibility": {
    "status": "reproducible",
    "reasons": []
  },
  "captured_at": 1792626703889
}
```

---

## 6. DAG Structural Invariants

1. **Root Node Invariant:** A valid trace MUST have at least one root span where `parent_span_id === null`.
2. **Referential Integrity:** If `parent_span_id` is non-null, a span with that `id` MUST exist within the same trace bundle (or within its ancestor run if forked).
3. **No Cycles:** The graph defined by `parent_span_id` edges MUST be strictly acyclic.
4. **Topological Ordering:** For any span $S$, all of its ancestors in the DAG must have `created_at <= S.created_at`.
5. **Cost & Token Non-Negativity:** All `prompt_tokens`, `completion_tokens`, and `cost_usd` MUST be $\ge 0$.
6. **Provenance Invariant:** If `provenance` is present, it MUST NOT contain secret keys, auth tokens, passwords, or raw `.env` contents. Missing provenance defaults to `"unknown"` or `"incomplete"`.

