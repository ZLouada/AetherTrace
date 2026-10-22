# AetherTrace — Search & Developer UX Architecture (Phase 8)

> **Document Type:** Architectural Specification & UX Baseline  
> **Status:** Active / Phase 8 Implementation  
> **Target:** `⌘K → search anything → jump directly to the exact execution state that matters.`

---

## 1. UX Audit & Current State Baseline

### 1.1. Current Navigation Capabilities
Prior to Phase 8, AetherTrace possessed rich telemetry, live interception, replay, and reproducibility capabilities, but navigation was largely localized:
- **Run Discovery:** Developers browsed runs sequentially in the `RunSidebar`, filtered only by basic text match (`run.name` or `run.id`) and a static status dropdown (`all`, `running`, `completed`, `failed`, `breaker_tripped`, `replay`, `fork`).
- **Span Discovery:** Spans were visible only inside the active run via the React Flow DAG canvas or the Timeline waterfall.
- **Command Palette (`⌘K`):** Supported switching between locally loaded runs, jumping between spans of the currently active run, or triggering static UI modal actions (`action-pause`, `action-timeline`, `action-breakpoints`, `action-diff`, `action-chaos`, `action-export`).
- **Error Discovery:** Errors could only be identified by visually scanning the DAG for red nodes or filtering runs marked as `failed` / `breaker_tripped`.
- **Cross-Run Querying:** There was no mechanism to search across all runs in the database for a specific prompt, tool invocation, model ID, HTTP endpoint, or error message without manual inspection.

### 1.2. Identified Limitations & Developer Pain Points
1. **Scale Saturation:** As developers accumulate hundreds of runs and tens of thousands of spans, in-memory client-side filtering becomes impractical and sluggish.
2. **Siloed Execution Graphs:** A developer who remembers an error message (`HTTP 429 Rate limit exceeded`) had no direct path to find which run or span produced it.
3. **No Structured Query Language:** Filtering runs by cost thresholds (e.g. `cost:>0.10`), execution duration (`duration:>5s`), agent names (`agent:research`), or Git provenance (`branch:feature/replay`, `commit:a91f23`) was not possible.
4. **Disjointed Workflow:** Moving from an error to its causal chain, then to replay, fork, and diff required multiple manual navigation steps across disparate UI panels.

---

## 2. Phase 8 Architecture Overview

Phase 8 introduces a **Global Search & Developer UX Engine** embedded directly into the local SQLite database and accessible via API, Flight Deck Command Palette (`⌘K`), and CLI.

```
                              DEVELOPER INTERACTION
                      [ ⌘K Command Palette / CLI / API ]
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Deterministic Query Parser │ ◄── Zero-eval AST parser
                      │   (field:value, cost:>, etc.) │     (No eval / Function)
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │      Search Query Planner     │
                      └───────┬───────────────┬───────┘
                              │               │
                              ▼               ▼
                 ┌────────────────────┐ ┌────────────────────┐
                 │  FTS5 Text Index   │ │ Structured Columns │
                 │  (Full-text match) │ │  (Indexed B-Tree)  │
                 └────────────┬───────┘ └─────────────┬──────┘
                              │                       │
                              └───────────┬───────────┘
                                          ▼
                      ┌───────────────────────────────┐
                      │   Deterministic Ranker & DTO  │
                      │  (Exact > Prefix > FTS > Time)│
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   Direct Graph Deep-Linking   │
                      │   (Run → Span → DAG → Drawer) │
                      └───────────────────────────────┘
```

---

## 3. Core Architecture Subsystems

### 3.1. Zero-Eval Deterministic Query Language
The query parser (`packages/core-schema/src/search/parser.ts`) parses user queries into an Abstract Syntax Tree (AST) without evaluating JavaScript:
- **Free-text terms:** e.g., `timeout`, `"payment failed"`.
- **Entity & Status Filters:** `status:error`, `status:completed`, `event:tool`, `event:llm`, `event:http`.
- **Identifier & Component Filters:** `agent:research`, `model:gpt-4o`, `tool:web_search`, `run:run_8f21`, `span:span_3a`.
- **Numeric & Range Operators:** `cost:>0.10`, `cost:<=1.0`, `duration:>5000` (or `duration:>5s`), `tokens:>1000`.
- **Provenance Filters:** `branch:main`, `commit:3ca640e`, `platform:linux-x64`.
- **Time Operators:** `before:2026-10-01`, `after:2026-01-01`.
- **Negation:** `-status:completed` or `-not status:completed`.

### 3.2. SQLite FTS5 Full-Text Index & Projection Table
To ensure lightning-fast local search without external dependencies (Elasticsearch/Meilisearch):
- **Virtual Table:** `trace_search` powered by SQLite `fts5(title, content, tokenize='unicode61')`.
- **Projection Strategy:** Only searchable projections are indexed (`entity_type`, `entity_id`, `run_id`, `span_id`, `title`, `content`, `metadata`, `timestamp`).
- **Security Redaction Guarantee:** Content is processed through Phase 7 redaction (`redactValue`) before insertion into the search index. Secrets, API keys, and authorization headers are never indexed.

### 3.3. Reversible Index Maintenance
- **Incremental Sync:** Every ingested, imported, replayed, or forked span updates the search projection transactionally.
- **Authoritative Source of Truth:** `trace_runs` and `trace_spans` remain the sole source of truth. The search index can be completely rebuilt on demand via `aethertrace search rebuild` or `POST /api/search/rebuild`.

### 3.4. Deterministic Ranking
Search results are scored and sorted according to an explainable ranking model:
1. **Exact ID Match:** Score `100` (Matches exact run or span ID).
2. **Exact Name Match:** Score `80` (Matches exact tool name, agent name, or model).
3. **Prefix Match:** Score `60` (Prefix of run name or span title).
4. **Full-Text Match:** Score `40` (FTS5 BM25 relevance or token match).
5. **Recency Tie-Breaker:** Sorted by timestamp descending.

### 3.5. Flight Deck Navigation & Deep-Linking
Selecting any search result inside `⌘K`:
1. Switches the active workspace to the matching `runId`.
2. Loads all spans and highlights the target `spanId` on the React Flow DAG canvas.
3. Automatically scrolls the execution Timeline to the matching timestamp.
4. Opens the `InspectorDrawer` focused on the target span with full causal context.

---

## 4. Performance & Scalability Targets

| Metric | Target | Design Strategy |
| :--- | :--- | :--- |
| **Simple Text Search** | `< 10ms` (10k spans) | FTS5 unicode61 inverted index |
| **Structured SQL Predicate** | `< 5ms` (100k spans) | B-tree indexes on `run_id`, `created_at`, `status` |
| **Combined Query** | `< 15ms` | Hybrid SQL join with parameterized bindings |
| **Ingestion Overhead** | `< 1ms` per span | Single-row projection insert during span commit |
| **Index Size** | `< 25%` of DB size | Compact projection of titles and tokenized content |

---

## 5. Security & Safety Guarantees

1. **Zero-Eval:** No user query string is passed to `eval()` or `Function()`.
2. **SQL Injection Defense:** All queries compile into parameterized SQLite statements with `?` placeholders.
3. **Redaction Preservation:** Search operates strictly on redacted data. If an upstream span contained a secret that was scrubbed as `[REDACTED: OpenAI API Key]`, search will never index or disclose the original plaintext secret.
4. **Bounded Results:** Default limit of 50, maximum limit of 200, protecting memory against large trace dumps.
