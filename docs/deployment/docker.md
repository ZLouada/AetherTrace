# Docker & Container Deployment Guide

AetherTrace can be built and run in a single container providing both the **Interceptor Proxy (`:4000`)** and the **Flight Deck UI (`:3000`)**.

---

## 1. Quickstart with Docker Compose

The fastest way to run AetherTrace in Docker is using `compose.yaml`:

```bash
# Launch AetherTrace with volume persistence
docker compose up -d

# Check service health
docker compose ps

# View container logs
docker compose logs -f
```

Once running:
- **Flight Deck UI:** [http://localhost:3000](http://localhost:3000)
- **Interceptor Proxy:** [http://localhost:4000](http://localhost:4000)
- **Health Endpoint:** [http://localhost:4000/health](http://localhost:4000/health)
- **System Diagnostics:** [http://localhost:4000/api/system/status](http://localhost:4000/api/system/status)

To stop the container gracefully:
```bash
docker compose down
```

---

## 2. Standalone Docker Build & Run

### 2.1. Build Image

```bash
docker build -t aethertrace:latest .
```

### 2.2. Run Container with Volume Persistence

```bash
docker run -d \
  --name aethertrace \
  -p 3000:3000 \
  -p 4000:4000 \
  -v $(pwd)/aethertrace-data:/data \
  -e AETHERTRACE_MOCK=false \
  aethertrace:latest
```

---

## 3. Configuration & Ports

| Port | Protocol | Purpose |
|---|---|---|
| `3000` | HTTP | Flight Deck Visualizer (Next.js) |
| `4000` | HTTP / WS | Interceptor Proxy (`/v1/chat/completions`) & WebSocket Telemetry (`/ws`) |

### Persistent Volume (`/data`)
The container stores the SQLite trace database and WAL journal at `/data/.trace.sqlite`. Mounting a host directory or named volume to `/data` ensures all runs, spans, and cached replays survive container restarts and updates.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Proxy server listen port |
| `UI_PORT` | `3000` | Flight Deck listen port |
| `AETHERTRACE_DB_PATH` | `/data/.trace.sqlite` | SQLite database file location |
| `AETHERTRACE_MOCK` | `false` | Enable $0.00 mock bypass simulation mode |
| `OPENAI_API_KEY` | *(empty)* | Optional default API key for upstream forwarding |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Upstream provider URL |
| `AETHERTRACE_AUTH_TOKEN` | *(empty)* | Require bearer token authentication |
| `AETHERTRACE_ALLOW_PRIVATE_NETWORK` | `false` | Allow targeting private IP subnets in SSRF shield |

---

## 4. Health Checks & Diagnostics

The container includes an automated Docker `HEALTHCHECK` running every 15 seconds:

```bash
curl -f http://localhost:4000/health
```

Expected output:
```json
{
  "status": "ok",
  "service": "aethertrace-proxy-server",
  "port": 4000,
  "wsClients": 1,
  "uptime": 120,
  "timestamp": 1792633000000
}
```

Detailed memory, database, and process diagnostics:
```bash
curl http://localhost:4000/api/system/status
```

---

## 5. Graceful Shutdown

The container uses `scripts/docker-entrypoint.sh` which traps `SIGTERM` and `SIGINT` signals, ensuring that:
1. Active HTTP sockets complete or close cleanly.
2. SQLite WAL transactions are checkpointed.
3. Node and Next.js child processes terminate cleanly without database corruption.
