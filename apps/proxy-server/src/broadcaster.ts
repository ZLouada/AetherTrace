import type { WebSocket } from 'ws';
import type { WebSocketEvent } from '@aethertrace/core-schema';

const clients = new Set<WebSocket>();

export function registerClient(ws: WebSocket): void {
  clients.add(ws);
}

export function unregisterClient(ws: WebSocket): void {
  clients.delete(ws);
}

export function getClientCount(): number {
  return clients.size;
}

/**
 * Broadcasts a typed WebSocket event to all connected clients.
 */
export function broadcastEvent<T = any>(event: WebSocketEvent<T>): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    try {
      if (client.readyState === 1 /* OPEN */) {
        client.send(payload);
      }
    } catch (err) {
      console.error('[Broadcaster] Failed to deliver event to client:', err);
    }
  }
}
