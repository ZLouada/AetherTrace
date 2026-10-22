# Side-by-Side Diff Arena Guide

The **DAG Diff Arena** aligns any two execution runs step-by-step using a deterministic Needleman-Wunsch sequence alignment algorithm, allowing developers to measure the impact of model upgrades, prompt refactors, and tool changes.

---

## 1. Opening the Diff Arena

- **In Flight Deck:** Click **Diff Arena** in the top navigation or press <kbd>D</kbd>.
- **In CLI:** Run `aethertrace diff <base_run_id> <target_run_id>`.

---

## 2. Aligned Step Classifications

Each step in the comparison matrix is deterministically classified:

| Status | Badge | Meaning |
|---|---|---|
| `identical_cached` | `⚡ CACHED PREFIX` | Identical prompt hash replayed from cache in 0ms at $0.00. |
| `modified_fork` | `🔀 FORK POINT` | Node where human operator mutated prompt or substituted model. |
| `modified` | `✏️ MODIFIED` | Node where inputs or outputs differed between runs. |
| `inserted` | `➕ INSERTED` | Step present in target run but absent from base run. |
| `removed` | `➖ REMOVED` | Step present in base run but absent from target run. |
| `diverged_downstream` | `⬇ DIVERGED` | Node executed downstream from a mutated fork point. |

---

## 3. Executive Scorecard Metrics

The summary header calculates:
- **Total Spend Delta:** Dollar difference and percentage saved (e.g. `-95.8% Saved 💰`).
- **Total Latency Delta:** Milliseconds saved or added.
- **Token Delta:** Net change in prompt and completion tokens.
- **Lineage Classification:** Number of cached prefix steps vs diverged steps.
- **Git & Provenance Diff:** Side-by-side comparison of commit hash, dependency lockfile, and runtime environment.
