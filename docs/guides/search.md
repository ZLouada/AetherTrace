# Search & Developer UX Guide

AetherTrace provides a local inverted search engine powered by **SQLite FTS5** and an AST-based query parser with zero reliance on `eval()`.

Developers can press <kbd>⌘K</kbd> (or <kbd>Ctrl+K</kbd>) to instantly locate runs, spans, tools, models, and errors across months of execution history.

---

## 1. Query Syntax

The query parser supports free text, quoted tokens, field predicates, numeric comparisons, durations, dates, and negation:

### Structured Field Filters

| Syntax | Example | Description |
|---|---|---|
| `agent:<name>` | `agent:Coder` | Filter by agent name |
| `model:<name>` | `model:gpt-4o` | Filter by model identifier |
| `tool:<name>` | `tool:postgres_query` | Filter by tool call |
| `status:<status>` | `status:error` | Filter by status (`running`, `completed`, `error`, `paused`) |
| `cost:><amount>` | `cost:>0.05` | Filter by cost threshold in USD |
| `duration:><time>` | `duration:>2s` | Filter by latency (`500ms`, `2s`, `1m`) |
| `branch:<name>` | `branch:main` | Filter by Git branch |
| `commit:<sha>` | `commit:3ca640e` | Filter by Git commit SHA |
| `-<filter>` | `-status:completed` | Negate predicate |
| `"<phrase>"` | `"rate limit exceeded"` | Exact phrase matching |

### Example Queries

```text
status:error agent:Researcher
cost:>0.10 model:gpt-4o
tool:web_search duration:>3s
branch:main -status:completed
"connection refused" status:error
```

---

## 2. Deterministic Ranking Model

Search results are ranked deterministically according to this hierarchy:

1. **Exact ID Match (Score: 100):** Direct lookup by run or span ID.
2. **Exact Name Match (Score: 80):** Full name match on run or agent.
3. **Prefix Match (Score: 60):** Starts with query term.
4. **FTS5 Full-Text Match (Score: 40):** BM25 relevance score over request and response text.
5. **Recency Tie-Breaker:** Sorted by timestamp descending.

---

## 3. CLI Search & Error Discovery

Search execution history from the terminal:

```bash
# Global search
aethertrace search "status:error agent:Coder"

# Rebuild search index projections
aethertrace search rebuild

# Aggregate common error patterns across all runs
aethertrace errors --limit 10
```
