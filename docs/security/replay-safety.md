# AetherTrace — Replay Safety & Financial Guardrails (Phase 7)

## The Replay Dilemma in Agent Debugging

Replaying an AI agent trace is essential for root-cause analysis, regression testing, and prompt engineering. However, re-executing recorded agent steps introduces two primary hazards:
1. **Unintended External Side Effects:** Running tools that mutate real-world state (e.g. executing SQL `DROP TABLE`, writing files, deploying cloud resources, sending emails or Slack alerts).
2. **Uncontrolled Cost Escalation:** Inadvertently re-invoking expensive frontier models (e.g., Claude 3.5 Sonnet, GPT-4o) over thousands of spans, triggering surprise API bills.

AetherTrace enforces rigorous safety policies to ensure replaying a trace never causes unintended real-world damage or accidental expenditure.

---

## 1. Tool Safety Classification

Every tool invocation encountered during replay is categorized into one of four safety classifications (`classifyTool` in `packages/core-schema/src/security/replay-policy.ts`):

```typescript
export type ToolSafetyClassification = 'pure' | 'read_only' | 'mutating' | 'unknown';
```

### Classification Heuristics:
1. **Pure Tools (`pure`):**
   - Deterministic calculations, string manipulation, schema validators, local mathematical operations.
   - Examples: `calculate_tax`, `json_formatter`, `format_currency`.
   - Replay behavior: Safe to execute locally.
2. **Read-Only Tools (`read_only`):**
   - Queries, search tools, database lookups, read requests.
   - Heuristics: Starts with `get_`, `read_`, `fetch_`, `search_`, `query_`, `list_`, `check_`.
   - Examples: `get_weather`, `search_knowledge_base`, `fetch_user_profile`.
   - Replay behavior: Permitted in `safe_replay` when network reading is allowed, or served from cache.
3. **Mutating Tools (`mutating`):**
   - Side-effect operations that write, modify, delete, send, or trigger external state.
   - Heuristics: Contains `write`, `delete`, `drop`, `remove`, `update`, `insert`, `post`, `send`, `execute`, `run`, `deploy`, `create`, `publish`, `pay`.
   - Examples: `send_email`, `delete_record`, `deploy_service`, `charge_customer`.
   - Replay behavior: **Blocked** from live execution unless explicitly mocked or overridden.
4. **Unknown Tools (`unknown`):**
   - Custom or ambiguously named tools that cannot be verified as pure or read-only.
   - Replay behavior: Treated conservatively as potentially mutating.

---

## 2. Replay Safety Modes

When triggering replay from a span or run (`POST /api/spans/:id/replay` or `POST /api/runs/:id/replay`), developers choose one of three modes:

| Mode | LLM Calls | Tool Execution | External Network | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `cache_only` (Default) | Served from cache | Served from cache | Blocked (Zero egress) | Offline inspection, DAG verification |
| `safe_replay` | Mock or cached | Read-only permitted; Mutating mocked | Read-only only | Prompt iteration, logic regression tests |
| `live_replay` | Upstream API | As configured by policy | Allowed | True end-to-end replay, model comparison |

### Decision Logic:
```
                      Tool Call Encountered in Replay
                                    │
                                    ▼
                          Is mode == 'cache_only'?
                                    │
                         ┌──────────┴──────────┐
                        YES                    NO
                         │                     │
                         ▼                     ▼
                  [Return Cached]     Is tool classified as 'mutating'?
                                               │
                                      ┌────────┴────────┐
                                     YES                NO
                                      │                 │
                                      ▼                 ▼
                          Is mode == 'live_replay'?  [Execute Tool]
                                      │
                             ┌────────┴────────┐
                            YES                NO
                             │                 │
                             ▼                 ▼
                    [Require Override]  [Return Cached/Mock]
```

---

## 3. Financial Guardrails & Spend Confirmation Gate

Live model execution can be costly. AetherTrace prevents accidental spend with a pre-flight cost confirmation gate:

### 1. Cost Estimation (`estimateReplayCost`):
Before initiating live calls, AetherTrace calculates the projected expenditure across all replayed spans:
- Traverses child spans in the replay subtree.
- Extracts token counts (`prompt_tokens`, `completion_tokens`).
- Computes estimated cost using `@aethertrace/pricing-engine` rates for the model ID.
- Marks `is_high_spend: true` if estimated cost exceeds **\$1.00 USD**.

### 2. Live Replay Confirmation Requirement:
Any request to execute a live replay (`mode: 'live_replay'` or `live: true`) MUST provide:
```json
{
  "mode": "live_replay",
  "confirm_live": true
}
```

If `confirm_live` is missing or false:
- The server responds with **HTTP 400 Bad Request**.
- The response returns the detailed cost projection:
  ```json
  {
    "error": "Live replay requires explicit confirmation (confirm_live: true)",
    "estimated_cost_usd": 2.375,
    "warning": "Live replay will incur upstream API charges.",
    "is_high_spend": true
  }
  ```
- No upstream tokens are spent, and a security audit entry is logged.
