import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { proxyRouter } from './routes/proxy.js';
import { tracesRouter } from './routes/traces.js';
import { controlRouter } from './routes/control.js';
import { searchRouter } from './routes/search.js';
import { registerClient, unregisterClient, getClientCount, broadcastEvent } from './broadcaster.js';
import {
  getDatabase,
  resolveDbPath,
  recordSecurityAudit,
  getSecurityAuditLog
} from '@aethertrace/core-schema';

export const app = new Hono();

// 1. Security Headers Middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// 2. Restrictive CORS Middleware (Allow local flight deck and localhost origins)
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'; // Non-browser / CLI clients
    if (defaultAllowedOrigins.includes(origin)) return origin;
    if (process.env.AETHERTRACE_ALLOWED_ORIGINS) {
      const customOrigins = process.env.AETHERTRACE_ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      if (customOrigins.includes(origin)) return origin;
    }
    // Allow any localhost/127.0.0.1 port for local agent development
    if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) {
      return origin;
    }
    return null; // Deny untrusted remote origins
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Run-Id',
    'X-Run-Name',
    'X-Agent-Name',
    'X-Parent-Span-Id',
    'X-Replay-Mode',
    'X-Mock-Upstream',
    'X-Breakpoint',
    'X-Chaos-Inject',
    'X-Target-Base-Url',
    'X-AetherTrace-Token'
  ],
  exposeHeaders: [
    'X-Span-Id',
    'X-Run-Id',
    'X-AetherTrace-Cache',
    'X-AetherTrace-Cost',
    'X-AetherTrace-Latency',
    'X-AetherTrace-Breakpoint',
    'X-AetherTrace-Chaos'
  ]
}));

// 3. Optional Local Authentication Middleware (AETHERTRACE_AUTH_TOKEN)
app.use('*', async (c, next) => {
  const authToken = process.env.AETHERTRACE_AUTH_TOKEN;
  if (!authToken) {
    return next();
  }

  // Allow unauthenticated health check
  if (c.req.path === '/health') {
    return next();
  }

  const authHeader = c.req.header('authorization');
  const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : undefined;
  const customHeaderToken = c.req.header('x-aethertrace-token');
  const queryToken = c.req.query('token');

  const providedToken = bearerToken || customHeaderToken || queryToken;

  if (!providedToken || providedToken !== authToken) {
    recordSecurityAudit({
      operation: 'auth_failed',
      result: 'blocked',
      reason: 'Unauthorized: missing or invalid authentication token',
      details: { path: c.req.path, method: c.req.method }
    });

    return c.json({
      error: {
        message: 'Unauthorized: invalid or missing AetherTrace authentication token',
        type: 'unauthorized'
      }
    }, 401);
  }

  return next();
});

// 4. Health & System Info
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

// 5. Security & System Status Endpoints
app.get('/api/system/status', (c) => {
  const { sqlite } = getDatabase();
  const mem = process.memoryUsage();
  let totalRuns = 0;
  let totalSpans = 0;
  try {
    const r = sqlite.prepare('SELECT count(*) as count FROM trace_runs').get() as any;
    totalRuns = r?.count || 0;
    const s = sqlite.prepare('SELECT count(*) as count FROM trace_spans').get() as any;
    totalSpans = s?.count || 0;
  } catch {}

  return c.json({
    status: 'ok',
    service: 'aethertrace-proxy-server',
    version: '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    uptime_seconds: Math.round(process.uptime()),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2))
      }
    },
    memory: {
      rss_mb: Number((mem.rss / 1024 / 1024).toFixed(2)),
      heap_used_mb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heap_total_mb: Number((mem.heapTotal / 1024 / 1024).toFixed(2))
    },
    database: {
      journalMode: 'WAL',
      path: resolveDbPath(),
      totalRuns,
      totalSpans,
      runs_count: totalRuns,
      spans_count: totalSpans
    },
    websocket: {
      activeClients: getClientCount(),
      maxClients: 100
    },
    telemetry: {
      active_ws_clients: getClientCount()
    },
    timestamp: Date.now()
  });
});

app.get('/api/security/status', (c) => {
  return c.json({
    status: 'ok',
    redactionEnabled: true,
    secretFilteringEnabled: true,
    ssrfProtectionEnabled: true,
    importValidationEnabled: true,
    zeroEvalEnabled: true,
    localAuthEnabled: Boolean(process.env.AETHERTRACE_AUTH_TOKEN),
    maxPayloadBytes: 512 * 1024,
    maxImportBytes: 50 * 1024 * 1024
  });
});

app.get('/api/security/audit', (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  return c.json({
    success: true,
    events: getSecurityAuditLog(limit)
  });
});

// 6. Mount Application Routes
app.route('/', proxyRouter);
app.route('/api', tracesRouter);
app.route('/api', controlRouter);
app.route('/api/search', searchRouter);

// Global Error Handler (Sanitizes internal server details)
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
    console.log(`🛡️  Security & Trust Engine ACTIVE (Zero-Eval, SSRF Shield, Redactor)`);
    console.log(`======================================================\n`);
  });

  // Attach Hardened WebSocket Server
  const MAX_WS_CLIENTS = 100;
  const MAX_WS_MESSAGE_BYTES = 1024 * 1024; // 1 MB

  const wss = new WebSocketServer({ server: server as any, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // 1. Connection count bound
    if (getClientCount() >= MAX_WS_CLIENTS) {
      ws.close(1013, 'Too many connections');
      recordSecurityAudit({
        operation: 'auth_failed',
        result: 'blocked',
        reason: 'WebSocket connection rejected: maximum client capacity reached'
      });
      return;
    }

    // 2. Optional Auth Token Check
    const authToken = process.env.AETHERTRACE_AUTH_TOKEN;
    if (authToken) {
      let clientToken: string | undefined = undefined;
      if (req.url) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          clientToken = urlObj.searchParams.get('token') || undefined;
        } catch {}
      }
      if (!clientToken && req.headers['sec-websocket-protocol']) {
        clientToken = req.headers['sec-websocket-protocol'];
      }

      if (!clientToken || clientToken !== authToken) {
        ws.close(1008, 'Unauthorized: missing or invalid token');
        recordSecurityAudit({
          operation: 'auth_failed',
          result: 'blocked',
          reason: 'WebSocket connection rejected: invalid auth token'
        });
        return;
      }
    }

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

    // Inbound message validation & limit
    ws.on('message', (data: Buffer | string) => {
      const dataLength = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
      if (dataLength > MAX_WS_MESSAGE_BYTES) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message exceeds maximum size (1MB)' }));
        return;
      }

      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        JSON.parse(text); // Validate well-formed JSON
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Malformed JSON payload' }));
      }
    });

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
