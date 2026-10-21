<div align="center">

```text
     ___         _   _               _____                     
    / _ \  ___  | |_| |__   ___ _ __|_   _| __ __ _  ___ ___   
   / /_\ \/ _ \ | __| '_ \ / _ \ '__| | || '__/ _` |/ __/ _ \  
  |  _  |  __/ | |_| | | |  __/ |    | || | | (_| | (_|  __/  
  |_| |_|\___|  \__|_| |_|\___|_|    |_||_|  \__,_|\___\___|  
```

# AetherTrace ⚡
### Wireshark for AI Agents

**A local-first visual debugger, high-speed reverse proxy, and time-travel replay engine for multi-agent architectures.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ZLouada%2FAetherTrace-blue?logo=github)](https://github.com/ZLouada/AetherTrace)
[![TypeScript: 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444.svg)](https://turbo.build/)
[![SQLite WAL](https://img.shields.io/badge/Storage-Local%20SQLite%20(WAL)-003B57.svg)](https://sqlite.org/)
[![Zero Cloud](https://img.shields.io/badge/Cloud%20Dependencies-0%20(100%25%20Local)-brightgreen.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#-quickstart-in-30-seconds) •
[Step-by-Step Guide](#-step-by-step-guide) •
[Architecture](#-architecture--packet-lifecycle) •
[SDKs](#-step-8-auto-context-propagation-sdks) •
[Comparison](#-how-aethertrace-compares) •
[Contributing](#-contributing)

</div>

---

## 🌪️ The Problem: Multi-Agent Spaghetti

Building multi-agent workflows (with LangChain, AutoGen, CrewAI, or raw OpenAI/Anthropic SDKs) is simple at first. **Observing and debugging them is painful:**

1. **Runaway Token Costs:** An agent gets stuck in a recursive hallucination loop, burning \$50 in 3 minutes before anyone notices.
2. **Non-Deterministic Failures:** Agent #4 outputs corrupted JSON because of an subtle assumption made 3 hops earlier, but you cannot reproduce the exact intermediate state.
3. **Cloud Lock-in & Privacy Bans:** Enterprise security policies prohibit streaming raw agent prompts, customer PII, and internal proprietary code to hosted telemetry SaaS.
4. **No Shareable Debug Artifacts:** In traditional networking, when a packet drops, you inspect a `.pcap` capture in Wireshark. In AI development, engineers have had no standard file format to export, share, and inspect a full multi-agent execution offline.

---

## ⚡ The Solution: AetherTrace

AetherTrace is an open-source, 100% local-first telemetry workstation:

- 🖧 **Zero-Code-Change Proxy (`:4000`):** Change `baseURL` to `localhost:4000/v1`. Works instantly with OpenAI, Anthropic, or Ollama/local models.
- 💾 **Local-First SQLite Engine (WAL mode):** Everything lives locally in `.trace.sqlite`. Zero external database drivers. Zero cloud telemetry.
- 🛡️ **Hardware Circuit Breakers:** Sets hard budget caps and trips instantly on duplicate prompt loops before credit cards get charged.
- 🖥️ **Interactive Flight Deck UI (`:3000`):** Automatic top-to-bottom DAG visualization powered by `@xyflow/react` and Dagre.
- ⏳ **Time-Travel Fork & Replay:** Edit historical prompts or models at any node in the graph, branch off, and replay ancestor nodes in **0ms at $0.00** from local cache.
- 📦 **Portable `.trace` Bundles:** Export any run into a self-contained `.trace.json` file (the AI equivalent of a `.pcap`). Teammates can import and inspect it with one click.

---

## 🏗️ Architecture & Packet Lifecycle

```text
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                        MULTI-AGENT APPLICATION WORKFLOW                          │
 │                   (LangChain, CrewAI, AutoGen, or Custom Scripts)                │
 │                         Node.js (AsyncLocalStorage) / Python (contextvars)       │
 └────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │ HTTP / SSE + Trace Context Headers
                                          ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                  AETHERTRACE INTERCEPTOR PROXY (:4000)                           │
 │                                                                                  │
 │   1. Parse Headers  ──▶  2. Check Breakers  ──▶  3. Check Cache  ──▶ 4. Forward  │
 │      X-Run-Id              Budget Breaker           SHA-256 Match       Upstream │
 │      X-Agent-Name          Loop Breaker (3x)        0ms / $0.00         or Mock  │
 └────────────────────┬───────────────────────────────────────┬─────────────────────┘
                      │                                       │ (Real-Time WS Event Bus)
                      ▼                                       ▼
  ┌────────────────────────────────────────┐       ┌────────────────────────────────┐
  │         LOCAL SQLITE (WAL MODE)        │       │      FLIGHT DECK UI (:3000)    │
  │         trace_runs & trace_spans       │       │    Interactive React Flow DAG  │
  │         Deterministic Storage          │       │    Time-Travel Fork IDE        │
  └────────────────────────────────────────┘       └────────────────────────────────┘
```

### Trace Packet Lifecycle (Step-by-Step):
1. **Intercept:** The client sends a standard `/v1/chat/completions` request to `localhost:4000` with optional context headers (`X-Run-Id`, `X-Agent-Name`, `X-Parent-Span-Id`, `X-Max-Budget-USD`).
2. **Canonical Hash:** The proxy computes `SHA-256(model + messages + tools)` to uniquely identify the prompt state.
3. **Breaker Evaluation:** If total session spend exceeds `X-Max-Budget-USD`, or if the exact same hash was called 3 times in a row, the proxy trips with **HTTP 429**, records a `guardrail_block` span, and alerts the UI.
4. **Replay Cache:** If `X-Replay-Mode: true` and the hash exists in SQLite, the proxy returns the cached response in **0ms at $0.00**.
5. **Streaming / Completion:** The proxy forwards the request upstream (or simulates realistic mock latency), accumulates tokens, and computes exact USD cost via `@aethertrace/pricing-engine`.
6. **Persistence & Broadcast:** The span is committed to `.trace.sqlite` in WAL mode, and the WebSocket broadcaster pushes the node to all connected Flight Deck clients in real time.

---

## 🚀 Quickstart in 30 Seconds

### Option 1: Global CLI

```bash
# 1. Start the proxy server on port 4000 & open local flight deck
npx aethertrace start

# 2. In another terminal, dispatch an autonomous 5-agent DAG simulation
npx aethertrace sim
```

### Option 2: Docker Container (One-Liner)

```bash
docker run -p 3000:3000 -p 4000:4000 ghcr.io/zlouada/aethertrace:latest
```
Open **`http://localhost:3000`** in your browser.

### Option 3: From Source Repository

```bash
git clone https://github.com/ZLouada/AetherTrace.git
cd AetherTrace
pnpm install
pnpm build

# Start both proxy server (:4000) and Flight Deck UI (:3000) in dev mode
pnpm dev
```

---

## 📖 Step-by-Step Guide

Follow this guide to get complete trace visibility, budget protection, and time-travel replay into your multi-agent system.

### Step 1: Install & Launch the Telemetry Stack

Start AetherTrace via CLI or development script:

```bash
pnpm dev
```
You will see:
```text
🚀 AetherTrace Interceptor Proxy running at http://localhost:4000
📡 WebSocket Event Broadcaster listening on ws://localhost:4000/ws
💾 SQLite Database connected (.trace.sqlite)
▲ Next.js Flight Deck ready at http://localhost:3000
```

---

### Step 2: Route Your Agents Through the Proxy

Redirect your OpenAI client by pointing `baseURL` to `http://localhost:4000/v1`. You do **not** need to rewrite your agent logic:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-local',
  baseURL: 'http://localhost:4000/v1',
  defaultHeaders: {
    'X-Run-Name': 'Production-Incident-Triager',
    'X-Agent-Name': 'SRE-Bot',
    'X-Max-Budget-USD': '0.50' // Hard budget cap for this session
  }
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Analyze 504 gateway timeout spike in cluster A' }]
});
```

#### Supported Proxy Headers:
| Header | Description | Default |
| :--- | :--- | :--- |
| `X-Run-Id` | Unique ID grouping calls into a run session. | Auto-generated UUID |
| `X-Run-Name` | Human-readable session name displayed in sidebar. | `'default-run'` |
| `X-Agent-Name` | Name of the active agent node (e.g. `Planner`, `Coder`). | `'default-agent'` |
| `X-Parent-Span-Id` | ID of parent node to link hierarchical DAG edges. | `null` (root node) |
| `X-Max-Budget-USD` | Hard budget cap in USD for this run. | Unlimited |
| `X-Replay-Mode` | If `"true"`, reuses cached response on hash hit ($0.00 / 0ms). | `"false"` |
| `X-Mock-Upstream` | If `"true"`, simulates upstream LLM for offline testing. | `"false"` |

---

### Step 3: Observe Live Telemetry on the Flight Deck

Open **`http://localhost:3000`**:

1. **Left Sidebar (`RunSidebar`):** Displays all execution sessions, real-time status badges (`running`, `completed`, `breaker_tripped`), accumulated tokens, spend, and fork badges.
2. **Center Canvas (`DagCanvas`):** An interactive React Flow canvas rendering nodes hierarchically using Dagre layout. Nodes show agent name, model, token count, cost, and latency.
3. **Right Drawer (`InspectorDrawer`):** Click any node to open the inspector:
   - Full input messages and tool definitions.
   - Raw LLM completion text and token breakdown.
   - Exact SHA-256 canonical hash signature.

---

### Step 4: Protect Pipelines with Circuit Breakers

AetherTrace prevents expensive runaway loops before they charge your card:

1. **Infinite Loop Trip:** If an agent outputs the exact same request 3 times consecutively, the proxy trips with **HTTP 429**:
   ```json
   {
     "error": "Circuit breaker tripped: recursive loop detected (same request hash repeated 3 times in run)"
   }
   ```
2. **Budget Cap Trip:** If the run's cumulative spend reaches `X-Max-Budget-USD`, subsequent calls are rejected.
3. The run status updates immediately to `breaker_tripped` and broadcasts an alert to the UI.

---

### Step 5: Time-Travel Fork & Replay

When an agent hallucinates at step 3 of a 5-step workflow:

1. Click the faulty node in the Flight Deck DAG canvas.
2. In the right drawer, scroll to **"Time-Travel Fork & Replay IDE"**.
3. Edit the system prompt, adjust user instructions, or change `temperature`.
4. Click **"🚀 Fork & Replay from this Node"**.
5. AetherTrace creates a new forked run (`parent_run_id`, `forked_at_span_id`). All upstream ancestor nodes are replayed from cache in **0ms at $0.00 cost**, allowing you to iterate on downstream agents instantly!

---

### Step 6: Export & Share Portable `.trace` Bundles

Just like Wireshark packet captures (`.pcap`), AetherTrace allows exporting complete execution sessions:

```bash
# Export run via CLI
npx aethertrace export run_c0994351-ea00-4a03-8864-bb6589005456 -o bug-report.trace.json
```

Or click **"📤 Export .trace"** in the top bar of Flight Deck.

#### Sharing & Reproducing:
A teammate can import the bundle directly into their local environment:
```bash
npx aethertrace import bug-report.trace.json
```
Or click **"📥 Import .trace"** in Flight Deck. The exact multi-agent graph, tokens, payloads, and metrics are restored instantly into their local SQLite database for offline analysis.

---

### Step 7: Run the Autonomous Multi-Agent Simulator

To see all features in action without configuring an LLM app:

```bash
pnpm demo:sim
# or
npx aethertrace sim
```
This dispatches a 5-step agent DAG:
1. `Planner` (gpt-4o) decomposes the task.
2. `Researcher` (gpt-4o) investigates benchmarks (Parent: Planner).
3. `Coder` (claude-3-5-sonnet) generates implementation (Parent: Researcher).
4. `Reviewer` (gpt-4o-mini) audits security (Parent: Coder).
5. `Rogue Loop Agent` fires recursive calls and trips the circuit breaker on repeat #3.

---

### Step 8: Auto-Context Propagation SDKs

Avoid manually passing `parent_span_id` through your codebase using our native runtime context SDKs:

#### TypeScript / Node.js (`@aethertrace/sdk`)

Uses Node.js `AsyncLocalStorage`:

```typescript
import { traceRun, traceAgent, withSpan, createTracedFetch } from '@aethertrace/sdk';

const fetch = createTracedFetch('http://localhost:4000');

await traceRun('Distributed-Search-DAG', { maxBudgetUsd: 0.25 }, async () => {
  // Step 1: Architect
  const plan = await traceAgent('Architect', async () => {
    const res = await fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Design distributed ingest pipeline' }]
      })
    });
    return res.json();
  });

  // Step 2: Engineer automatically inherits Architect as parent_span_id!
  await traceAgent('Engineer', async () => {
    return fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Implement zero-copy memory ring buffer' }]
      })
    });
  });
});
```

#### Python (`aethertrace`)

Uses Python standard library `contextvars`:

```python
from aethertrace import trace_run, trace_agent, get_trace_headers
import requests

with trace_run("Python-Research-Workflow", max_budget_usd=0.20):
    with trace_agent("Analyst"):
        headers = get_trace_headers()
        # Automatically includes X-Run-Id, X-Agent-Name, and X-Parent-Span-Id
        response = requests.post(
            "http://localhost:4000/v1/chat/completions",
            headers=headers,
            json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": "Extract financial trends"}]
            }
        )
        print(response.json())
```

---

## 📂 Repository Structure

```text
AetherTrace/
├── packages/
│   ├── core-schema/         # Drizzle SQLite schema (trace_runs, trace_spans), WAL mode & SHA-256 hash
│   ├── pricing-engine/      # Zero-dep token cost calculator (OpenAI, Anthropic, Ollama/local)
│   ├── sdk-ts/              # Zero-dep TypeScript SDK with AsyncLocalStorage context propagation
│   ├── sdk-python/          # Python 3.10+ SDK with contextvars header injection
│   └── cli/                 # The `aethertrace` binary (start, sim, export, import)
├── apps/
│   ├── proxy-server/        # Hono reverse proxy (:4000), SSE streaming, circuit breaker, WebSocket bus
│   └── flight-deck/         # Next.js 15 UI (:3000), @xyflow/react DAG visualizer, time-travel fork IDE
├── examples/
│   ├── smoke-test.ts        # Phase 1 integration verification
│   ├── multi-agent-sim.ts   # Phase 2 5-agent DAG simulation with loop breaker trip
│   └── sdk-export-test.ts   # Phase 3 auto-context propagation & .trace export/import test
├── .github/
│   ├── workflows/ci.yml     # Automated pnpm install, build, check-types, smoke & e2e test
│   └── ISSUE_TEMPLATE/      # Bug reports (with .trace bundle upload) & feature requests
├── Dockerfile               # Multi-stage production container
├── CONTRIBUTING.md          # Architecture guide & good first issues
├── LICENSE                  # MIT License
└── README.md                # Documentation & step-by-step guide
```

---

## 📊 How AetherTrace Compares

| Capability | **AetherTrace** ⚡ | LangSmith | Langfuse | Helicone |
| :--- | :---: | :---: | :---: | :---: |
| **Local-First & Offline** | **100% Local (SQLite WAL)** | ❌ Cloud / Heavy Docker | ⚠️ Cloud / Complex Self-Host | ❌ Cloud Only |
| **Zero Cloud Dependencies** | **✅ Yes (Single file db)** | ❌ No | ❌ No (Postgres + ClickHouse) | ❌ No |
| **Drop-in Proxy (`/v1`)** | **✅ Yes** | ❌ SDK wrappers only | ⚠️ Partial | ✅ Yes |
| **Time-Travel Fork & Replay** | **✅ Yes (Edit & Branch)** | ❌ Read-only replays | ❌ Read-only replays | ❌ No |
| **Hardware Circuit Breakers**| **✅ Yes (Budget & Loop)** | ❌ No | ❌ No | ⚠️ Budget limits only |
| **Portable `.trace` Files** | **✅ Yes (`.pcap` for AI)**| ❌ No | ❌ No | ❌ No |
| **Zero-Dep Pricing Engine** | **✅ Yes (OpenAI/Anthropic/Local)**| Proprietary | Server-side | Server-side |

---

## 🧪 Testing & Verification

AetherTrace is tested continuously for concurrency, streaming integrity, and deterministic replay:

```bash
# 1. Type-check all packages in the monorepo
pnpm check-types

# 2. Compile all packages and Next.js Flight Deck
pnpm build

# 3. Verify proxy server, SSE streaming, circuit breaker, and replay cache
pnpm test:smoke

# 4. Verify TypeScript SDK context propagation, .trace export, and SQLite reimport
pnpm test:e2e
```

---

## 🛠️ CLI Reference

```text
USAGE:
  npx aethertrace <command> [options]

COMMANDS:
  start                  Launch local proxy server (port 4000) & event bus
  sim                    Execute a 5-step autonomous multi-agent simulation
  export <run_id>        Export a run to a portable .trace.json bundle
  import <file.json>     Import a .trace.json bundle into local SQLite
  help                   Show this help menu

OPTIONS:
  -o, --output <file>    Output destination file for export (default: run_<id>.trace.json)
  -p, --port <number>    Port to listen on (default: 4000)
```

---

## 🤝 Contributing

Contributions are warmly welcome! Check out [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture deep-dives and development instructions.

---

## 📄 License

AetherTrace is open-source software licensed under the [MIT License](./LICENSE).
