import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { proxyRouter } from './routes/proxy.js';
import { tracesRouter } from './routes/traces.js';
import { controlRouter } from './routes/control.js';
import { registerClient, unregisterClient, getClientCount, broadcastEvent } from './broadcaster.js';
import { getDatabase } from '@aethertrace/core-schema';

export const app = new Hono();

// Global Middlewares
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['*'],
  exposeHeaders: ['*']
}));

// Health & System Info
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'aethertrace-proxy-server',
    port: 4000,
    wsClients: getClientCount(),
    uptime: Math.round(process.uptime()),
    timestamp: Date.now()
  });
});

// Mount Routes
app.route('/', proxyRouter);
app.route('/api', tracesRouter);
app.route('/api', controlRouter);

// Global Error Handler
app.onError((err, c) => {
  console.error('[AetherTrace Server Error]:', err);
  return c.json({
    error: {
      message: err.message || 'Internal Server Error',
      name: err.name
    }
  }, 500);
});

export function startServer(port: number = Number(process.env.PORT) || 4000) {
  // Ensure DB initialized & schema migrated
  getDatabase();

  const server = serve({
    fetch: app.fetch,
    port
  }, (info) => {
    console.log(`\n======================================================`);
    console.log(`🚀 AetherTrace Interceptor Proxy running at http://localhost:${info.port}`);
    console.log(`📡 WebSocket Event Broadcaster listening on ws://localhost:${info.port}/ws`);
    console.log(`💾 SQLite Database connected (.trace.sqlite)`);
    console.log(`======================================================\n`);
  });

  // Attach WebSocket Server for real-time telemetry streaming
  const wss = new WebSocketServer({ server: server as any, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    registerClient(ws);

    // Send handshake acknowledge
    ws.send(JSON.stringify({
      type: 'connection:ready',
      timestamp: Date.now(),
      data: {
        message: 'AetherTrace Telemetry Stream Ready',
        clients: getClientCount()
      }
    }));

    ws.on('close', () => {
      unregisterClient(ws);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket Error]:', err);
      unregisterClient(ws);
    });
  });

  return { server, wss };
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { broadcastEvent };
