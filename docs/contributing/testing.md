# Testing & Quality Assurance Guide

AetherTrace enforces strict regression gates across all phases of development. Every pull request must pass typechecks, builds, and the complete regression suite.

---

## 1. Regression Test Suite

All tests can be executed individually from the repository root:

| Command | Test Focus |
|---|---|
| `pnpm check-types` | Strict TypeScript validation across all 6 packages (zero `any` regressions). |
| `pnpm build` | Production build across Turborepo packages and Next.js static pages. |
| `pnpm test:smoke` | Proxy server, SQLite WAL mode, circuit breakers, and replay cache. |
| `pnpm test:e2e` | Node.js `AsyncLocalStorage` context propagation & `.trace.json` export/import. |
| `pnpm test:phase1` | Concurrent trace aggregation (100 parallel spans) & Needleman-Wunsch diffing. |
| `pnpm test:phase2` | Agent execution model, nested agents, parallel branches, and structured retries. |
| `pnpm test:phase3` | Interactive visual debugger, WebSocket telemetry bus, and 1,000-span layout benchmark. |
| `pnpm test:phase4` | Live mid-flight breakpoints, prompt mutation, mock overrides, and chaos faults. |
| `pnpm test:phase4-advanced` | Time-travel replay, fork lineage pruning, and 10,000-span scalability SLA. |
| `pnpm test:phase5` | Side-by-side Diff Arena, cost delta scorecards, and CI regression assertions. |
| `pnpm test:phase6` | Git provenance, source fingerprinting, lockfile hashes, and CLI reproduction. |
| `pnpm test:phase7` | Zero-eval sandbox, secret detection/redaction pipeline, SSRF shield, and replay safety. |
| `pnpm test:phase8` | Zero-eval query parser, SQLite FTS5 engine, deterministic ranking, and error discovery. |
| `pnpm test:phase9` | Design system tokens, 13 UI primitives, accessibility (`:focus-visible`), and reduced motion. |

---

## 2. Running All Tests Before Submitting a PR

Run this one-liner to verify all gates locally:

```bash
pnpm check-types && pnpm build && pnpm test:smoke && pnpm test:e2e && pnpm test:phase1 && pnpm test:phase2 && pnpm test:phase3 && pnpm test:phase4 && pnpm test:phase4-advanced && pnpm test:phase5 && pnpm test:phase6 && pnpm test:phase7 && pnpm test:phase8 && pnpm test:phase9
```

All 14 suites must pass with exit code 0.
