# 30-Second Quickstart Guide

Get your first AI agent captured, visualized, and debugged in under 30 seconds with **zero API keys required**.

---

## Step 1: Start AetherTrace

In your terminal:
```bash
pnpm start
```
This boots:
- The local interceptor proxy at `http://localhost:4000`
- The real-time telemetry WebSocket bus at `ws://localhost:4000/ws`
- The visual Flight Deck UI at `http://localhost:3000`
- The local SQLite storage engine at `.trace.sqlite`

---

## Step 2: Route Requests Through the Proxy

You do **not** need to install a special SDK if you don't want to. Simply point your OpenAI or Anthropic client's `baseURL` to AetherTrace:

### Using Official OpenAI Python SDK:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="mock-key", # or your real OPENAI_API_KEY
    default_headers={
        "X-Run-Name": "Triage-Workflow",
        "X-Agent-Name": "TriageAgent",
        "X-Mock-Upstream": "true" # Zero-cost local simulation
    }
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Analyze incident report #409"}]
)
print(response.choices[0].message.content)
```

### Using Official OpenAI Node.js SDK:
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:4000/v1',
  apiKey: process.env.OPENAI_API_KEY || 'mock-key',
  defaultHeaders: {
    'X-Run-Name': 'Triage-Workflow',
    'X-Agent-Name': 'TriageAgent',
    'X-Mock-Upstream': 'true'
  }
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Analyze incident report #409' }]
});
```

---

## Step 3: Open Flight Deck UI

Open your browser to:
👉 **[http://localhost:3000](http://localhost:3000)**

You will instantly see:
1. **Interactive DAG:** Your agent execution represented as a clean, directed acyclic graph.
2. **Monospace Technical Metrics:** Exact latency (`ms`), prompt tokens, completion tokens, and dollar cost (`$0.000000`).
3. **Inspector Drawer:** Click the node to view the exact payload, headers, and model response.
4. **Time-Travel Fork:** Click **Fork IDE**, modify the prompt or swap the model, and re-run downstream nodes at $0.00.

---

## Step 4: Run the Automated Demo Simulation

Want to see multi-agent fan-out, tool calls, and retries in action immediately?
```bash
npx aethertrace sim
# or:
pnpm run demo:sim
```
This dispatches a 5-step autonomous multi-agent simulation that streams live into your open Flight Deck window.
