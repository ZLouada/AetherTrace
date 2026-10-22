# Multi-Agent Hierarchy & Fan-Out Example

> **Goal:** Run a real multi-agent workflow featuring **nested supervisor-worker relationships** and **parallel asynchronous fan-out branches**.

---

## Why use AetherTrace here?
When agents spawn parallel tasks (e.g. `Promise.all` across multiple analyzer agents), traditional logging interweaves console outputs unpredictably. 

AetherTrace leverages `AsyncLocalStorage` to automatically track:
1. Exact topological ancestry (which branch spawned which subagent).
2. Sibling isolation (parallel subagents do not collide or cross-contaminate context).
3. Consolidated execution DAG view in Flight Deck.

---

## How to Run

```bash
# In terminal:
pnpm tsx examples/llm-agent/agent.ts
```

### Expected Flight Deck Topology
```text
            [Supervisor]
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
[StaticAnalyzer_Alpha] [FormalVerifier_Beta]
       │                   │
       └─────────┬─────────┘
                 ▼
        [SynthesisDirector]
```
