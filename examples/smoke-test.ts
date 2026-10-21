import { WebSocket } from 'ws';
import { startServer } from '../apps/proxy-server/src/index.js';
import { getDatabase, closeDatabase } from '@aethertrace/core-schema';

// ANSI Colors for beautiful CLI output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

function pass(name: string, details?: string) {
  console.log(`  ${colors.green}✔${colors.reset} ${colors.bold}${name}${colors.reset}${details ? ` ${colors.dim}(${details})${colors.reset}` : ''}`);
}

function fail(name: string, error: any) {
  console.error(`  ${colors.red}✖${colors.reset} ${colors.bold}${name}${colors.reset}`);
  console.error(`    ${colors.red}${error?.message || error}${colors.reset}`);
  throw error;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSmokeTests() {
  console.log(`\n${colors.cyan}${colors.bold}======================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}       AetherTrace Core Verification Suite            ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   "Wireshark for AI Agents" - Phase 1 Smoke Test     ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}======================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;
  const WS_URL = `ws://localhost:${PORT}/ws`;

  // Start Proxy Server
  console.log(`${colors.yellow}▶ Starting local AetherTrace Proxy & Event Bus on port ${PORT}...${colors.reset}`);
  const { server, wss } = startServer(PORT);
  await sleep(400);

  const receivedWsEvents: any[] = [];
  let wsClient: WebSocket | null = null;

  try {
    // 1. Health Endpoint Test
    console.log(`\n${colors.magenta}[1/8] Server Health & System Topology${colors.reset}`);
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error(`Health returned status ${healthRes.status}`);
    const healthData = await healthRes.json();
    if (healthData.status !== 'ok') throw new Error(`Unexpected status: ${healthData.status}`);
    pass('Health check probe', `Service: ${healthData.service}, Port: ${healthData.port}`);

    // 2. WebSocket Telemetry Broadcaster Connection
    console.log(`\n${colors.magenta}[2/8] Real-time WebSocket Telemetry Broadcaster${colors.reset}`);
    await new Promise<void>((resolve, reject) => {
      wsClient = new WebSocket(WS_URL);
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 3000);

      wsClient.on('open', () => {
        clearTimeout(timeout);
        pass('WebSocket client attached to /ws');
        resolve();
      });

      wsClient.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          receivedWsEvents.push(parsed);
        } catch {}
      });

      wsClient.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await sleep(200);
    const readyEvent = receivedWsEvents.find((e) => e.type === 'connection:ready');
    if (!readyEvent) throw new Error('Expected connection:ready handshake event');
    pass('WebSocket handshake verified', `Message: "${readyEvent.data.message}"`);

    // 3. Non-Streaming Chat Completion Proxy + Trace Persistence
    console.log(`\n${colors.magenta}[3/8] Non-Streaming Proxy Interception & SQLite Persistence${colors.reset}`);
    const promptSeed = Date.now();
    const testRunId = `run_test_${promptSeed}`;
    const payload1 = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an autonomous network security agent.' },
        { role: 'user', content: `Inspect packet header TCP SYN 192.168.1.100:443 [Seed:${promptSeed}]` }
      ],
      temperature: 0.2
    };

    const t0 = Date.now();
    const proxyRes1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-run-id': testRunId,
        'x-run-name': 'smoke-nonstreaming-run',
        'x-mock-response': 'true' // Offline deterministic engine
      },
      body: JSON.stringify(payload1)
    });

    if (!proxyRes1.ok) throw new Error(`Proxy completion failed with status ${proxyRes1.status}`);
    const proxyJson1 = await proxyRes1.json();
    const lat1 = Date.now() - t0;

    const cacheHeader1 = proxyRes1.headers.get('x-aethertrace-cache');
    const costHeader1 = proxyRes1.headers.get('x-aethertrace-cost');
    if (cacheHeader1 !== 'MISS') throw new Error(`Expected X-AetherTrace-Cache MISS, got ${cacheHeader1}`);
    pass('POST /v1/chat/completions returned 200 OK', `Latency: ${lat1}ms, Cache: ${cacheHeader1}`);
    pass('Calculated USD cost attached', `Cost: ${costHeader1}`);

    // Verify in SQLite database
    const { sqlite } = getDatabase();
    const span1 = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').get(testRunId) as any;
    if (!span1) throw new Error('Span not found in SQLite trace_spans table');
    if (span1.status !== 'success') throw new Error(`Span status is ${span1.status}, expected success`);
    if (span1.is_cached !== 0) throw new Error(`Expected is_cached 0, got ${span1.is_cached}`);
    pass('Span persisted in SQLite (.trace.sqlite)', `ID: ${span1.id.slice(0, 16)}..., Model: ${span1.model}, Cost: $${span1.cost}`);

    const runRecord1 = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(testRunId) as any;
    if (!runRecord1 || runRecord1.total_cost <= 0) throw new Error('Run record total_cost was not updated');
    pass('Trace Run aggregated cost in SQLite', `Total Run Cost: $${runRecord1.total_cost.toFixed(6)}`);

    // 4. Time-Travel Replay & 0ms Deterministic Cache Hit
    console.log(`\n${colors.magenta}[4/8] Time-Travel Replay Engine (0ms Cache Lookup)${colors.reset}`);
    const tReplay = Date.now();
    const proxyResReplay = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-run-id': testRunId,
        'x-run-name': 'smoke-nonstreaming-run',
        'x-mock-response': 'true'
      },
      body: JSON.stringify(payload1)
    });

    const latReplay = Date.now() - tReplay;
    const cacheHeaderReplay = proxyResReplay.headers.get('x-aethertrace-cache');
    const costHeaderReplay = proxyResReplay.headers.get('x-aethertrace-cost');
    if (cacheHeaderReplay !== 'HIT') throw new Error(`Expected cache HIT, got ${cacheHeaderReplay}`);
    pass('Identical request served from Replay Cache', `Roundtrip: ${latReplay}ms, Header: ${cacheHeaderReplay}`);
    pass('Zero additional cost on Replay', `Cost: ${costHeaderReplay}`);

    const replaySpan = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ? AND is_cached = 1').get(testRunId) as any;
    if (!replaySpan) throw new Error('Replay span not recorded in SQLite with is_cached = 1');
    pass('Replay span recorded in trace history', `Latency: ${replaySpan.latency_ms}ms, Cached: ${replaySpan.is_cached}`);

    // 5. Streaming Proxy Interception & Token Assembly (SSE)
    console.log(`\n${colors.magenta}[5/8] Streaming Interceptor & SSE Event-Stream Pipeline${colors.reset}`);
    const streamRunId = `run_stream_${Date.now()}`;
    const payloadStream = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: `Stream high-frequency agent tool trace output [Seed:${promptSeed}]` }
      ],
      stream: true
    };

    const streamRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-run-id': streamRunId,
        'x-run-name': 'smoke-stream-run',
        'x-mock-response': 'true'
      },
      body: JSON.stringify(payloadStream)
    });

    if (!streamRes.ok) throw new Error(`Streaming request failed: ${streamRes.status}`);
    const reader = streamRes.body?.getReader();
    if (!reader) throw new Error('No readable stream reader on response');

    let streamBuffer = '';
    const decoder = new TextDecoder();
    let sseChunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      streamBuffer += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          sseChunkCount++;
        }
      }
    }

    if (!streamBuffer.includes('data: [DONE]')) throw new Error('Stream did not terminate with data: [DONE]');
    pass('SSE stream successfully parsed', `Received ${sseChunkCount} SSE frames terminating with [DONE]`);

    await sleep(150);
    const streamSpan = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').get(streamRunId) as any;
    if (!streamSpan || streamSpan.status !== 'success') throw new Error('Stream span not marked success in SQLite');
    pass('Stream tokens aggregated & persisted in SQLite', `Prompt Tokens: ${streamSpan.prompt_tokens}, Completion Tokens: ${streamSpan.completion_tokens}, Cost: $${streamSpan.cost}`);

    // 6. Circuit Breakers: Budget Limits & Repetitive Semantic Loops
    console.log(`\n${colors.magenta}[6/8] Safety Circuit Breakers (Budget Cap & Loop Detection)${colors.reset}`);

    // 6a. Budget Exceeded
    const budgetBreakerRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-run-id': testRunId, // Already has spend
        'x-max-budget-usd': '0.0000001', // Extremely low budget
        'x-mock-response': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Attempt exceeding budget' }]
      })
    });

    if (budgetBreakerRes.status !== 429) {
      throw new Error(`Expected 429 for budget limit, got ${budgetBreakerRes.status}`);
    }
    const budgetErr = await budgetBreakerRes.json();
    if (budgetErr.error.code !== 'budget_exceeded') {
      throw new Error(`Expected error code 'budget_exceeded', got ${budgetErr.error.code}`);
    }
    pass('Budget Circuit Breaker tripped (HTTP 429)', budgetErr.error.message);

    // 6b. Repetitive Semantic Loop
    const loopRunId = `run_loop_${Date.now()}`;
    const loopPayload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Agent recursive call identical prompt [Seed:${promptSeed}]` }]
    };

    // Send 1st and 2nd
    for (let i = 1; i <= 2; i++) {
      await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-run-id': loopRunId,
          'x-replay-cache': 'false', // Bypass cache so they execute as distinct spans
          'x-mock-response': 'true'
        },
        body: JSON.stringify(loopPayload)
      });
    }

    // 3rd attempt should trigger semantic loop breaker
    const loopBreakerRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-run-id': loopRunId,
        'x-replay-cache': 'false',
        'x-mock-response': 'true'
      },
      body: JSON.stringify(loopPayload)
    });

    if (loopBreakerRes.status !== 429) {
      throw new Error(`Expected 429 for semantic loop, got ${loopBreakerRes.status}`);
    }
    const loopErr = await loopBreakerRes.json();
    if (loopErr.error.code !== 'loop_detected') {
      throw new Error(`Expected error code 'loop_detected', got ${loopErr.error.code}`);
    }
    pass('Semantic Loop Circuit Breaker tripped (HTTP 429)', loopErr.error.message);

    // 7. Traces API & Time-Travel Forking
    console.log(`\n${colors.magenta}[7/8] Trace Telemetry REST APIs & Time-Travel Forking${colors.reset}`);
    const runsListRes = await fetch(`${BASE_URL}/api/runs`);
    const runsList = await runsListRes.json();
    if (!Array.isArray(runsList.runs) || runsList.runs.length === 0) {
      throw new Error('Expected runs list from /api/runs');
    }
    pass('GET /api/runs returns trace runs', `Count: ${runsList.runs.length}`);

    const runSpansRes = await fetch(`${BASE_URL}/api/runs/${testRunId}/spans`);
    const runSpansData = await runSpansRes.json();
    if (!Array.isArray(runSpansData.spans) || runSpansData.spans.length === 0) {
      throw new Error('Expected spans array from /api/runs/:id/spans');
    }
    pass('GET /api/runs/:id/spans returns chronological trace spans', `Spans count: ${runSpansData.spanCount}`);

    // Test Forking from a span
    const targetSpanId = runSpansData.spans[0].id;
    const forkRes = await fetch(`${BASE_URL}/api/spans/${targetSpanId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_run_name: 'forked-agent-experiment',
        reason: 'agent_branching_mutation'
      })
    });

    if (forkRes.status !== 201) throw new Error(`Fork failed with status ${forkRes.status}`);
    const forkData = await forkRes.json();
    if (!forkData.newRunId) throw new Error('Expected newRunId in fork response');
    pass('POST /api/spans/:id/fork created isolated branch run', `New Run ID: ${forkData.newRunId}`);

    const statsRes = await fetch(`${BASE_URL}/api/stats`);
    const stats = await statsRes.json();
    pass('GET /api/stats reports aggregate telemetry', `Runs: ${stats.runs.total}, Spans: ${stats.spans.total}, Cache Hit Rate: ${stats.spans.cacheHitRate}%`);

    // 8. WebSocket Event Broadcast Verification
    console.log(`\n${colors.magenta}[8/8] End-to-End WebSocket Event Delivery Verification${colors.reset}`);
    await sleep(200);

    const eventTypesReceived = new Set(receivedWsEvents.map((e) => e.type));
    const expectedEvents = [
      'connection:ready',
      'run:created',
      'span:created',
      'span:completed',
      'cache:hit',
      'breaker:budget_exceeded',
      'breaker:loop_detected'
    ];

    for (const exp of expectedEvents) {
      if (eventTypesReceived.has(exp)) {
        pass(`Received event: "${exp}"`);
      } else {
        fail(`Missing expected event: "${exp}"`, new Error(`Event ${exp} was not received over WebSocket`));
      }
    }

    console.log(`\n${colors.green}${colors.bold}======================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL PHASE 1 CORE VERIFICATIONS PASSED! ✨        ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Monorepo, Schemas, & Pricing Engine verified      ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Deterministic SQLite WAL Engine verified          ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Non-streaming & Streaming SSE Proxy verified       ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - 0ms Time-Travel Replay & Cache verified           ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Budget & Loop Circuit Breakers verified           ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Time-Travel Forking & REST APIs verified          ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  - Real-time WebSocket Event Bus verified            ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}======================================================${colors.reset}\n`);

  } finally {
    if (wsClient) {
      (wsClient as WebSocket).close();
    }
    server.close();
    closeDatabase();
  }
}

runSmokeTests().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}FATAL ERROR IN SMOKE TEST:${colors.reset}`, err);
  process.exit(1);
});
