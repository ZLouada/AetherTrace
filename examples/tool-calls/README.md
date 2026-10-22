# Tool Calls & Retry Chains Example

> **Goal:** Capture granular tool invocations, inputs, exceptions, and **structured retry chains** without polluting LLM prompt history.

---

## Why use AetherTrace here?
When an AI agent's tool fails (e.g. timeout, transient API rate limit), naive loggers record disjointed errors. 

AetherTrace provides:
1. `TOOL` event categorization (`name`, `arguments`, `output`).
2. `RETRY` semantics linking each retry attempt directly back to the causative failed span.
3. Accurate cost and latency accounting distinguishing between failed attempts and successful executions.

---

## How to Run

```bash
# In terminal:
pnpm tsx examples/tool-calls/tools.ts
```

### Expected Output
```text
======================================================
🛠️ Tool Execution, Failure Capture & Structured Retries
======================================================

▶ Step 1: Agent decides to call query_postgres tool...
  • Attempt 1: Executing query_postgres...
  ⚠️ Attempt 1 failed with error: "DatabaseConnectionTimeout: connection pool exhausted (simulated)"
  ▶ Step 2: Agent initiates structured retry attempt #1...
  • Attempt 2: Re-executing query_postgres with backoff...
  ✔ Attempt 2 succeeded cleanly: {"id":101,"status":"active","balance":4500}
▶ Step 3: Agent synthesizes result for user.
```
