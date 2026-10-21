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
[![TypeScript: 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444.svg)](https://turbo.build/)
[![SQLite WAL](https://img.shields.io/badge/Storage-Local%20SQLite%20(WAL)-003B57.svg)](https://sqlite.org/)
[![Zero Cloud](https://img.shields.io/badge/Cloud%20Dependencies-0%20(100%25%20Local)-brightgreen.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#-quickstart-in-30-seconds) •
[Features](#-key-features) •
[Architecture](#-architecture) •
[SDKs](#-sdks--context-propagation) •
[Portable .trace Bundles](#-portable-trace-bundles-wireshark-pcap-for-ai) •
[Comparison](#-how-aethertrace-compares) •
[Contributing](#-contributing)

</div>

---

## 🌪️ The Problem: Multi-Agent Spaghetti

Building multi-agent systems (LangChain, AutoGen, CrewAI, or bespoke prompt chains) is easy. **Debugging them is a nightmare:**

- **Runaway Token Costs:** An agent gets stuck in a loop and burns \$50 in 3 minutes while you grab coffee.
- **Non-Deterministic Failures:** Agent #4 hallucinates a broken JSON output because of an edge-case 3 hops back, but you can't reproduce the exact context.
- **Cloud Lock-in & Privacy Risks:** Enterprise infosec bans sending internal traces, source code, and customer data to hosted telemetry SaaS.
- **No Way to "Packet Capture":** When a teammate finds an agent failure, there is no shareable file format (like a Wireshark `.pcap`) to reproduce and inspect the exact execution tree offline.

## ⚡ The Solution: AetherTrace

AetherTrace acts as a **local network tap and interactive flight deck** for your AI agents:
1. **Drop-in Reverse Proxy:** Point your `OPENAI_BASE_URL` to `http://localhost:4000/v1` — no code refactoring required.
2. **Deterministic SQLite Engine:** Every call is hashed (SHA-256) and recorded to a local `.trace.sqlite` file in high-throughput WAL mode.
3. **Hard Circuit Breakers:** Sets hard budget caps and trips immediately on infinite prompt loops before credit cards get charged.
4. **Time-Travel Forking:** Click any node in the execution DAG, edit the prompt or model, and re-execute that branch while replaying ancestor nodes instantly from cache ($0.00 cost, 0ms latency).
5. **Portable `.trace` Bundles:** Export any run to a `.trace.json` file. Send it to a teammate or attach it to a GitHub issue; they can import and replay it with one click.

---

## 🏗️ Architecture

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       MULTI-AGENT RUNTIME (LangChain, CrewAI, AutoGen)      │
 │                          Node.js (AsyncLocalStorage) / Python (contextvars) │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ (HTTP / SSE with Trace Context Headers)
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                AETHERTRACE INTERCEPTOR PROXY (:4000)                        │
 │                                                                             │
 │  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────┐  │
 │  │    Circuit Breaker    │──▶│   Pricing Engine       │──▶│ Replay Cache │  │
 │  │ Budget & Loop Checker │   │ Zero-Dep USD Token Calc│   │ SHA-256 Match│  │
 │  └───────────────────────┘   └────────────────────────┘   └──────────────┘  │
 └──────────────────────┬──────────────────────────────────────┬───────────────┘
                        │                                      │ (Real-Time WS)
                        ▼                                      ▼
     ┌────────────────────────────────────┐       ┌────────────────────────────┐
     │       LOCAL SQLITE (WAL MODE)      │       │     FLIGHT DECK UI (:3000) │
     │       trace_runs & trace_spans     │       │    Interactive React Flow  │
     │      Zero cloud dependencies       │       │    DAG + Time-Travel IDE   │
     └────────────────────────────────────┘       └────────────────────────────┘
```

---

## 🚀 Quickstart in 30 Seconds

### Option 1: Global CLI (Fastest)

```bash
# Start proxy server on :4000 & open local flight deck
npx aethertrace start

# In another terminal, run an autonomous 5-agent DAG simulation
npx aethertrace sim
```

### Option 2: Docker (One Command)

```bash
docker run -p 3000:3000 -p 4000:4000 ghcr.io/your-org/aethertrace:latest
```
Visit **http://localhost:3000** to explore the Flight Deck UI.

### Option 3: From Source

```bash
git clone https://github.com/your-org/aethertrace.git
cd aethertrace
pnpm install
pnpm build

# Start both proxy and Flight Deck in development
pnpm dev
```

---

## 🎯 Key Features

### 1. Zero-Config Drop-in Proxy
Simply point your OpenAI client to `localhost:4000`:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'http://localhost:4000/v1',
  defaultHeaders: {
    'X-Run-Name': 'Customer-Support-Pipeline',
    'X-Agent-Name': 'Triage-Agent',
    'X-Max-Budget-USD': '0.50'
  }
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Customer needs refund assistance' }]
});
```

### 2. Autonomous Circuit Breakers
Protect your API budget against rogue agents:
- **Budget Breaker:** If a session's cumulative spend reaches `X-Max-Budget-USD`, subsequent requests are blocked with HTTP 429.
- **Loop Detector:** If the exact same request hash `SHA-256(model + messages + tools)` is submitted 3 times consecutively within the same run, the circuit breaker trips, marks the run `breaker_tripped`, and logs a `guardrail_block` node.

### 3. Interactive Flight Deck DAG Visualizer
Open **`http://localhost:3000`** to inspect the live execution graph:
- **Hierarchical Layout:** Automatic DAG generation via `@xyflow/react` and Dagre.
- **Real-Time Telemetry:** Live WebSocket stream updating spans, latencies, tokens, and USD costs as they occur.
- **Span Inspector:** View exact input messages, tool calls, raw LLM completions, and hash signatures.

### 4. Time-Travel Fork & Replay
Did your agent fail at step 3 of a 6-step chain?
1. Click the failed node in the DAG.
2. In the right-hand Inspector drawer, edit the prompt or change `temperature: 0.2`.
3. Click **"🚀 Fork & Replay from this Node"**.
4. AetherTrace creates a forked branch linked via `parent_run_id` and `forked_at_span_id`. Historical ancestor nodes return in **0ms at $0.00** from local cache, allowing you to iterate on downstream prompts without paying for upstream calls again!

---

## 📦 Portable `.trace` Bundles ("Wireshark `.pcap` for AI")

Just like Wireshark allows engineers to save `.pcap` packet captures, AetherTrace enables **portable, self-contained AI execution traces**:

```bash
# Export any run to a portable bundle
npx aethertrace export run_c57e2eae-ba68-450e-8fb8-db73c6a46979 -o bug-trace.json

# Teammates can import it directly into their local SQLite
npx aethertrace import bug-trace.json
```

Or click **"📤 Export .trace"** and **"📥 Import .trace"** directly in the Flight Deck UI.

---

## 🧩 SDKs & Context Propagation

No need to manually pass `parent_span_id` through every helper function. AetherTrace SDKs utilize native runtime context isolation:

### TypeScript / Node.js (`@aethertrace/sdk`)

```typescript
import { traceRun, traceAgent, withSpan, createTracedFetch } from '@aethertrace/sdk';

const fetch = createTracedFetch('http://localhost:4000');

await traceRun('Research-Pipeline', { maxBudgetUsd: 0.25 }, async () => {
  // Step 1: Planner
  const plan = await traceAgent('Planner', async () => {
    return fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Break down task' }] })
    });
  });

  // Step 2: Coder automatically inherits Planner's span as parent_span_id!
  await traceAgent('Coder', async () => {
    return fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Implement code' }] })
    });
  });
});
```

### Python (`aethertrace`)

```python
from aethertrace import trace_run, trace_agent, get_trace_headers
import requests

with trace_run("Python-Agent-Workflow", max_budget_usd=0.20):
    with trace_agent("Analyst"):
        headers = get_trace_headers()
        # Automatically includes X-Run-Id, X-Agent-Name, and X-Parent-Span-Id
        res = requests.post(
            "http://localhost:4000/v1/chat/completions",
            headers=headers,
            json={"model": "gpt-4o", "messages": [{"role": "user", "content": "Analyze data"}]}
        )
```

---

## 📊 How AetherTrace Compares

| Feature | **AetherTrace** ⚡ | LangSmith | Langfuse | Helicone |
| :--- | :---: | :---: | :---: | :---: |
| **Local-First & Offline** | **100% Local (SQLite WAL)** | ❌ Cloud / Heavy Docker | ⚠️ Cloud / Complex Self-Host | ❌ Cloud Only |
| **Zero Cloud Dependencies** | **✅ Yes (Single file db)** | ❌ No | ❌ No (Postgres + ClickHouse) | ❌ No |
| **Drop-in Proxy (`/v1`)** | **✅ Yes** | ❌ SDK wrappers only | ⚠️ Partial | ✅ Yes |
| **Time-Travel Fork & Replay** | **✅ Yes (Edit & Branch)** | ❌ Read-only replays | ❌ Read-only replays | ❌ No |
| **Hardware Circuit Breakers**| **✅ Yes (Budget & Loop)** | ❌ No | ❌ No | ⚠️ Budget limits only |
| **Portable `.trace` Files** | **✅ Yes (`.pcap` for AI)**| ❌ No | ❌ No | ❌ No |
| **Zero-Dep Pricing Engine** | **✅ Yes (OpenAI/Anthropic/Local)**| Proprietary | Server-side | Server-side |

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

## 🧪 Testing & Verification

AetherTrace is tested continuously for concurrency, streaming integrity, and deterministic replay:

```bash
# Verify schema, proxy server, streaming SSE, and circuit breakers
pnpm test:smoke

# Verify TypeScript SDK context propagation, .trace export, and SQLite reimport
pnpm test:e2e

# Run multi-agent live simulation
pnpm demo:sim
```

---

## 🤝 Contributing

Contributions are warmly welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture deep-dives and development instructions.

---

## 📄 License

AetherTrace is open-source software licensed under the [MIT License](./LICENSE).
