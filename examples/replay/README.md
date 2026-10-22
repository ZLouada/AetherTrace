# Time-Travel Replay & Fork Example

> **Goal:** Branch off an existing execution history at an arbitrary node, swap the model, and observe **exact cost deltas** with zero wasted tokens.

---

## Why use AetherTrace here?
In typical AI development, testing a prompt change or model substitution requires re-running the entire multi-step agent workflow from scratch, paying for ancestor steps repeatedly.

AetherTrace provides **topological time travel**:
1. **$0.00 Cached Ancestry:** All nodes preceding the fork point are replayed instantly from cache.
2. **Model & Prompt Mutations:** Swap models (`gpt-4o` → `gpt-4o-mini`) or edit prompt text at the fork point.
3. **Diff Arena:** Compare base and target runs with an executive scorecard calculating dollar savings and latency deltas.

---

## How to Run

```bash
# In terminal:
pnpm tsx examples/replay/replay.ts
```

### Expected Output
```text
======================================================
⏳ AetherTrace Time-Travel Replay & Fork Engine
======================================================

▶ Step 1: Executing Baseline Run (run_base_experiment_1234)...
  ✔ Baseline run completed with 2 spans using gpt-4o.

▶ Step 2: Forking execution at Span #2 and swapping model to gpt-4o-mini...
  ✔ Fork created: run_fork_5678 (Ancestry copied: 1 span)

▶ Step 3: Computing deterministic DAG diff between runs...

--- Executive Diff Scorecard ---
  • Base Run Spend:   $0.000506 (Baseline-Run-1234)
  • Target Run Spend: $0.000030 (Fork-Optimized-1234)
  • Cost Savings:     94% saved 💰
  • Latency Delta:    -180ms
  • Identical Prefix: 1 steps cached ($0.00 / 0ms)
  • Diverged Steps:   1 steps modified/diverged
```
