# Complete Core Debugging Loop Example

> **Goal:** Experience the canonical 9-stage AetherTrace product loop in a single, automated, reproducible script.

```text
OBSERVE → INTERCEPT → PAUSE → INSPECT → MODIFY → REPLAY → FORK → DIFF → VERIFY
```

---

## The 9 Stages Explained

1. **OBSERVE:** Client dispatches initial agent execution through proxy (`localhost:4000`).
2. **INTERCEPT:** Breakpoint armed on target agent (`Engineer`).
3. **PAUSE:** Proxy suspends the incoming HTTP socket in-memory. Execution is frozen.
4. **INSPECT:** Developer inspects pending breakpoint state and payload.
5. **MODIFY:** Operator intervenes mid-flight, modifying prompt instructions before release.
6. **REPLAY:** Previous execution replayed in 0ms at $0.00 from local SQLite cache.
7. **FORK:** Historical execution branched with model mutation (`gpt-4o` → `gpt-4o-mini`).
8. **DIFF:** Side-by-side scorecard calculates exact token, latency, and cost deltas.
9. **VERIFY:** Git, dependency, and environment provenance scorecards confirm reproducibility.

---

## How to Run

```bash
# Ensure AetherTrace is running: pnpm start
pnpm tsx examples/debugging/debug-loop.ts
```
