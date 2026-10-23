# Framework Integrations Architecture

> **Document Type:** Framework Integration Architecture  
> **Status:** Active / Standardized  
> **Repository:** `aethertrace` ("Wireshark for AI Agents")  
> **Applicable Version:** v0.2.0 (Phase 14)  

---

## 1. Design Philosophy: Zero-Rewrite Integration

The primary objective of AetherTrace framework integrations is:
> **"Add AetherTrace to an existing AI agent with minimal code changes."**

Instead of forcing developers to restructure their agent architectures around proprietary classes, AetherTrace integrates via:
1. **Lightweight Middleware & Client Wrappers:** (e.g. `wrapOpenAI(client)`)
2. **Framework Native Callbacks:** (e.g. `AetherTraceCallbackHandler` for LangChain and LangGraph)
3. **Ergonomic Decorators & Context Managers:** (e.g. `@trace.agent()`, `@trace.tool()`)
4. **Context Propagation Headers:** Automatically bridging async tasks across HTTP boundaries.

```text
┌────────────────────────────────────────────────────────┐
│ Existing Agent Application                             │
│ (LangChain, LangGraph, OpenAI SDK, Custom Agent Loops) │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
      LangChain Hook   wrapOpenAI   Decorators
      (Callbacks)     (HTTP Proxy)  (Context)
             │             │             │
             └─────────────┬─────────────┘
                           │
              Deduplication & Context Guard
                           │
                           ▼
          ┌──────────────────────────────────┐
          │ AetherTrace Proxy & Local SQLite │
          └──────────────────────────────────┘
```

---

## 2. Supported Integrations

### 2.1 OpenAI SDK / OpenAI-Compatible Runtimes
Works universally with OpenAI, Anthropic (via OpenAI proxy/adapter), Ollama, vLLM, Groq, Together, and local LLM endpoints.

#### TypeScript
```ts
import OpenAI from 'openai';
import { wrapOpenAI } from '@aethertrace/sdk';

const openai = wrapOpenAI(new OpenAI(), {
  proxyBaseUrl: 'http://localhost:4000'
});

// All completions are now tracked, cost-accounted, and paused on breakpoints!
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Analyze this trace' }]
});
```

#### Python
```python
from openai import OpenAI
from aethertrace import wrap_openai, trace_run

client = wrap_openai(OpenAI())

with trace_run("analyst-workflow"):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Analyze trace"}]
    )
```

---

### 2.2 LangChain & LangGraph Integration
Provides zero-dependency, duck-typed callback handlers for both Node.js and Python.

#### TypeScript (`AetherTraceCallbackHandler`)
```ts
import { ChatOpenAI } from '@langchain/openai';
import { AetherTraceCallbackHandler } from '@aethertrace/sdk';

const tracer = new AetherTraceCallbackHandler();

const model = new ChatOpenAI({
  modelName: 'gpt-4o',
  callbacks: [tracer]
});

await model.invoke('Hello AetherTrace!');
```

#### Python (`AetherTraceCallbackHandler`)
```python
from langchain_openai import ChatOpenAI
from aethertrace.langchain import AetherTraceCallbackHandler

tracer = AetherTraceCallbackHandler()

llm = ChatOpenAI(model="gpt-4o", callbacks=[tracer])
llm.invoke("Hello AetherTrace!")
```

---

## 3. Deduplication & Idempotency Architecture

When a developer uses both an HTTP proxy interceptor and a framework callback, multiple layers observe the same underlying operation. AetherTrace eliminates double-counting using **Span Deduplication Markers**:

1. **Client Marker Generation:**
   The client SDK generates a unique span ID `X-AetherTrace-Span-Id: <span_id>`.
2. **Context Binding:**
   The active operation is recorded in the local context store (`AsyncLocalStorage` in Node.js, `ContextVar` in Python).
3. **Proxy Recognition:**
   When the proxy server receives an HTTP request containing `X-AetherTrace-Span-Id`, it marks the request as client-instrumented. The proxy updates the existing span rather than inserting a second span.
4. **Result:**
   One single, canonical span in SQLite with complete client-side context (agent name, parent span ID, task description) and complete server-side wire metrics (exact TTFB, latency, raw HTTP status).

---

## 4. Error & Retry Integration

When frameworks implement retry loops (e.g., exponential backoff on HTTP 429 or tool re-tries):
1. The integration tracks the `original_span_id`.
2. Each retry emits a span of type `retry` referencing `parent_span_id = original_span_id`.
3. Downstream spans executed by the retry inherit the retry span as their parent.
4. In Flight Deck, the retry sequence is visualized as a distinct branched retry chain with root-cause links intact.
