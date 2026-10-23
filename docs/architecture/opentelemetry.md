# OpenTelemetry Interoperability Specification

> **Document Type:** Standards & Interoperability Specification  
> **Status:** Active / Standardized  
> **Repository:** `aethertrace` ("Wireshark for AI Agents")  
> **Applicable Version:** v0.2.0 (Phase 14)  

---

## 1. Overview & Strategy

AetherTrace provides first-class interoperability with **OpenTelemetry (OTel)** while strictly maintaining its local-first, zero-cloud architecture:

```text
External System / OTel Agent
            │
            │ OTLP / HTTP (JSON)
            ▼
┌──────────────────────────────────────────────┐
│   AetherTrace Proxy (Port 4000)              │
│   • POST /v1/traces  (Standard OTLP)         │
│   • POST /api/runs/import/otel               │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│   OTel Semantic Mapper                       │
│   • Translates ResourceSpans -> Run & Spans  │
│   • GenAI Attributes -> Cost / Tokens / Model│
│   • Secret Redactor (Sanitizes Keys/Tokens)  │
│   • Deterministic ID Normalization           │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│   Local SQLite Store (.trace.sqlite)         │
│   • Trace Foundation & WAL Mode              │
│   • Agent Intelligence & Critical Path (P11) │
│   • Replay & Experiment Studio (P12)         │
│   • Evaluation & Optimization Engine (P13)   │
└──────────────────────────────────────────────┘
```

AetherTrace is **not** a cloud collector; it is a **local-first visual debugger and execution comprehension engine**. OpenTelemetry telemetry imported into AetherTrace immediately unlocks:
- **Flight Deck DAG & Waterfall Visualization**
- **Deterministic Agent Intelligence (Hierarchies, Tool Chains, Parallel Groups, Critical Path)**
- **Deterministic Evaluation & Optimization (Zero-Eval Assertions, Root Cause Analysis)**
- **Semantic Diffing & Regression Testing**

---

## 2. OTLP Representation

AetherTrace supports the official **OTLP/HTTP JSON (v1)** format defined by the OpenTelemetry specification (`ExportTraceServiceRequest`).

### Why OTLP JSON?
1. **Zero Native Compilers:** Requires no heavy C++/Protobuf bindings or toolchains.
2. **Ecosystem Standard:** Directly exported by `@opentelemetry/exporter-trace-otlp-http` (Node.js), `opentelemetry-exporter-otlp-proto-http` (Python), and standard OTel collectors.
3. **Auditable & Secret-Scrubbable:** Pure JSON payloads are easily parsed and validated with zero prototype pollution and zero binary overhead.

---

## 3. Semantic Mapping & Conventions

### 3.1 Trace & Span Identification

| OTel Identifier | AetherTrace Field | Normalization & Mapping Rules |
|---|---|---|
| `traceId` (32 hex chars) | `run_id` | If string matches 32-hex, normalized as `run_otel_<traceId>`. If already an AetherTrace ID (`run_...`), retained as-is. |
| `spanId` (16 hex chars) | `span_id` | Normalized as `span_otel_<spanId>`. |
| `parentSpanId` (16 hex chars) | `parent_span_id` | Normalized as `span_otel_<parentSpanId>`. Omitted or set to `null` if empty string or all zeroes (`0000000000000000`). |

### 3.2 Timestamps & Timing

- **OTel:** Unix timestamps in nanoseconds as strings or numbers (`startTimeUnixNano`, `endTimeUnixNano`).
- **AetherTrace:** Millisecond Unix timestamps (`created_at`) and millisecond duration (`latency_ms`).
- **Conversion Formula:**
  $$\text{created\_at} = \left\lfloor \frac{\text{startTimeUnixNano}}{1\,000\,000} \right\rfloor$$
  $$\text{latency\_ms} = \max\left(0, \left\lfloor \frac{\text{endTimeUnixNano} - \text{startTimeUnixNano}}{1\,000\,000} \right\rfloor\right)$$

### 3.3 Semantic Event Classification

Spans are classified into AetherTrace's standard event taxonomy (`llm_call`, `tool_call`, `agent_state`, `http_call`, `retry`, `guardrail_block`, `user_input`, `system_event`) using the following deterministic priority order:

1. **Tool Call (`tool_call`):**
   - Matches if attribute `gen_ai.tool.name`, `tool.name`, or `function.name` exists.
   - Or if `gen_ai.operation.name == "tool"`.
2. **LLM Call (`llm_call`):**
   - Matches if attribute `gen_ai.system`, `gen_ai.request.model`, `llm.provider`, or `gen_ai.prompt` exists.
   - Or if `span.kind == 3` (CLIENT) with GenAI attributes.
3. **HTTP Call (`http_call`):**
   - Matches if attribute `http.request.method`, `http.method`, `url.full`, or `http.url` exists.
4. **Agent State (`agent_state`):**
   - Matches if attribute `agent.name`, `agent.role`, or `gen_ai.agent.name` exists.
5. **Retry Span (`retry`):**
   - Matches if attribute `retry.attempt`, `retry_count`, or `aethertrace.span_type == "retry"` exists.
6. **Fallback (`system_event` or `llm_call`):**
   - Preserves unclassified spans as generic events without fabricating telemetry.

### 3.4 OpenTelemetry GenAI Conventions (`gen_ai.*`)

| OTel GenAI Attribute | AetherTrace Field | Type | Description |
|---|---|---|---|
| `gen_ai.system` | `agent_name` / `provider` | string | LLM provider (e.g., `openai`, `anthropic`, `ollama`) |
| `gen_ai.request.model` | `model` | string | Target model requested (e.g., `gpt-4o`) |
| `gen_ai.response.model` | `model` | string | Actual model returned by provider |
| `gen_ai.usage.input_tokens` | `prompt_tokens` | integer | Number of prompt tokens |
| `gen_ai.usage.output_tokens` | `completion_tokens` | integer | Number of completion tokens |
| `gen_ai.prompt` | `request_payload` | object/string | Prompt or messages payload |
| `gen_ai.completion` | `response_payload` | object/string | Model completion payload |
| `gen_ai.tool.name` | `agent_name` / `tool_name` | string | Name of tool executed |
| `gen_ai.tool.call.arguments` | `request_payload.arguments` | object/string | Arguments passed to tool |
| `gen_ai.tool.call.result` | `response_payload.result` | object/string | Output returned by tool |

### 3.5 Cost Derivation

If the imported OTel span includes token usage (`prompt_tokens`, `completion_tokens`) and model name (`model`) but lacks explicit financial cost:
1. AetherTrace automatically runs the tokens and model through `@aethertrace/pricing-engine`.
2. Sets `cost_usd = calculateCost(model, prompt_tokens, completion_tokens)`.
3. Marks `usage_status = 'estimated'`.
4. If model is unknown, sets `cost_usd = 0.0` and `usage_status = 'unavailable'`. Never fabricates prices.

---

## 4. AetherTrace Custom Extensions (`aethertrace.*`)

When exporting AetherTrace traces to OpenTelemetry, domain-specific features that exceed standard semantic conventions are exported in the dedicated `aethertrace.*` attribute namespace:

```json
{
  "key": "aethertrace.execution_origin",
  "value": { "stringValue": "cached_replay" }
}
```

### Supported Extension Attributes:
- `aethertrace.version`: AetherTrace trace schema version (e.g. `"1.1"`).
- `aethertrace.span_type`: Specific span type (`llm_call`, `tool_call`, `retry`, `agent_state`, etc.).
- `aethertrace.agent_name`: Logical agent name.
- `aethertrace.execution_origin`: Origin status (`original`, `cached_replay`, `new_execution`, `modified`, `mocked`).
- `aethertrace.cost_usd`: Exact dollar cost.
- `aethertrace.usage_status`: Token accounting fidelity (`reported`, `estimated`, `unavailable`).
- `aethertrace.cache_hit`: Cache hit status (`0` or `1`).
- `aethertrace.source_span_id`: ID of fork or replay predecessor.

---

## 5. Security & PII Protection

Every incoming OTel payload undergoes strict Phase 7 sanitization prior to SQLite insertion or search indexing:
1. **Secret Scanning:** All attribute values and payload strings pass through `redactValue()`, masking API keys, JWTs, AWS credentials, and authorization bearer tokens.
2. **Payload Size Limits:** Spans exceeding `DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES` (512 KB) are truncated with metadata preservation.
3. **Import Batch Limit:** The entire request body cannot exceed `DEFAULT_LIMITS.MAX_IMPORT_BYTES` (50 MB).
4. **Prototype Pollution Protection:** Attribute maps are converted using safe dictionary lookups (`safeGetProperty`).

---

## 6. API Endpoints

### 1. Ingestion / Import: `POST /v1/traces` & `POST /api/runs/import/otel`
- **Content-Type:** `application/json`
- **Body:** Standard OTLP `ExportTraceServiceRequest` JSON.
- **Response:**
  ```json
  {
    "success": true,
    "runId": "run_otel_4bf92f3577b34da6a3ce929d0e0e4736",
    "spansImported": 14,
    "source": "opentelemetry"
  }
  ```

### 2. Export: `GET /api/runs/:id/export/otel`
- **Response:** Standard OTLP `ExportTraceServiceRequest` JSON bundle.
- **Headers:** `Content-Disposition: attachment; filename="run_<id>.otel.json"`

---

## 7. CLI Usage

```bash
# Import an OTel trace JSON file into local SQLite
aethertrace otel import ./trace.otel.json --name "production-incident-agent"

# Export an existing run to OTLP JSON format
aethertrace otel export run_89a3f211 -o ./run_89a3f211.otel.json
```
