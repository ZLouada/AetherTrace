# Installation Guide

AetherTrace is **100% Free & Open Source (MIT)** and runs locally with zero external database or cloud service dependencies.

---

## 1. System Prerequisites

Before installing AetherTrace, verify your environment meets these requirements:

| Component | Required Version | Recommended | Notes |
|---|---|---|---|
| **Node.js** | `>= 20.0.0` | `22.x LTS` | Tested on Node 22 (`x64`, `arm64`) |
| **Package Manager** | `pnpm >= 9.0.0` | `9.15.4` | Turborepo workspace uses pnpm |
| **Python** *(Optional)* | `>= 3.9` | `3.11+` | Only needed if using Python SDK (`aethertrace`) |
| **Docker** *(Optional)* | `>= 24.0` | Latest | Only needed for container deployment |
| **OS** | Linux, macOS, WSL2 | Any POSIX | Full compatibility across Unix environments |

---

## 2. Installation from Source (Recommended)

```bash
# 1. Clone the official repository
git clone https://github.com/aethertrace/aethertrace.git
cd aethertrace

# 2. Install workspace dependencies
pnpm install

# 3. Build all packages and applications
pnpm build

# 4. Start the workstation (Proxy on 4000 + Flight Deck UI on 3000)
pnpm start
```

Once running:
- **Flight Deck UI:** [http://localhost:3000](http://localhost:3000)
- **Interceptor Proxy:** [http://localhost:4000](http://localhost:4000)
- **Health Check:** `curl http://localhost:4000/health`

---

## 3. Running with npx / pnpm dlx (CLI Only)

If you only need the interceptor proxy and CLI workstation:

```bash
npx @aethertrace/cli start
# or:
pnpm dlx @aethertrace/cli start
```

---

## 4. Running with Docker Compose

For completely containerized zero-setup execution:

```bash
docker compose up -d
```

See [Docker Deployment Guide](../deployment/docker.md) for volume persistence and networking options.
