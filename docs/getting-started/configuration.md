# Configuration & Environment Variables

AetherTrace is designed with zero-configuration defaults. For production, Docker, or advanced team environments, behavior can be customized via environment variables or HTTP headers.

---

## 1. Environment Variables (`.env`)

Copy `.env.example` to `.env` to override defaults:

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | number | `4000` | Port for the Interceptor Proxy server. |
| `AETHERTRACE_DB_PATH` | string | `.trace.sqlite` | SQLite database file destination. |
| `OPENAI_API_KEY` | string | `""` | Default upstream OpenAI key if not provided by client. |
| `OPENAI_BASE_URL` | string | `https://api.openai.com/v1` | Upstream provider URL (e.g. `http://localhost:11434/v1` for Ollama). |
| `AETHERTRACE_MOCK` | boolean | `false` | When `true`, returns simulated mock completions at $0.00 spend. |
| `AETHERTRACE_AUTH_TOKEN` | string | `""` | Optional bearer token protecting local API endpoints. |
| `AETHERTRACE_ALLOWED_ORIGINS` | string | `""` | Additional CORS origins separated by commas. |
| `AETHERTRACE_ALLOW_PRIVATE_NETWORK` | boolean | `false` | Security guardrail: set `true` to allow SSRF target calls to private/loopback subnets. |
| `NEXT_PUBLIC_API_URL` | string | `http://localhost:4000` | Browser URL for proxy REST API. |
| `NEXT_PUBLIC_WS_URL` | string | `ws://localhost:4000/ws` | Browser URL for telemetry WebSocket. |

---

## 2. Request Context Headers

Clients configure execution tracking dynamically per-request using HTTP headers:

| Header | Example | Description |
|---|---|---|
| `X-Run-Id` | `run_prod_incident_01` | Sets the parent run session ID. |
| `X-Run-Name` | `Checkout-Triager` | Human-readable name for the run in Flight Deck. |
| `X-Agent-Name` | `PlannerAgent` | Name of the active agent node in the execution graph. |
| `X-Parent-Span-Id` | `span_8f1a2b...` | Links this execution to an upstream parent node in the DAG. |
| `X-Max-Budget-USD` | `0.05` | Hard spending ceiling. Trips proxy circuit breaker if exceeded. |
| `X-Breakpoint` | `true` | Arms a live mid-flight breakpoint on this specific call. |
| `X-Chaos-Inject` | `429_rate_limit` | Injects synthetic chaos faults (`429`, `502`, `corrupted_json`, `latency_delay`). |
| `X-Replay-Mode` | `true` | Forces lookup in SQLite replay cache ($0.00 / 0ms on hit). |
| `X-Mock-Upstream` | `true` | Executes call against internal mock engine at $0.00 cost. |
