# Automatic & Manual Instrumentation Guide

> **Document Type:** Developer Instrumentation Guide  
> **Status:** Active / Standardized  
> **Repository:** `aethertrace` ("Wireshark for AI Agents")  
> **Applicable Version:** v0.2.0 (Phase 14)  

---

## 1. Overview

AetherTrace provides flexible instrumentation at multiple abstraction levels:
1. **Zero-Code Reverse Proxy:** Point your base URL to `http://localhost:4000/v1` to trace all OpenAI-compatible LLM requests automatically.
2. **Client-Side Function Wrappers:** Wrap agents and tools with automatic latency measurement, error capture, and lineage linking.
3. **Framework Adapters:** Attach native callbacks to LangChain, LangGraph, and OpenAI Swarm.

---

## 2. Core Instrumentation Primitives

### 2.1 Agent Context (`traceAgent`)
Identifies the logical agent executing the current operation and nests all subsequent tool and LLM calls under this agent.

```ts
import { traceRun, traceAgent } from '@aethertrace/sdk';

await traceRun('research-workflow', async () => {
  // Supervisor Agent
  await traceAgent('supervisor', async () => {
    // Child Researcher Agent
    await traceAgent('researcher', async () => {
      // Any calls here automatically link to 'researcher' with 'supervisor' as parent!
    });
  });
});
```

### 2.2 Tool Execution (`traceTool` / `wrapTool`)
Records tool name, input arguments, execution result, and latency. Captures exceptions and emits error payloads automatically.

```ts
import { traceTool } from '@aethertrace/sdk';

const result = await traceTool('web_search', { query: 'AetherTrace v0.2.0' }, async () => {
  return await fetchSearchAPI('AetherTrace v0.2.0');
});
```

### 2.3 Explicit Retry Chaining (`traceRetry`)
When an operation fails and is retried, `traceRetry` links the attempt to the original failure, enabling Phase 11 failure hotspot analysis and Phase 13 root-cause tracking:

```ts
import { traceRetry } from '@aethertrace/sdk';

let result;
try {
  result = await executeFlakyTool();
} catch (err) {
  // Trace retry attempt linked back to original failure
  result = await traceRetry(originalSpanId, 1, 'ConnectionTimeout', async () => {
    return await executeFlakyTool();
  });
}
```

### 2.4 HTTP Egress (`traceHttp` / `createTracedFetch`)
Automatically instruments outgoing HTTP requests and injects propagation headers (`X-Run-Id`, `X-Parent-Span-Id`, `X-Agent-Name`).

```ts
import { createTracedFetch } from '@aethertrace/sdk';

const tracedFetch = createTracedFetch();
const response = await tracedFetch('https://api.external-service.com/data');
```

---

## 3. Deduplication Guarantees

To prevent duplicate span generation when using multiple instrumentation layers simultaneously:
- **Operation Signatures:** Each traced operation computes a context fingerprint `(run_id, agent_name, span_type, hash)`.
- **Deduplication Header:** `X-AetherTrace-Span-Id` informs the proxy server that client instrumentation is active.
- **Single Source of Truth:** Telemetry metrics merge on the existing span record in SQLite rather than creating duplicate nodes in the DAG.

---

## 4. Security & Sanitization

All instrumentation passes through the Phase 7 security pipeline before leaving the client or entering SQLite:
- **Automatic Secret Redaction:** API keys (`sk-...`, `sk-ant-...`, `AIza...`), bearer tokens, and credentials are automatically scrubbed.
- **Payload Clamping:** Payloads exceeding 512 KB are safely truncated with structural integrity preserved.
- **Safe Serialization:** Circular references in arguments or return values are safely flattened without crashing runtime execution.
