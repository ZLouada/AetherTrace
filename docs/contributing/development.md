# Local Development Guide

Welcome! AetherTrace is an open-source monorepo managed with **Turborepo** and **pnpm workspaces**.

---

## 1. Setting Up Your Environment

### Prerequisites
- **Node.js:** `>= 20.0.0` (Recommended: Node 22)
- **pnpm:** `9.15.4` (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Python:** `>= 3.9` (if developing the Python SDK)

### Quick Setup

```bash
# 1. Clone repository
git clone https://github.com/aethertrace/aethertrace.git
cd aethertrace

# 2. Install dependencies
pnpm install

# 3. Typecheck across all workspace packages
pnpm check-types

# 4. Build all packages and applications
pnpm build

# 5. Start development servers
pnpm dev
```

---

## 2. Monorepo Package Topology

```text
aethertrace/
├── apps/
│   ├── flight-deck/     # Next.js 15 UI with React Flow visualizer
│   └── proxy-server/    # Hono + WebSocket high-speed interceptor proxy
├── packages/
│   ├── cli/             # aethertrace command-line interface
│   ├── core-schema/     # SQLite WAL schema, Drizzle ORM, diffing, security
│   ├── pricing-engine/  # Token cost calculation engine
│   ├── sdk-ts/          # Node.js AsyncLocalStorage SDK (@aethertrace/sdk)
│   └── sdk-python/      # Python contextvars SDK (aethertrace)
├── examples/            # Quickstarts and phase regression suites
└── docs/                # Architecture, guides, and specifications
```

---

## 3. Useful Development Commands

| Command | Description |
|---|---|
| `pnpm check-types` | Run TypeScript compiler in `--noEmit` mode across all 6 packages. |
| `pnpm build` | Compile all packages and Next.js applications via Turborepo. |
| `pnpm test:smoke` | Execute smoke test verifying proxy, WAL, replay cache, and breakers. |
| `pnpm dev` | Run proxy and Flight Deck in watch mode for development. |
| `pnpm clean` | Remove `.turbo`, cache, and build outputs. |
