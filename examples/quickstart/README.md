# AetherTrace Quickstart Example

> **Goal:** Run your first 3-step agent execution through AetherTrace in under 30 seconds with **zero API keys and $0.00 spend**.

---

## Why use AetherTrace here?
When running multi-agent workflows (Planner → Researcher → Coder), standard logging prints flat console logs that lose parent-child context, token consumption, and intermediate state. 

AetherTrace intercepts and links each step into a **deterministic execution DAG**, tracking exact latency, tokens, and cost.

---

## 1. Prerequisites
Ensure the AetherTrace workstation is running:
```bash
# In terminal 1 (repository root):
pnpm start
# or: npx aethertrace start
```

---

## 2. Run the Example

```bash
# In terminal 2:
pnpm tsx examples/quickstart/index.ts
```

### Expected Output
```text
======================================================
⚡ AetherTrace 30-Second Quickstart Execution
======================================================

▶ Step 1: Dispatching Planner Agent...
  ✔ [Planner] -> Span: span_a1b2c3d4... | Cost: $0.000000
▶ Step 2: Dispatching Researcher Agent...
  ✔ [Researcher] -> Span: span_e5f6g7h8... | Cost: $0.000000
▶ Step 3: Dispatching Coder Agent...
  ✔ [Coder] -> Span: span_i9j0k1l2... | Cost: $0.000000

======================================================
✨ Run Captured: "Quickstart-Incident-Analysis-1234"
💻 Open Flight Deck to inspect execution DAG:
   http://localhost:3000
======================================================
```

---

## 3. What to Inspect in Flight Deck (`:3000`)
1. **DAG Graph View:** View the directed hierarchy `Planner` → `Researcher` → `Coder`.
2. **Timeline Waterfall:** Click `T` to inspect chronological waterfall offsets.
3. **Inspector Drawer:** Click any span node to view request/response payloads, latency, and tokens.
4. **Time-Travel Fork:** In the Inspector, click the **Fork IDE** tab, modify the prompt or model, and branch off a new execution generation.
