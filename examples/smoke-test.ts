import { WebSocket } from 'ws';
import { startServer } from '../apps/proxy-server/src/index.js';
import { getDatabase, closeDatabase } from '@aethertrace/core-schema';

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

async function main() {
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}       AetherTrace Core Engine & Interceptor Proxy Verification         ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}            "Wireshark for AI Agents" - Phase 1 Smoke Test              ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;
  const WS_URL = `ws://localhost:${PORT}/ws`;

  console.log(`${colors.yellow}▶ Booting local proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(350);

  const receivedEvents: any[] = [];
  let wsClient: WebSocket | null = null;

  try {
    // 0. Connect WebSocket Client
    await new Promise<void>((resolve, reject) => {
      wsClient = new WebSocket(WS_URL);
      const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 3000);
      wsClient.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      wsClient.on('message', (msg) => {
        try {
          receivedEvents.push(JSON.parse(msg.toString()));
        } catch {}
      });
      wsClient.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    pass('WebSocket connected to /ws', 'Telemetry broadcaster listening');

    const promptSeed = Date.now();
    const runId1 = `run_planner_${promptSeed}`;

    // -----------------------------------------------------------------------------------------
    // Call 1: Normal mocked agent call (X-Agent-Name: Planner, X-Max-Budget-USD: 0.05)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Call 1] Normal Mocked Agent Call (X-Agent-Name: Planner, X-Max-Budget-USD: 0.05)${colors.reset}`);
    const payload1 = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an autonomous systems architect agent.' },
        { role: 'user', content: `Deconstruct security requirements for OAuth2 token validation [Seed:${promptSeed}]` }
      ],
      temperature: 0.2
    };

    const t0 = Date.now();
    const res1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId1,
        'X-Agent-Name': 'Planner',
        'X-Max-Budget-USD': '0.05',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(payload1)
    });

    const lat1 = Date.now() - t0;
    if (!res1.ok) throw new Error(`Call 1 failed with status: ${res1.status}`);
    const json1 = await res1.json();
    pass('Call 1 returned HTTP 200 OK', `Latency: ${lat1}ms, Model: ${json1.model}`);

    const { sqlite } = getDatabase();
    const run1 = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(runId1) as any;
    if (!run1) throw new Error('Run not found in SQLite trace_runs table');
    pass('Run recorded in trace_runs', `ID: ${run1.id}, Status: ${run1.status}, Total Cost: $${run1.total_cost_usd.toFixed(6)}, Total Tokens: ${run1.total_tokens}`);

    const span1 = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').get(runId1) as any;
    if (!span1) throw new Error('Span not found in SQLite trace_spans table');
    if (span1.agent_name !== 'Planner') throw new Error(`Expected agent_name 'Planner', got '${span1.agent_name}'`);
    if (span1.cache_hit !== 0) throw new Error(`Expected cache_hit 0, got ${span1.cache_hit}`);
    if (span1.cost_usd <= 0) throw new Error(`Expected cost_usd > 0, got ${span1.cost_usd}`);
    pass('Span recorded in trace_spans', `Agent: ${span1.agent_name}, Type: ${span1.span_type}, Cost: $${span1.cost_usd}, Cache Hit: ${span1.cache_hit}`);

    // -----------------------------------------------------------------------------------------
    // Call 2: Replay mode call (X-Replay-Mode: true) with the identical payload
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Call 2] Replay Mode Call (X-Replay-Mode: true) with Identical Payload${colors.reset}`);
    const tReplay = Date.now();
    const res2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId1,
        'X-Parent-Span-Id': span1.id,
        'X-Agent-Name': 'Planner',
        'X-Replay-Mode': 'true',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(payload1)
    });

    const lat2 = Date.now() - tReplay;
    if (!res2.ok) throw new Error(`Call 2 failed with status: ${res2.status}`);
    const json2 = await res2.json();

    const cacheHeader2 = res2.headers.get('x-aethertrace-cache');
    const latencyHeader2 = res2.headers.get('x-aethertrace-latency');
    const costHeader2 = res2.headers.get('x-aethertrace-cost');
    pass('Call 2 returned HTTP 200 OK from Replay Cache', `Roundtrip: ${lat2}ms, Header: ${cacheHeader2}, Replay Latency: ${latencyHeader2}`);

    const replaySpan = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ? AND cache_hit = 1').get(runId1) as any;
    if (!replaySpan) throw new Error('Replay span with cache_hit = 1 not found in SQLite');
    if (replaySpan.cost_usd !== 0) throw new Error(`Expected cost_usd === 0, got ${replaySpan.cost_usd}`);
    if (replaySpan.cache_hit !== 1) throw new Error(`Expected cache_hit === 1, got ${replaySpan.cache_hit}`);
    pass('Replay verified in SQLite', `cache_hit: ${replaySpan.cache_hit}, cost_usd: $${replaySpan.cost_usd.toFixed(6)}, latency_ms: ${replaySpan.latency_ms}ms`);

    // -----------------------------------------------------------------------------------------
    // Call 3: Infinite loop trigger (identical non-replay request called 3 times in a row)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Call 3] Infinite Loop Trigger (3 identical non-replay calls in same run)${colors.reset}`);
    const loopRunId = `run_loop_${promptSeed}`;
    const loopPayload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: `Autonomous tool execution stuck in recursive thought [Seed:${promptSeed}]` }
      ]
    };

    console.log(`  ${colors.dim}Sending iteration 1 (normal)...${colors.reset}`);
    const resLoop1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': loopRunId,
        'X-Agent-Name': 'Researcher',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });
    if (!resLoop1.ok) throw new Error(`Loop iteration 1 failed: ${resLoop1.status}`);

    console.log(`  ${colors.dim}Sending iteration 2 (normal)...${colors.reset}`);
    const resLoop2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': loopRunId,
        'X-Agent-Name': 'Researcher',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });
    if (!resLoop2.ok) throw new Error(`Loop iteration 2 failed: ${resLoop2.status}`);

    console.log(`  ${colors.dim}Sending iteration 3 (should trip circuit breaker)...${colors.reset}`);
    const resLoop3 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': loopRunId,
        'X-Agent-Name': 'Researcher',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });

    if (resLoop3.status !== 429) {
      throw new Error(`Expected HTTP 429 Circuit Breaker Tripped, got ${resLoop3.status}`);
    }
    const loopErrJson = await resLoop3.json();
    pass('Circuit Breaker tripped on 3rd call with HTTP 429', `Error: ${loopErrJson.error.message}`);

    // Verify SQLite update: trace_runs.status = 'breaker_tripped'
    const loopRunRecord = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(loopRunId) as any;
    if (!loopRunRecord || loopRunRecord.status !== 'breaker_tripped') {
      throw new Error(`Expected trace_runs.status === 'breaker_tripped', got '${loopRunRecord?.status}'`);
    }
    pass('trace_runs.status updated to "breaker_tripped"', `Run: ${loopRunRecord.id}`);

    // Verify SQLite insertion: 'guardrail_block' span
    const blockSpan = sqlite.prepare("SELECT * FROM trace_spans WHERE run_id = ? AND span_type = 'guardrail_block'").get(loopRunId) as any;
    if (!blockSpan) {
      throw new Error("Expected 'guardrail_block' span in trace_spans");
    }
    pass("'guardrail_block' span inserted in SQLite", `Span ID: ${blockSpan.id}, Type: ${blockSpan.span_type}, Agent: ${blockSpan.agent_name}`);

    // Verify WebSocket alerts
    await sleep(100);
    const breakerWsEvent = receivedEvents.find((e) => e.type === 'CIRCUIT_BREAKER_TRIPPED');
    if (!breakerWsEvent) {
      throw new Error("Missing 'CIRCUIT_BREAKER_TRIPPED' event on WebSocket");
    }
    pass("WebSocket received CIRCUIT_BREAKER_TRIPPED alert", `Reason: ${breakerWsEvent.data.reason}`);

    // -----------------------------------------------------------------------------------------
    // Print Final SQLite Tables
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}          FINAL SQLITE TABLE SNAPSHOT (.trace.sqlite)                   ${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}\n`);

    console.log(`${colors.yellow}${colors.bold}TABLE: trace_runs${colors.reset}`);
    const allRuns = sqlite.prepare(`
      SELECT 
        id, 
        name, 
        status, 
        total_tokens, 
        ROUND(total_cost_usd, 6) as cost_usd, 
        parent_run_id, 
        forked_at_span_id 
      FROM trace_runs 
      ORDER BY created_at ASC
    `).all();
    console.table(allRuns);

    console.log(`\n${colors.yellow}${colors.bold}TABLE: trace_spans (Execution DAG Nodes)${colors.reset}`);
    const allSpans = sqlite.prepare(`
      SELECT 
        id, 
        run_id, 
        parent_span_id, 
        span_type, 
        agent_name, 
        model, 
        prompt_tokens, 
        completion_tokens, 
        ROUND(cost_usd, 6) as cost_usd, 
        latency_ms, 
        cache_hit 
      FROM trace_spans 
      ORDER BY created_at ASC
    `).all();
    console.table(allSpans);

    console.log(`\n${colors.green}${colors.bold}========================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL SPECIFICATIONS VERIFIED & TESTS PASSED SUCCESSFULLY! ✨        ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}========================================================================${colors.reset}\n`);

  } finally {
    if (wsClient) {
      (wsClient as WebSocket).close();
    }
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}FATAL ERROR IN SMOKE TEST:${colors.reset}`, err);
  process.exit(1);
});
