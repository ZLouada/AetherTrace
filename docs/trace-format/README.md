# AetherTrace Portable Trace Format (`.trace.json`)

## Overview

The `.trace.json` format is the **Wireshark `.pcap` equivalent for autonomous AI agents and LLM orchestration**.

Just as network engineers capture, inspect, replay, and bisect packets on the wire, AI engineers use AetherTrace `.trace.json` bundles to capture full-fidelity, deterministic execution DAGs across multi-agent workflows.

A single `.trace.json` bundle contains:
1. **The Session Context (`run`)**: Global metadata, status (`running`, `paused`, `completed`, `failed`, `breaker_tripped`), accumulated token count, total cost in USD, and lineage pointers (`parent_run_id`, `forked_at_span_id`).
2. **The Directed Acyclic Graph (`spans`)**: Hierarchical tree of every LLM completion, tool invocation, agent delegation, chaos fault injection, and guardrail interception.
3. **Reproducibility Metadata**: Model names, deterministic SHA-256 request hashes, latency figures, exact request/response payloads, and token usage accounting status (`reported`, `estimated`, `unavailable`).

---

## Specification Documents

- [**Schema v1 Specification**](./schema-v1.md): Formal JSON Schema, field definitions, enum constraints, typed event payloads, and DAG invariants.
- [**Examples Directory**](./examples/): Real-world `.trace.json` samples for automated validation, regression testing, and CI assertion:
  - `linear-trace.json`: Simple sequential 3-span pipeline.
  - `branching-trace.json`: Parallel multi-agent fan-out.
  - `forked-trace.json`: Time-travel debugged forked run with lineage pointers.
  - `chaos-breakpoint-trace.json`: Human-in-the-loop breakpoint pause and chaos fault injection.
  - `agent-tool-loop.trace.json`: Complete autonomous agent loop (`USER -> AGENT -> LLM -> TOOL -> LLM`).
  - `nested-agents.trace.json`: Deep hierarchical multi-agent delegation (`Director -> Lead -> SubAgent -> Tool`).
  - `tool-retry.trace.json`: Structured transient error handling and retry chaining (`TOOL -> ERROR -> RETRY -> TOOL`).

---

## Event Taxonomy & Semantics

Every span is assigned a concrete `span_type` and mapped to a high-level `EventCategory`:

| `span_type` | `EventCategory` | Description |
| :--- | :--- | :--- |
| `llm_call` | `LLM` | OpenAI-compatible chat completion or text generation call. |
| `tool_call` | `TOOL` | Execution of external function calls, calculators, or MCP tools. |
| `agent_state` | `AGENT` | Agent coordination state change or delegation milestone. |
| `guardrail_block` | `ERROR` / `SYSTEM` | Circuit breaker trip, budget breach, or chaos fault injection. |
| `http_call` | `HTTP` | Generic external HTTP network request made by the agent. |
| `user_input` | `USER` | Human-in-the-loop prompt injection or steering command. |
| `system_event` | `SYSTEM` | Proxy-level lifecycle event, cache invalidation, or checkpoint. |
| `retry` | `RETRY` | Explicit error handling retry span chained to a failed parent. |

---

## Token Accounting Status

AetherTrace strictly tracks the fidelity of token counts via `usage_status`:

- **`reported`**: The upstream provider (e.g. OpenAI, Anthropic, or mock engine) returned an authoritative `usage` block (`prompt_tokens`, `completion_tokens`).
- **`estimated`**: Usage was computed via the local token estimator (e.g., streaming chunks where provider omitted trailing usage block).
- **`unavailable`**: Injected faults (chaos HTTP 429, 502, malformed JSON) or circuit breaker blocks that never reached an LLM backend ($0.00 cost, 0 tokens).

---

## CLI & API Usage

### Exporting Traces
```bash
# Export run via CLI
aethertrace export run_xyz123 --out ./traces/incident-742.trace.json

# Export run via HTTP REST API
curl -s http://localhost:4000/api/runs/run_xyz123/export > incident-742.trace.json
```

### Importing Traces
```bash
# Import bundle into local SQLite database
aethertrace import ./traces/incident-742.trace.json

# Import via HTTP REST API
curl -X POST http://localhost:4000/api/traces/import \
  -H "Content-Type: application/json" \
  -d @./traces/incident-742.trace.json
```

### CI Regression Assertion
```bash
# Assert latency SLAs and budget caps against a golden trace
aethertrace assert ./traces/golden-incident.trace.json --max-cost 0.05 --max-latency 5000
```
