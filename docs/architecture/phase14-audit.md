# AetherTrace Architecture: Phase 14 Readiness Audit

> **Document Type:** Architectural Audit & Readiness Assessment  
> **Target Release:** AetherTrace v0.2.0 (Phase 14 — Ecosystem & Integrations)  
> **Status:** Completed & Approved  
> **Author:** AetherTrace Core Architecture  
> **Date:** October 2026  

---

## 1. Executive Summary

Phase 14 represents the integration gateway of **AetherTrace v0.2.0**:
```text
Phase 11: UNDERSTAND   (Agent Intelligence, Hierarchies, Critical Path, Causality)
    ↓
Phase 12: EXPERIMENT   (Replay Studio, Variants, Mutations, Prefix Cache, Batch Pools)
    ↓
Phase 13: EVALUATE     (Deterministic Assertions, Root Cause, Optimization Signals)
    ↓
Phase 14: INTEGRATE    (OpenTelemetry Interoperability, Framework Adapters, Ergonomic SDKs)
```

The core strategic mission of Phase 14 is:
> **"Integrate AetherTrace into existing agent applications without requiring developers to rewrite their agents."**

The product transforms from:
> *"A debugger you have to build your agent around."*  
into:  
> *"The debugger you attach to the agent you already built."*

### Primary Architectural Tenets & Guardrails
1. **100% Local-First & Zero Cloud Collectors:** AetherTrace remains fully local, storing all telemetry in local SQLite (`.trace.sqlite`). It does not become an external Jaeger/Prometheus SaaS backend or require a third-party collector daemon.
2. **Translate to AetherTrace Semantic Model:** External telemetry (OTel, framework callbacks) maps directly into AetherTrace's standard event taxonomy (`LLM`, `TOOL`, `AGENT`, `HTTP`, `ERROR`, `RETRY`, `USER`, `SYSTEM`). We do not create a parallel or secondary telemetry subsystem.
3. **Zero Double-Instrumentation:** Deduplication guards guarantee that nested hooks, proxy interception, and framework middleware never produce duplicate spans for a single underlying operation.
4. **Preserve Phases 0–13 Foundations:** All existing capabilities—DAG visualization, Flight Deck, breakpoints, replay cache, Diff Arena, execution intelligence, experiment studio, and evaluation engine—operate seamlessly over imported and instrumented traces.
5. **Strict Security & Secret Redaction:** All imported OTel spans, framework attributes, and payloads are sanitized through the Phase 7 secret detection engine before storage or indexing.

---

## 2. Audit of Existing Subsystems & Integration Points

A comprehensive inspection of the codebase yields the following assessment of current capabilities:

| Subsystem | Existing Implementation | Reusability in Phase 14 | Exact Gaps Phase 14 Must Solve |
|---|---|---|---|
| **TypeScript SDK** (`packages/sdk-ts`) | `traceRun`, `traceAgent`, `traceTool`, `traceHttp`, `traceRetry`, `createTracedFetch`, `wrapOpenAI`, `AsyncLocalStorage` context propagation. | Highly reusable context engine and HTTP client wrapper. | Lacks framework callbacks (LangChain, LangGraph), automatic deduplication guards, structured tool decorators/wrappers, and safe flush/shutdown controls. |
| **Python SDK** (`packages/sdk-python`) | `trace_run`, `trace_agent`, `trace_tool`, `trace_retry` context managers/decorators with `contextvars` context propagation. | Core context mechanics already established. | Lacks HTTP span emission (`emit_span`), OpenAI client wrapper, LangChain callback handler, error capture, and OTel interop. |
| **Core Schema & Ingestion** (`packages/core-schema`) | SQLite WAL mode, `trace_runs`, `trace_spans`, `evaluations`, `experiments`, transaction-safe upserts. | Standard database tables and schemas remain stable. | Needs dedicated OTel mapping module (`packages/core-schema/src/otel/`) to parse OTLP JSON and translate GenAI / HTTP attributes. |
| **Import / Export** (`apps/proxy-server/src/routes/traces.ts`) | `GET /api/runs/:id/export` (.trace.json), `POST /api/runs/import` (.trace.json). | Reusable HTTP validation, limit enforcement, and SQLite transaction import logic. | Needs OTLP JSON endpoints (`POST /api/runs/import/otel`, `GET /api/runs/:id/export/otel`, `POST /v1/traces`). |
| **Pricing Engine** (`packages/pricing-engine`) | Pure math USD cost calculation across 15+ models (`calculateCost`). | Essential for computing costs on imported OTel spans with token counts. | When OTel lacks cost but provides `gen_ai.request.model` and token metrics, estimate cost deterministically. |
| **Security & Redaction** (`packages/core-schema/src/security/`) | `redactValue`, `redactSensitiveData`, `DEFAULT_LIMITS`, `validateIdentifier`, SSRF shield. | Mandatory filter for all external and imported data. | External OTel attributes and framework metadata can contain API keys or auth headers; must run through `redactValue`. |
| **CLI Suite** (`packages/cli`) | `start`, `inspect`, `diff`, `assert`, `experiment`, `evaluate`, `export`, `import`. | Common CLI runner and output formatters. | Add `aethertrace otel import <file>` and `aethertrace otel export <run_id>`. |
| **Flight Deck UI** (`apps/flight-deck`) | DAG canvas, Inspector Drawer, Timeline, Experiment Studio, Evaluation Studio. | Complete UI primitives and design system tokens. | Add source/origin badge in Inspector Drawer and TopBar (e.g., `OTel Import`, `LangChain`, `OpenAI`). |

---

## 3. OpenTelemetry (OTel) Decision & Mapping Specification

### 3.1 Format Selection: OTLP JSON (v1)
- **Decision:** Implement **OTLP/HTTP JSON** (`application/json`) following the OpenTelemetry `ExportTraceServiceRequest` specification.
- **Rationale:**
  - Zero heavy protobuf binary compiler dependencies in the core repository.
  - OTLP JSON is natively supported by modern OTel SDKs (`@opentelemetry/exporter-trace-otlp-http`, `opentelemetry-exporter-otlp-proto-http`).
  - Human-readable, inspectable, and directly diffable in CLI and test matrices.
  - Keeps package sizes light and preserves zero-dependency principles where possible.

### 3.2 OTel $\leftrightarrow$ AetherTrace Semantic Attribute Mapping

| OpenTelemetry Attribute / Field | AetherTrace Semantic Field | Notes & Fallback Rules |
|---|---|---|
| `traceId` (32-char hex) | `run_id` (`run_otel_<hex>`) | Normalized to deterministic AetherTrace run ID; preserves source trace ID in metadata. |
| `spanId` (16-char hex) | `span_id` (`span_otel_<hex>`) | Deterministic hex-safe ID translation. |
| `parentSpanId` (16-char hex) | `parent_span_id` (`span_otel_<hex>`) | Mapped to parent; `null` if empty or root span. |
| `startTimeUnixNano` / `endTimeUnixNano` | `created_at` / `latency_ms` | Converted from nanoseconds to integer milliseconds: `ms = Math.floor(ns / 1_000_000)`. |
| `status.code` (`STATUS_CODE_ERROR` / 2) | `response_payload.status = 'error'` | Extracts `status.message` or `events[name="exception"]`. |
| `gen_ai.system` / `llm.provider` | `agent_name` / `model` metadata | Resolves provider name. |
| `gen_ai.request.model` / `model` | `model` | Exact LLM model name (e.g. `gpt-4o`, `claude-3-5-sonnet`). |
| `gen_ai.usage.input_tokens` / `prompt_tokens` | `prompt_tokens` | Token accounting integer. |
| `gen_ai.usage.output_tokens` / `completion_tokens` | `completion_tokens` | Token accounting integer. |
| `gen_ai.prompt` / `messages` | `request_payload` | Standardized JSON payload. |
| `gen_ai.completion` / `response` | `response_payload` | Standardized JSON payload. |
| `gen_ai.tool.name` / `tool.name` | `span_type = 'tool_call'`, `agent_name` | Classifies span as `TOOL` event. |
| `http.request.method` / `http.method` | `span_type = 'http_call'` | Classifies span as `HTTP` event. |
| `aethertrace.*` | Native fields | Custom extensions (e.g. `aethertrace.execution_origin`, `aethertrace.agent_name`). |

### 3.3 Semantic Event Inference Rules
If an OTel span does not have explicit `aethertrace.*` tags, classify via deterministic priority heuristics:
1. **Tool Call (`tool_call`):** Has `gen_ai.tool.name`, `tool.name`, or `span.kind == SPAN_KIND_INTERNAL` with tool attributes.
2. **LLM Call (`llm_call`):** Has `gen_ai.request.model`, `gen_ai.system`, `llm.provider`, or `prompt_tokens`.
3. **HTTP Call (`http_call`):** Has `http.request.method` or `url.full` / `http.url`.
4. **Agent State (`agent_state`):** Has `agent.name`, `agent.role`, or `gen_ai.agent.name`.
5. **Retry (`retry`):** Has `retry.attempt`, `retry_count`, or `aethertrace.span_type == 'retry'`.
6. **Generic Fallback:** Retain as `llm_call` or `system_event` without inventing false semantics.

---

## 4. Framework Integrations Selection

To maximize impact while avoiding dependency bloat, Phase 14 selects two primary framework targets:
1. **OpenAI SDK / OpenAI-Compatible Agents (Node.js & Python):**
   - Universal standard across the industry (Ollama, vLLM, Groq, Together, DeepSeek, OpenAI).
   - Zero-dependency client wrapping: intercepts chat completions, tool calls, and structured outputs.
2. **LangChain & LangGraph (Node.js & Python):**
   - The leading open-source agent framework with multi-agent graphs, state transitions, and tool executors.
   - Elegant, decoupled integration using native `BaseCallbackHandler` mechanics:
     - `onLLMStart` / `onLLMEnd` / `onLLMError`
     - `onToolStart` / `onToolEnd` / `onToolError`
     - `onChainStart` / `onChainEnd` / `onChainError`
   - Duck-typed handler implementation requiring **zero mandatory external dependencies** inside `@aethertrace/sdk`.

---

## 5. Deduplication & Idempotency Strategy

When an application uses both a framework callback handler (e.g. LangChain) and an HTTP proxy (e.g. `http://localhost:4000/v1`), AetherTrace must not record two spans for the same LLM request.

### Deduplication Mechanism:
1. **Context Marker:** When the SDK or CallbackHandler initiates an LLM call, it injects an idempotency header `X-AetherTrace-Span-Id: <span_id>`.
2. **Proxy Deduplication Guard:** When `proxyRouter` intercepts a request containing `X-AetherTrace-Span-Id`, it recognizes that the client-side SDK is already tracking this span's lifecycle. The proxy updates the existing span's network metadata or response payload rather than inserting a duplicate span.
3. **In-Flight Context Tracking:** AsyncLocalStorage and ContextVar carry `active_operation_id` to suppress secondary hooks.

---

## 6. Implementation Plan & Package Architecture

```text
packages/core-schema/src/
├── otel/
│   ├── types.ts          # OTLP JSON ExportTraceServiceRequest & Attribute schemas
│   ├── mapper.ts         # Bidirectional translation (OTel <-> AetherTrace)
│   ├── importer.ts       # Deterministic OTel trace importer with secret sanitization
│   └── exporter.ts       # Deterministic OTel trace exporter with aethertrace.* namespace
│
packages/sdk-ts/src/
├── index.ts              # Core exports (enhanced traceRun, traceAgent, wrapOpenAI)
├── integrations/
│   ├── langchain.ts      # AetherTraceCallbackHandler for LangChain / LangGraph
│   └── openai.ts         # Enhanced OpenAI wrapper & tool decorators
└── deduplication.ts      # Span deduplication markers and idempotency guards

packages/sdk-python/aethertrace/
├── __init__.py           # Enhanced trace_run, trace_agent, trace_tool, wrap_openai
└── langchain.py          # AetherTraceCallbackHandler for Python LangChain

apps/proxy-server/src/routes/
├── traces.ts             # Mount /api/runs/import/otel, /api/runs/:id/export/otel
└── otel.ts               # Mount standard OTLP endpoint: POST /v1/traces

packages/cli/src/bin.ts   # aethertrace otel import/export subcommands
```

---

## 7. Approval & Go-Forward Sign-off

- **Architecture Audit Complete:** All existing capabilities and Phase 0–13 guarantees verified.
- **Zero Scope Creep:** Strictly bounded to Ecosystem & Integrations (OTel, SDK, Framework Adapters, Deduplication, Verification).
- **Execution Ready:** Proceeding to Step 2 (Core OTel translation and mapping).
