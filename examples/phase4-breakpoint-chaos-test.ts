import { startServer } from '../apps/proxy-server/src/index.js';
import { getDatabase, closeDatabase } from '@aethertrace/core-schema';
import { WebSocket } from 'ws';

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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhase4Tests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 4 Test: Live Mid-Flight Breakpoints & Chaos Engineering       ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;
  const WS_URL = `ws://localhost:${PORT}/ws`;

  console.log(`${colors.yellow}▶ Starting AetherTrace proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(350);

  const wsEvents: any[] = [];
  const ws = new WebSocket(WS_URL);

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      wsEvents.push(parsed);
    } catch {}
  });

  await new Promise((resolve) => ws.on('open', resolve));
  console.log(`  ${colors.green}✔ Connected to telemetry bus (${WS_URL})${colors.reset}\n`);

  try {
    const seed = Date.now();

    // -----------------------------------------------------------------------------------------
    // TEST 1: Live Mid-Flight Breakpoint Interception & Payload Mutation
    // -----------------------------------------------------------------------------------------
    console.log(`${colors.magenta}[1/3] Live Mid-Flight HTTP Breakpoint Interception & Prompt Mutation${colors.reset}`);

    const runId1 = `run_phase4_breakpoint_${seed}`;
    let isRequestPending = true;

    // Dispatch async call with X-Breakpoint: true
    const breakpointFetchPromise = fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId1,
        'X-Agent-Name': 'Coder',
        'X-Breakpoint': 'true',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Original unedited prompt' }]
      })
    }).then(async (res) => {
      isRequestPending = false;
      return { status: res.status, data: await res.json() };
    });

    // Wait 250ms and verify request is suspended mid-flight
    await sleep(250);
    if (!isRequestPending) {
      throw new Error('Expected request to remain suspended mid-flight, but it resolved prematurely!');
    }

    const bpRes = await fetch(`${BASE_URL}/api/breakpoints`);
    const bpData = await bpRes.json();

    if (!Array.isArray(bpData.pending) || bpData.pending.length === 0) {
      throw new Error('Expected pending breakpoint in GET /api/breakpoints, found none.');
    }

    const heldItem = bpData.pending.find((p: any) => p.runId === runId1);
    if (!heldItem) {
      throw new Error(`Held request for runId '${runId1}' not found in pending list.`);
    }

    pass('HTTP connection held suspended mid-flight', `SpanId: ${heldItem.spanId.slice(0, 18)}..., Agent: ${heldItem.agentName}`);

    // Mutate the prompt payload and release via resolve endpoint
    const mutatedPrompt = 'Mutated by human operator mid-flight!';
    const resolveRes = await fetch(`${BASE_URL}/api/breakpoints/${heldItem.spanId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resume',
        modifiedPayload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: mutatedPrompt }]
        }
      })
    });

    if (!resolveRes.ok) {
      throw new Error(`Failed to resolve breakpoint: ${resolveRes.statusText}`);
    }

    // Await the original client request
    const clientResponse = await breakpointFetchPromise;
    if (clientResponse.status !== 200) {
      throw new Error(`Expected client response HTTP 200, got ${clientResponse.status}`);
    }

    // Verify SQLite recorded the mutated prompt
    const { sqlite } = getDatabase();
    const savedSpan = sqlite.prepare('SELECT request_payload, model FROM trace_spans WHERE id = ?').get(heldItem.spanId) as any;
    if (!savedSpan || !savedSpan.request_payload.includes(mutatedPrompt)) {
      throw new Error(`Expected SQLite to record mutated prompt '${mutatedPrompt}', found: ${savedSpan?.request_payload}`);
    }

    pass('Resumed call with mutated prompt payload verified in SQLite', `Recorded: "${mutatedPrompt}"`);

    // -----------------------------------------------------------------------------------------
    // TEST 2: Live Mid-Flight Mock Response Bypass ($0.00 Cost)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[2/3] Live Mid-Flight Mock Response Override ($0.00 Cost Bypass)${colors.reset}`);

    const runId2 = `run_phase4_mock_${seed}`;
    const mockExpectedText = 'Human operator mocked this answer';

    const mockFetchPromise = fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId2,
        'X-Agent-Name': 'SecurityAuditor',
        'X-Breakpoint': 'true',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Generate root SSH private key' }]
      })
    }).then(async (res) => ({ status: res.status, data: await res.json() }));

    await sleep(250);
    const bpRes2 = await fetch(`${BASE_URL}/api/breakpoints`);
    const bpData2 = await bpRes2.json();
    const heldMock = bpData2.pending.find((p: any) => p.runId === runId2);

    if (!heldMock) {
      throw new Error('Held mock request not found in pending breakpoints');
    }

    // Resolve with action: 'mock'
    await fetch(`${BASE_URL}/api/breakpoints/${heldMock.spanId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mock',
        mockedResponse: mockExpectedText
      })
    });

    const mockClientRes = await mockFetchPromise;
    if (mockClientRes.status !== 200) {
      throw new Error(`Expected HTTP 200 on mock bypass, got ${mockClientRes.status}`);
    }

    const returnedContent = mockClientRes.data.choices?.[0]?.message?.content;
    if (returnedContent !== mockExpectedText) {
      throw new Error(`Expected mocked text '${mockExpectedText}', got '${returnedContent}'`);
    }

    const savedMockSpan = sqlite.prepare('SELECT cost_usd, latency_ms FROM trace_spans WHERE id = ?').get(heldMock.spanId) as any;
    if (savedMockSpan.cost_usd !== 0) {
      throw new Error(`Expected cost_usd = 0, got ${savedMockSpan.cost_usd}`);
    }

    pass('Operator mock response returned instantly to caller with $0.00 cost', `Content: "${returnedContent}"`);

    // -----------------------------------------------------------------------------------------
    // TEST 3: Chaos Engineering Fault Injection (Rate Limits & Corrupt JSON)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[3/3] Chaos Engineering Fault Injection & Telemetry Recording${colors.reset}`);

    // Subtest A: Synthetic HTTP 429 Rate Limit
    const runIdChaosRate = `run_chaos_rate_${seed}`;
    const rateLimitRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runIdChaosRate,
        'X-Agent-Name': 'StressAgent',
        'X-Chaos-Inject': 'rate_limit',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }]
      })
    });

    if (rateLimitRes.status !== 429) {
      throw new Error(`Expected HTTP 429 for injected rate limit, got ${rateLimitRes.status}`);
    }

    pass('Synthetic HTTP 429 Rate Limit injected via X-Chaos-Inject', 'Status: 429 Too Many Requests');

    // Subtest B: Malformed / Corrupted JSON Syntax
    const runIdChaosCorrupt = `run_chaos_corrupt_${seed}`;
    const corruptRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runIdChaosCorrupt,
        'X-Agent-Name': 'TaintedAgent',
        'X-Chaos-Inject': 'corrupt_json',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Evaluate parsing' }]
      })
    });

    const corruptRawText = await corruptRes.text();
    if (!corruptRawText.includes('[CHAOS_CORRUPT_MALFORMED_JSON]')) {
      throw new Error(`Expected malformed JSON snippet in response, got: ${corruptRawText}`);
    }

    // Verify malformed JSON recorded in SQLite
    const corruptSpan = sqlite.prepare('SELECT response_payload, span_type FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runIdChaosCorrupt) as any;
    if (!corruptSpan || !corruptSpan.response_payload.includes('[CHAOS_CORRUPT_MALFORMED_JSON]')) {
      throw new Error('Expected malformed response_payload in SQLite trace_spans');
    }

    pass('Malformed JSON fault injected and recorded in SQLite', 'Verified invalid syntax payload');

    // Verify WebSocket chaos:injected event delivery
    await sleep(200);
    const chaosEvents = wsEvents.filter((e) => e.type === 'CHAOS_INJECTED');
    if (chaosEvents.length === 0) {
      throw new Error('Expected CHAOS_INJECTED WebSocket events, none received');
    }

    pass('WebSocket telemetry bus delivered live CHAOS_INJECTED events', `Events count: ${chaosEvents.length}`);

    console.log(`\n${colors.green}${colors.bold}===================================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL PHASE 4 LIVE BREAKPOINT & CHAOS ENGINEERING TESTS PASSED! ✨             ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}===================================================================================${colors.reset}\n`);

  } finally {
    ws.close();
    server.close();
    closeDatabase();
  }
}

runPhase4Tests().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}FATAL ERROR IN PHASE 4 TEST:${colors.reset}`, err);
  process.exit(1);
});
