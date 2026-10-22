# CI Regression Gates Guide

AetherTrace turns agent execution traces into **reproducible regression test fixtures** (`.trace.json`) that can be asserted in CI pipelines to prevent token inflation, latency regressions, and circuit-breaker trips.

---

## 1. Exporting a Golden Trace

Once you have verified a successful run in Flight Deck, export it as a self-contained `.trace.json` bundle:

```bash
# Via CLI:
npx aethertrace export <run_id> -o golden-triage.trace.json
```
*(Or click **Export .trace** directly in the Flight Deck header).*

The resulting `.trace.json` contains:
- Complete run and span metadata
- Git commit SHA and working tree status
- Dependency lockfile fingerprint
- Sanitized payloads (secrets redacted)

---

## 2. Running CI Assertions (`aethertrace assert`)

In your CI pipeline (GitHub Actions, GitLab CI, CircleCI), execute:

```bash
npx aethertrace assert golden-triage.trace.json \
  --max-cost 0.02 \
  --max-latency 5000
```

### Passing Output (Exit Code 0)
```text
========================================================================
  🎯 AetherTrace CI Regression Gate
========================================================================
  Trace File:    golden-triage.trace.json
  Run Name:      Incident-Triage-Run-1234
  ● Status:        completed ✔
  ● Total Spend:   $0.003420 (Max allowed: $0.020000) ✔
  ● Total Latency: 1240ms (Max SLA: 5000ms) ✔

  ✨ REGRESSION ASSERTION PASSED (Exit Code: 0)
========================================================================
```

### Failing Output (Exit Code 1)
If an agent regresses and exceeds the budget ceiling or trips a circuit breaker:
```text
========================================================================
  🎯 AetherTrace CI Regression Gate
========================================================================
  Trace File:    golden-triage.trace.json
  Run Name:      Incident-Triage-Run-1234
  ● Status:        completed ✔
  ● Total Spend:   $0.024100 (Max allowed: $0.020000) ✖
  ● Total Latency: 1240ms

  ✖ REGRESSION ASSERTION FAILED (Exit Code: 1):
    • Total cost $0.024100 exceeds budget limit of $0.020000
========================================================================
```

---

## 3. GitHub Actions Integration Example

```yaml
name: Agent Regression Suite

on: [push, pull_request]

jobs:
  agent-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run Agent & Assert SLA
        run: |
          pnpm install
          npx aethertrace assert fixtures/golden-run.trace.json --max-cost 0.05
```
