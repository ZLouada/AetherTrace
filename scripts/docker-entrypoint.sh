#!/bin/sh
set -e

# Forward signals to child processes
proxy_pid=0
flight_deck_pid=0

cleanup() {
  echo "[AetherTrace Docker] Caught termination signal, stopping services gracefully..."
  if [ "$proxy_pid" -ne 0 ]; then
    kill -TERM "$proxy_pid" 2>/dev/null || true
  fi
  if [ "$flight_deck_pid" -ne 0 ]; then
    kill -TERM "$flight_deck_pid" 2>/dev/null || true
  fi
  wait "$proxy_pid" 2>/dev/null || true
  wait "$flight_deck_pid" 2>/dev/null || true
  echo "[AetherTrace Docker] Shutdown complete."
  exit 0
}

trap cleanup SIGTERM SIGINT INT TERM

# Ensure database directory exists
mkdir -p "$(dirname "${AETHERTRACE_DB_PATH:-/data/.trace.sqlite}")"

echo "[AetherTrace Docker] Launching Interceptor Proxy on port ${PORT:-4000}..."
node apps/proxy-server/dist/index.js &
proxy_pid=$!

echo "[AetherTrace Docker] Launching Flight Deck UI on port ${UI_PORT:-3000}..."
(cd apps/flight-deck && npx next start -p "${UI_PORT:-3000}") &
flight_deck_pid=$!

# Keep container alive and handle signals
wait
