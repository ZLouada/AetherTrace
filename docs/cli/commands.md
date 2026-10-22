# CLI Command Reference

The AetherTrace CLI (`aethertrace`) provides local workstation management, trace inspection, diffing, and CI regression testing.

---

## Command Overview

```text
aethertrace <command> [options]
```

| Command | Arguments | Description |
|---|---|---|
| `start` | `[-p <port>]` | Launch local interceptor proxy server and WebSocket bus (default: port 4000). |
| `sim` | — | Execute a 5-step autonomous multi-agent simulation with live output. |
| `inspect` | `<run_id>` | Display comprehensive execution metadata, Git provenance, and lineage. |
| `provenance` | `<run_id> [--json]` | Print machine/human-readable execution environment and dependency fingerprints. |
| `compare` | `<run_a> <run_b>` | Compare provenance scorecards and Git head between two runs. |
| `reproduce` | `<run_id>` | Assess reproducibility requirements of a target run against current local tree. |
| `diff` | `<base_id> <target_id>` | Render side-by-side ASCII diff matrix with spend and latency scorecards. |
| `assert` | `<trace.json> [flags]` | CI regression gate verifying budget ceilings, latency SLAs, and zero circuit-breaker trips. |
| `export` | `<run_id> [-o <file>]` | Export run to portable `.trace.json` bundle. |
| `import` | `<file.json>` | Import `.trace.json` bundle into local SQLite database. |
| `search` | `"<query>" [--limit <n>]` | Full-text and structured predicate search across traces. |
| `search rebuild` | — | Rebuild local SQLite FTS5 search index from trace database. |
| `errors` | `[--limit <n>] [--json]` | Discover and aggregate common error signatures across execution history. |
| `version` | `-v, --version` | Display installed AetherTrace version. |
| `help` | `-h, --help` | Display CLI help menu. |

---

## Global Options

- `-d, --db <path>`: Path to SQLite trace database (default: auto-detected or `.trace.sqlite`).
- `-p, --port <number>`: Port to listen on (default: 4000).
- `-o, --output <file>`: Destination filepath for trace exports.
- `--max-cost <usd>`: Cost ceiling for CI regression assertions (e.g. `0.05`).
- `--max-latency <ms>`: Maximum duration SLA for CI regression assertions (e.g. `2000`).
- `--json`: Output raw JSON for machine ingestion and scripts.
