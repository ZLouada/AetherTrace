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
[![Release: v0.2.0](https://img.shields.io/badge/Release-v0.2.0-blue.svg)](./CHANGELOG.md)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ZLouada%2FAetherTrace-blue?logo=github)](https://github.com/ZLouada/AetherTrace)
[![TypeScript: 5.x](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444.svg)](https://turbo.build/)
[![SQLite WAL](https://img.shields.io/badge/Storage-Local%20SQLite%20(WAL)-003B57.svg)](https://sqlite.org/)
[![Zero Cloud](https://img.shields.io/badge/Cloud%20Dependencies-0%20(100%25%20Local)-brightgreen.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[Quickstart](#-quickstart-in-30-seconds) •
[Screenshots](#-visual-tour--ui-screenshots) •
[Documentation](#-documentation) •
[Step-by-Step Guide](#-step-by-step-guide) •
[Architecture](#-architecture--packet-lifecycle) •
[SDKs](#-step-12-auto-context-propagation-sdks) •
[CLI](#️-cli-reference) •
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

## ⚡ The Solution: AetherTrace v0.2.0

AetherTrace is an open-source, 100% local-first telemetry and optimization workstation:

- 🖧 **Zero-Code-Change Proxy (`:4000`):** Change `baseURL` to `localhost:4000/v1`. Works instantly with OpenAI, Anthropic, or Ollama/local models.
- 💾 **Local-First SQLite Engine (WAL mode):** Everything lives locally in `.trace.sqlite`. Zero external database drivers. Zero cloud telemetry.
- 🧠 **Agent Intelligence:** Deterministic extraction of agent/sub-agent hierarchies, sequential tool chains, parallel execution groups, retry chains, and $O(V+E)$ critical path bottleneck discovery.
- 🧪 **Replay & Experiment Studio:** Fork runs into parameter variants (model, prompt, tools, mocks), replay with topological prefix caching ($0.00 spend on unmutated ancestors), and compare with 10ms analytical scorecards.
- ⚖️ **Evaluation & Optimization Engine:** 100% deterministic local evaluations, zero-eval assertion DSL, error clustering, root cause analysis, and actionable optimization signals with zero external AI judges.
- 🔌 **OpenTelemetry & Ecosystem Interop:** Native OTLP JSON (v1) bidirectional ingestion/export, LangChain/LangGraph adapters, function decorators, and deduplication guards.
- 🖥️ **Flight Deck Workstation (`:3000`):** Interactive React Flow DAG, minimap, pinned spans (`P`), multi-select real-time cost/latency aggregator, single-key navigation (`[`/`]`), and ⌘K Command Palette.
- 🛡️ **Hardware Circuit Breakers & Breakpoints:** Hard budget caps, live HTTP socket pauses mid-flight, prompt/response mutation, and chaos fault injection (429s, 502s, latency delays).
- 📦 **Portable `.trace` Bundles:** Export runs into self-contained `.trace.json` bundles (the AI equivalent of a `.pcap`). Teammates can import and inspect offline.

---

## 📸 Visual Tour & UI Screenshots

<div align="center">

| Execution DAG Canvas (`:3000`) | Side-by-Side Diff Arena |
| :---: | :---: |
| [![Execution DAG](screenshots/01_execution_dag.png)](screenshots/README.md#1-execution-dag--flight-deck-ui) | [![Diff Arena](screenshots/05_diff_arena.png)](screenshots/README.md#5-side-by-side-diff-arena) |

| Event & Node Inspector | ⌘K SQLite FTS5 Command Palette |
| :---: | :---: |
| [![Inspector Drawer](screenshots/02_inspector_drawer.png)](screenshots/README.md#2-event--node-inspector-drawer) | [![Command Palette](screenshots/04_command_palette_search.png)](screenshots/README.md#4-command-palette-k--full-text-search) |

</div>

> 🔍 **Explore all 7 core interface screens in the [Screenshots Gallery](screenshots/README.md)** (Execution DAG, Inspector Drawer, Waterfall Timeline, ⌘K Command Palette, Diff Arena, Breakpoint Interceptor, Chaos Engineering).

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
 │ 1. Chaos Engine  ──▶ 2. Breakers  ──▶ 3. Breakpoint Hold ──▶ 4. Cache ──▶ 5. Forward │
 │    Fault Injection     Budget & Loop    Pause & Mutate         0ms / $0      Upstream/   │
 │    (429/500/Corrupt)   Safety Gates     (Burp Suite Mode)      Local Hit     Mock Engine │
 └────────────────────┬───────────────────────────────────────┬─────────────────────┘
                      │                                       │ (Real-Time WS Event Bus)
                      ▼                                       ▼
  ┌────────────────────────────────────────┐       ┌────────────────────────────────┐
  │         LOCAL SQLITE (WAL MODE)        │       │      FLIGHT DECK UI (:3000)    │
  │         trace_runs & trace_spans       │       │    Interactive React Flow DAG  │
  │         Deterministic Storage          │       │    Live Breakpoint / Chaos IDE │
  └────────────────────────────────────────┘       └────────────────────────────────┘
```

### Trace Packet Lifecycle (Step-by-Step):
1. **Intercept & Context Parsing:** The client sends a standard `/v1/chat/completions` request to `localhost:4000` with optional context headers (`X-Run-Id`, `X-Agent-Name`, `X-Parent-Span-Id`, `X-Max-Budget-USD`, `X-Breakpoint`, `X-Chaos-Inject`).
2. **Chaos Fault Evaluation:** If `X-Chaos-Inject` is specified or probabilistic chaos rules match, the proxy immediately simulates latency, returns a synthetic HTTP 429/502, or injects corrupted JSON syntax, recording a `guardrail_block` span and alerting the UI via `CHAOS_INJECTED`.
3. **Canonical Hash & Circuit Breakers:** The proxy computes `SHA-256(model + messages + tools)`. If spend exceeds `X-Max-Budget-USD` or the exact prompt was repeated 3x in a row, the proxy trips with **HTTP 429** and trips the circuit breaker.
4. **Mid-Flight Breakpoint Hold (Human-in-the-Loop):** If Breakpoints are armed or `X-Breakpoint: true`, the proxy suspends the HTTP connection in-memory (`status: "paused"`), broadcasts `BREAKPOINT_HIT` to Flight Deck, and awaits operator resolution:
   - **▶ Resume (Forward):** Operator can mutate prompt messages, system instructions, or model before releasing to upstream.
   - **🧪 Mock ($0.00):** Operator returns an instant custom synthetic response without burning LLM tokens.
   - **🛑 Abort:** Operator rejects the call with HTTP 403.
5. **Replay Cache:** If `X-Replay-Mode: true` and the hash exists in SQLite, the proxy returns the cached response in **0ms at $0.00**.
6. **Execution & Cost Accounting:** The proxy forwards the request upstream (or simulates realistic mock latency), accumulates tokens, and computes exact USD cost via `@aethertrace/pricing-engine`.
7. **Persistence & Real-Time Broadcast:** The span is committed to `.trace.sqlite` in WAL mode, and the WebSocket broadcaster pushes the node to all connected Flight Deck clients in real time.

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
| `X-Breakpoint` | If `"true"`, holds the HTTP connection suspended mid-flight for operator inspection. | `"false"` |
| `X-Chaos-Inject` | Synthetic fault injection: `'rate_limit'` (429), `'upstream_500'` (502), `'latency'`, or `'corrupt_json'`. | `null` |

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

### Step 7: Live Mid-Flight Breakpoints & Prompt Mutation (Burp Suite Mode)

AetherTrace v0.2.0 lets you intercept agent calls mid-flight before they reach upstream LLMs:

1. **Arm Breakpoints:** In the Flight Deck UI top bar, toggle **"⏸️ Breakpoints: ARMED"** (or send `X-Breakpoint: true` with any agent request).
2. **Connection Suspended:** When an agent invokes `/v1/chat/completions`, the proxy holds the HTTP connection suspended in memory. The node pulses amber with a **`⏸️ Awaiting Human`** badge, and the run enters `paused` state.
3. **Live Inspector Action Bar:**
   - **▶ Resume (Forward):** Edit the system instructions, user prompt, or model parameters right in the Flight Deck editor and click **"Resume (Edited)"**. The proxy releases the request to the upstream LLM using your *mutated* payload.
   - **🧪 Return Mock ($0.00):** Supply a synthetic completion or tool call directly in the browser and return it immediately to the waiting agent script with 0ms latency and $0.00 token cost.
   - **🛑 Abort Call:** Immediately terminate the call with an HTTP `403 Breakpoint Rejected by Operator`.

#### REST Control Endpoints:
```bash
# List all suspended connections awaiting human operator review
curl http://localhost:4000/api/breakpoints

# Arm or disarm global breakpoint interception
curl -X PUT http://localhost:4000/api/breakpoints/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "matchModels": ["gpt-4o"]}'

# Resolve a held breakpoint (resume with mutated payload, mock, or abort)
curl -X POST http://localhost:4000/api/breakpoints/:spanId/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "action": "resume",
    "modifiedPayload": {
      "model": "gpt-4o",
      "messages": [{"role": "user", "content": "Corrected prompt instructions"}]
    }
  }'
```

---

### Step 8: Chaos Engineering & Agent Resilience Testing

Stress-test multi-agent fault recovery, retries, and fallback mechanisms without modifying agent code:

1. Click **"🌪️ Chaos Mode"** in the Flight Deck top bar to configure synthetic faults:
   - **Artificial Latency:** Inject realistic network lag (0–5000ms).
   - **Synthetic 429 Rate Limits:** Trigger upstream quota exhaustion errors.
   - **Synthetic 502 Bad Gateways:** Simulate LLM provider outages.
   - **Malformed JSON Payloads:** Return unparseable JSON to verify agent parsing and self-healing loops.
2. **Per-Request Fault Injection:** Inject faults on specific agent calls by passing the `X-Chaos-Inject` header:
   ```typescript
   // Force synthetic 429 Rate Limit on this specific call
   const res = await fetch('http://localhost:4000/v1/chat/completions', {
     method: 'POST',
     headers: {
       'X-Chaos-Inject': 'rate_limit',
       'X-Agent-Name': 'ResilienceTester'
     },
     body: JSON.stringify({ model: 'gpt-4o', messages: [...] })
   });
   ```
3. Nodes that encounter chaos faults are marked in the Flight Deck DAG with a **`🌪️ Chaos Fault`** badge and logged to SQLite as `guardrail_block` spans.

---

### Step 9: Side-by-Side DAG Diff Arena (Model & Prompt Comparison)

AetherTrace v0.3.0 introduces visual DAG diffing so you can safely substitute expensive models (`gpt-4o`) with smaller or local models (`gpt-4o-mini`, `llama3`) and immediately inspect the exact cost, latency, and quality differences:

1. **Trigger Diff Arena:**
   - On any forked run in the sidebar, click **"⚖️ Diff Parent"**.
   - Or click **"⚖️ Diff Arena"** in the top bar to select any two runs.
2. **Executive Scorecard Banner:**
   - **Cost Delta:** e.g., `$0.001250 ➔ $0.000180 (-85.6% Saved 💰)`.
   - **Latency Delta:** e.g., `640ms ➔ 155ms (-485ms Faster ⚡)`.
   - **Tokens Delta:** e.g., `372 ➔ 310 (-62 tokens)`.
3. **Step-by-Step Aligned DAG Timeline:**
   - **⚡ Shared Cached Prefix (`identical_cached`):** Highlights replayed upstream steps (0ms / $0.00).
   - **🔀 Fork Point (`modified_fork`):** Highlights the exact mutated step with a side-by-side prompt and completion viewer to evaluate model response quality.
   - **⬇ Diverged Downstream (`diverged_downstream`):** Tracks cascading downstream executions.

#### Terminal ASCII Diff:
```bash
npx aethertrace diff run_base_179261588 run_forked_179261588
```

#### REST Diff API:
```bash
curl http://localhost:4000/api/runs/:baseId/diff/:targetId
```

---

### Step 10: Deterministic CI Regression Testing in GitHub Actions

Run automated regression assertions on multi-agent workflows in your CI/CD pipelines before deploying to production:

```bash
# Assert that replaying golden trace does not exceed $0.05 and complies with 3000ms SLA
npx aethertrace assert production-golden.trace.json --max-cost 0.05 --max-latency 3000
```

#### What It Asserts:
1. **Clean Pipeline Execution:** Status is not `breaker_tripped` or `failed`.
2. **Budget Ceilings:** Total USD spend does not exceed `--max-cost`.
3. **Latency SLAs:** Total latency does not exceed `--max-latency`.
4. **Exit Code:** Exits with `0` (PASS) or `1` (FAIL), blocking pull requests on regressions!

#### GitHub Actions Workflow Example:
```yaml
- name: Run AetherTrace Multi-Agent CI Regression Gate
  run: npx aethertrace assert test-fixtures/incident-triager.trace.json --max-cost 0.02
```

---

### Step 11: Run the Autonomous Multi-Agent Simulator

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

### Step 12: Auto-Context Propagation SDKs

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
│   ├── smoke-test.ts                   # Phase 1 integration verification
│   ├── multi-agent-sim.ts              # Phase 2 5-agent DAG simulation with loop breaker trip
│   ├── sdk-export-test.ts              # Phase 3 auto-context propagation & .trace export/import test
│   ├── phase4-breakpoint-chaos-test.ts # Phase 4 live mid-flight breakpoints & chaos fault injection
│   └── phase5-diff-regression-test.ts  # Phase 5 run diffing & CI regression gate test
├── .github/
│   ├── workflows/ci.yml     # Automated pnpm install, build, check-types, smoke, e2e, phase4 & phase5 test
│   └── ISSUE_TEMPLATE/      # Bug reports (with .trace bundle upload) & feature requests
├── Dockerfile               # Multi-stage production container
├── CONTRIBUTING.md          # Architecture guide & good first issues
├── LICENSE                  # MIT License
└── README.md                # Documentation & step-by-step guide
```

---

## 📚 Documentation

Comprehensive guides, SDK references, and architectural specifications are located in the [`docs/`](./docs) directory:

| Section | Guides & References |
| :--- | :--- |
| **Getting Started** | [Quickstart Guide](docs/getting-started/quickstart.md) • [Installation Guide](docs/getting-started/installation.md) • [Configuration Reference](docs/getting-started/configuration.md) |
| **Core Guides** | [Interactive Debugger](docs/guides/debugging.md) • [Semantic Diffing & Time-Travel](docs/guides/diffing.md) • [CI Regression Gates](docs/guides/regression-gates.md) • [Search & ⌘K](docs/guides/search.md) |
| **SDK References** | [TypeScript / Node.js SDK](docs/sdk/typescript.md) • [Python SDK](docs/sdk/python.md) |
| **Operations & CLI** | [CLI Command Reference](docs/cli/commands.md) • [Docker & Production Deployment](docs/deployment/docker.md) • [Trace Format Specification](docs/trace-format/schema-v1.md) |
| **Architecture** | [Current State & Verification](docs/architecture/current-state.md) • [Agent Execution Model](docs/architecture/agent-execution-model.md) • [Interactive Debugger](docs/architecture/debugger.md) • [Time-Travel Engine](docs/architecture/time-travel.md) |
| **Contributing** | [Development Guide](docs/contributing/development.md) • [Testing Guide](docs/contributing/testing.md) • [System Architecture](docs/contributing/architecture.md) |

---

## 📊 How AetherTrace Compares

| Capability | **AetherTrace** ⚡ | LangSmith | Langfuse | Helicone |
| :--- | :---: | :---: | :---: | :---: |
| **Local-First & Offline** | **100% Local (SQLite WAL)** | ❌ Cloud / Heavy Docker | ⚠️ Cloud / Complex Self-Host | ❌ Cloud Only |
| **Zero Cloud Dependencies** | **✅ Yes (Single file db)** | ❌ No | ❌ No (Postgres + ClickHouse) | ❌ No |
| **Drop-in Proxy (`/v1`)** | **✅ Yes** | ❌ SDK wrappers only | ⚠️ Partial | ✅ Yes |
| **Live Mid-Flight Breakpoints** | **✅ Yes (Pause, Mutate, Mock)** | ❌ No | ❌ No | ❌ No |
| **Chaos Fault Injection** | **✅ Yes (429, 500, Latency, Corrupt)** | ❌ No | ❌ No | ❌ No |
| **Side-by-Side DAG Diff Arena**| **✅ Yes (Split-screen & Cost Delta %)**| ❌ No | ❌ No | ❌ No |
| **CI Regression Gate** | **✅ Yes (Budget & SLA assertions)** | ❌ No | ❌ No | ❌ No |
| **Time-Travel Fork & Replay** | **✅ Yes (Edit & Branch)** | ❌ Read-only replays | ❌ Read-only replays | ❌ No |
| **Git & Environment Provenance**| **✅ Yes (Commit, dirty, env hash)**| ❌ No | ❌ No | ❌ No |
| **Secret Redaction & SSRF Shield**| **✅ Yes (Local-first PII scrub)**| ❌ Cloud ingestion | ❌ Cloud ingestion | ❌ No |
| **Instant Search (⌘K FTS5)** | **✅ Yes (< 5ms local index)** | ⚠️ Cloud queries | ⚠️ Cloud queries | ⚠️ Cloud queries |
| **Hardware Circuit Breakers**| **✅ Yes (Budget & Loop)** | ❌ No | ❌ No | ⚠️ Budget limits only |
| **Portable `.trace` Files** | **✅ Yes (`.pcap` for AI)**| ❌ No | ❌ No | ❌ No |
| **Zero-Dep Pricing Engine** | **✅ Yes (OpenAI/Anthropic/Local)**| Proprietary | Server-side | Server-side |

---

## 🧪 Testing & Verification

AetherTrace is tested continuously for concurrency, streaming integrity, and deterministic replay across 14 independent test suites:

```bash
# Monorepo type-checking and production compilation
pnpm check-types
pnpm build

# Foundational integration and end-to-end tests
pnpm test:smoke            # Proxy server, SSE streaming, circuit breaker, replay cache
pnpm test:e2e              # TypeScript SDK context propagation, .trace export/import

# Phase-by-phase architectural regression gates
pnpm test:phase1           # Trace foundation, atomic SQLite WAL persistence, topological sort
pnpm test:phase2           # Semantic DAG ancestry, token fidelity, nested & parallel agents
pnpm test:phase3           # Interactive debugger, live breakpoints, pause/resume, prompt mutation
pnpm test:phase4           # Advanced replay, time travel, multi-generation forks, chaos injection
pnpm test:phase5           # DAG diff arena, Needleman-Wunsch alignment, CI regression gates
pnpm test:phase6           # Git provenance, dependency hashing, reproduction engine
pnpm test:phase7           # Zero-PII secret redaction, SSRF shield, replay safety policies
pnpm test:phase8           # SQLite FTS5 full-text search, keyboard shortcuts, quick filters
pnpm test:phase9           # Design system tokens, high-density flight deck UI, responsive layout
pnpm test:phase10          # Productization, packaging integrity, standalone examples, CLI flags
```

---

## 🛠️ CLI Reference

```text
USAGE:
  npx aethertrace <command> [options]

COMMANDS:
  start                         Launch local proxy server (port 4000) & WebSocket bus
  sim                           Execute an autonomous 5-step multi-agent simulation
  diff <base_id> <target_id>    Compare two runs side-by-side in an ASCII diff matrix
  assert <trace.json>           Assert budget ceiling, latency SLA, and zero breaker trips
  export <run_id>               Export a run to a portable .trace.json bundle
  import <file.json>            Import a .trace.json bundle into local SQLite
  reproduce <trace_file>        Reproduce a historical run verifying environment & git state
  provenance <run_id_or_file>   Inspect git commit, dirty tree, and environment provenance
  search <query>                Full-text search runs, spans, models, and errors
  status                        Check system health, database record counts, and memory
  clean                         Purge local trace database (.trace.sqlite)
  version, --version, -v        Display installed CLI binary version
  help, --help, -h              Show the help menu

OPTIONS:
  -o, --output <file>           Output destination file for export (default: run_<id>.trace.json)
  -p, --port <number>           Port to listen on (default: 4000)
  --max-cost <usd>              Max allowed USD spend for regression assertion
  --max-latency <ms>            Max allowed latency in ms for regression assertion
  --dry-run                     Run reproduction in dry-run mode without external execution
```

---

## 🤝 Contributing

Contributions are warmly welcome! Check out [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Architecture Guide](docs/architecture/current-state.md) for technical deep-dives and development instructions.

---

## 📄 License

AetherTrace is open-source software licensed under the [MIT License](./LICENSE).
