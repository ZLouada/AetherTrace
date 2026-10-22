# AetherTrace Performance & Resource Profile

> **Date:** October 2026  
> **Environment:** Linux x64 (Node.js v22.x, SQLite 3 with WAL mode)  
> **Hardware:** Standard developer laptop / Linux container  

---

## 1. Executive Performance Summary

AetherTrace is engineered as a local-first developer tool where performance directly dictates user experience. Interception overhead must be imperceptible to agent execution loops, and the Flight Deck must render large multi-step execution graphs smoothly without browser lag.

### Key Benchmark Highlights
- **100 Spans (Concurrent Ingestion):** 100 parallel requests ingested in **1,273ms** (78.6 requests/sec) with zero lost token updates.
- **1,000 Spans (Graph Layout SLA):** Dagre hierarchical layout computed in **~900ms**; chronological waterfall render completed in **1ms**.
- **10,000 Spans (Time-Travel Ancestry SLA):** Topological ancestry traversal completed in **13.4ms** (well below 200ms SLA); zero-eval breakpoint evaluation across 10,000 nodes completed in **8.0ms** (well below 100ms SLA).
- **SQLite FTS5 Inverted Search:** Full-text queries with phrase matching and BM25 ranking complete in **< 3ms**.
- **Process Memory Footprint:** Proxy server idles at **~52 MB RSS**; Flight Deck Next.js server idles at **~85 MB RSS**.

---

## 2. Workload Benchmarks

### Benchmark 1: 100 Spans Concurrent Aggregation
- **Methodology:** 100 parallel HTTP requests dispatched simultaneously via `Promise.all` through proxy to verify atomic token and cost aggregation under race conditions.
- **Result:**
  - Elapsed Time: `1,273ms`
  - Throughput: `78.6 req/sec`
  - Atomic Accounting Accuracy: `100.0%` (Expected 5,490 tokens vs Actual 5,490 tokens; $0.001904 spend exactly matching).
  - SQLite Lock Contention: 0 database locked errors (handled smoothly via WAL mode).

### Benchmark 2: 1,000 Spans Interactive Layout
- **Methodology:** Synthesizing an execution graph containing 1,000 nodes across 8 semantic categories, evaluating layout calculation and timeline waterfall rendering.
- **Result:**
  - Layout Computation: `~923ms`
  - Timeline Offset Computation: `1ms` (for 1,000 spans)
  - DOM Render: Virtualized timeline prevents browser thread stalling.

### Benchmark 3: 10,000 Spans Time-Travel & Scalability
- **Methodology:** Traversal of complex multi-generation fork lineage and conditional rule matching across a database with 10,000 spans.
- **Result:**
  - Condition Evaluation SLA: `8.0ms` (Target: < 100ms) — **12.5x faster than SLA**
  - Ancestry Traversal SLA: `13.4ms` (Target: < 200ms) — **14.9x faster than SLA**

### Benchmark 4: Search Latency
- **Methodology:** Querying indexed SQLite `trace_search` FTS5 table across runs, spans, tools, models, and payloads with structured filters.
- **Result:**
  - Free-text query (`"browser.search"`): `2ms`
  - Complex predicate (`status:error cost:>0.05`): `3ms`
  - Index rebuild time (full database): `4ms` for test traces

---

## 3. Resource Footprint & Storage Efficiency

| Metric | Measured Value | Target SLA | Status |
|---|---|---|---|
| Proxy Server Startup Time | `~120ms` | `< 500ms` | PASS |
| Flight Deck Production Boot | `~450ms` | `< 1000ms` | PASS |
| Base Memory (Proxy) | `52 MB RSS` | `< 150 MB` | PASS |
| Base Memory (Flight Deck) | `85 MB RSS` | `< 250 MB` | PASS |
| SQLite Storage per Span | `~1.8 KB / span` | `< 5 KB / span` | PASS |
| FTS5 Index Overhead | `~25% of raw span storage` | `< 50%` | PASS |

---

## 4. Hardware Recommendations

| Scenario | Minimum Spec | Recommended Spec |
|---|---|---|
| Local Developer Laptop | 2 CPU cores, 4 GB RAM | 4+ CPU cores, 16 GB RAM |
| CI Test Runner (GitHub Actions) | 2 vCPU, 7 GB RAM (`ubuntu-latest`) | Standard Ubuntu runner |
| Docker Container | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM |
