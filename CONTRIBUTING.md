# Contributing to AetherTrace

First off, thank you for considering contributing to **AetherTrace** ("Wireshark for AI Agents")! ⚡

AetherTrace is an open-source, local-first visual debugger, reverse proxy, and time-travel replay engine designed to demystify complex, multi-agent AI architectures.

---

## Architecture Overview

AetherTrace is built as a high-performance TypeScript monorepo powered by Turborepo and `pnpm`:

```text
aethertrace/
├── packages/
│   ├── core-schema/         # Drizzle ORM schema for SQLite (trace_runs, trace_spans), WAL mode & SHA-256 canonical hashing
│   ├── pricing-engine/      # Zero-dependency real-time token cost computation (OpenAI, Anthropic, Ollama/local)
│   ├── sdk-ts/              # Zero-dependency Node.js SDK with AsyncLocalStorage context propagation
│   ├── sdk-python/          # Python 3.10+ SDK with contextvars header injection
│   └── cli/                 # The `aethertrace` binary (start, sim, export, import)
├── apps/
│   ├── proxy-server/        # Hono high-speed reverse proxy on port 4000 (streaming SSE, circuit breakers, cache, WebSockets)
│   └── flight-deck/         # Next.js 15 UI on port 3000 (@xyflow/react DAG visualizer, time-travel fork IDE)
└── examples/
    ├── smoke-test.ts        # Phase 1 integration verification
    ├── multi-agent-sim.ts   # Phase 2 5-agent DAG simulation with circuit breaker trip
    └── sdk-export-test.ts   # Phase 3 automated context propagation & .trace export/import test
```

### Core Design Philosophy
1. **100% Local-First:** No cloud databases, no telemetry sent to third parties. Single `.trace.sqlite` file in WAL mode.
2. **Deterministic & Inspectable:** Every LLM call receives a canonical SHA-256 hash `(model + messages + tools)`.
3. **Zero Overhead:** SDKs rely on native language context primitives (`AsyncLocalStorage` in Node, `contextvars` in Python) without monkey-patching frameworks.
4. **Portable Bundles:** Any execution session can be exported to a `.trace.json` file (the AI equivalent of a `.pcap` capture) and shared for reproducible bug reports.

---

## Development Setup

### Prerequisites
- **Node.js:** v20.x or v22.x
- **pnpm:** v9.x (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Python:** 3.10+ (optional, only if working on `packages/sdk-python`)

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/ZLouada/AetherTrace.git
   cd aethertrace
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Type-check the monorepo:
   ```bash
   pnpm check-types
   ```

4. Build all packages:
   ```bash
   pnpm build
   ```

5. Run test suites:
   ```bash
   pnpm test:smoke   # Tests proxy interceptor, SSE streaming, circuit breaker, & replay cache
   pnpm test:e2e     # Tests TS SDK context propagation, .trace export, & SQLite import
   # Run full regression suite:
   pnpm test:phase1 && pnpm test:phase2 && pnpm test:phase3 && pnpm test:phase4 && pnpm test:phase5 && pnpm test:phase6 && pnpm test:phase7 && pnpm test:phase8 && pnpm test:phase9
   ```

6. Start local development environment:
   ```bash
   pnpm dev
   ```
   - Proxy Server: `http://localhost:4000`
   - WebSocket Bus: `ws://localhost:4000/ws`
   - Flight Deck UI: `http://localhost:3000`

---

## Detailed Contributor Guides

For deeper guides, please consult the dedicated documentation:
- 📖 [Local Development Guide](docs/contributing/development.md)
- 🧪 [Testing & QA Guide](docs/contributing/testing.md)
- 🏛️ [Contributor Architecture Guide](docs/contributing/architecture.md)
- 🤝 [Code of Conduct](CODE_OF_CONDUCT.md)
- 🛡️ [Security Policy](SECURITY.md)

---

## Coding Guidelines

- **TypeScript:** Strict mode is mandatory (`"strict": true`). Avoid `any` where a typed schema or generic is feasible.
- **Drizzle & SQLite:** Keep database transactions atomic. Always enable WAL mode (`PRAGMA journal_mode = WAL;`) for concurrent read/write throughput.
- **Styling:** Flight Deck uses Tailwind CSS with the centralized design system in `src/design-system/` (black/grey palette, crisp 1px borders, monospace metrics, accessible focus states, and reduced-motion compliance).
- **Zero Cloud Dependencies:** Do not introduce cloud-only drivers (e.g. Supabase, DynamoDB, Pinecone) into core packages. Everything must run offline on a laptop.
- **Security by Default:** Never bypass the secret redaction pipeline, zero-eval sandbox, or SSRF shield.

---

## Pull Request Process

1. Create a feature branch:
   ```bash
   git checkout -b feat/my-awesome-feature
   ```
2. Verify all gates locally:
   ```bash
   pnpm check-types && pnpm build && pnpm test:smoke && pnpm test:e2e
   ```
3. Commit with conventional commit messages:
   ```bash
   git commit -m "feat(pricing-engine): add deepseek-r1 pricing models"
   ```
4. Push and open a Pull Request using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

