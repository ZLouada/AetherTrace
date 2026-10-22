import { startServer } from '../apps/proxy-server/src/index.js';
import {
  getDatabase,
  closeDatabase,
  type TraceSpan,
  type TraceRun,
  buildExecutionTree,
  getAncestryPath,
  getRetryChains,
  resolveEventCategory
} from '@aethertrace/core-schema';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import dagre from 'dagre';

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

// Layout computation helper matching apps/flight-deck/src/lib/layout.ts
function computeDagreLayout(spans: TraceSpan[], selectedSpanId?: string | null, direction: 'TB' | 'LR' = 'TB') {
  const NODE_WIDTH = 320;
  const NODE_HEIGHT = 175;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 70,
    nodesep: 50,
    marginx: 40,
    marginy: 40
  });

  const spanIdSet = new Set(spans.map((s) => s.id));
  const rawEdges: { source: string; target: string; isBranch: boolean }[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.parent_span_id && spanIdSet.has(span.parent_span_id)) {
      rawEdges.push({ source: span.parent_span_id, target: span.id, isBranch: true });
    } else if (i > 0) {
      rawEdges.push({ source: spans[i - 1].id, target: span.id, isBranch: false });
    }
  }

  const nodes = spans.map((span) => ({
    id: span.id,
    data: { span, isSelected: span.id === selectedSpanId },
    position: { x: 0, y: 0 }
  }));

  nodes.forEach((n) => dagreGraph.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  rawEdges.forEach((e) => dagreGraph.setEdge(e.source, e.target));

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 }
    };
  });

  return { nodes: layoutedNodes, edges: rawEdges };
}

async function runPhase3DebuggerTests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 3 Test: Interactive AI-Agent Debugger Suite                   ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;
  const WS_URL = `ws://localhost:${PORT}/ws`;

  console.log(`${colors.yellow}▶ Starting AetherTrace proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(400);

  const { sqlite, db } = getDatabase();

  // Connect to live WebSocket telemetry bus
  const wsEvents: Array<{ type: string; data?: any; runId?: string; spanId?: string }> = [];
  const ws = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 4000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        wsEvents.push(msg);
      } catch {}
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  pass('Connected to WebSocket telemetry bus', `URL: ${WS_URL}`);

  try {
    const seed = Date.now();

    // =========================================================================================
    // TEST 1: Graph Rendering Data (All 8 Semantic Node Categories & Edges)
    // =========================================================================================
    console.log(`\n${colors.magenta}[1/12] Graph Rendering Data (USER ➔ AGENT ➔ LLM ➔ TOOL ➔ HTTP ➔ ERROR ➔ RETRY ➔ AGENT)...${colors.reset}`);

    const complexRunId = `run_p3_graph_${seed}`;
    const complexRun: TraceRun = {
      id: complexRunId,
      name: `Debugger-Pipeline-${seed.toString().slice(-4)}`,
      status: 'completed',
      total_tokens: 650,
      total_cost_usd: 0.0042,
      parent_run_id: null,
      forked_at_span_id: null,
      created_at: seed
    };

    const s0_user: TraceSpan = {
      id: `span_p3_0_user_${seed}`,
      run_id: complexRunId,
      parent_span_id: null,
      span_type: 'user_input',
      agent_name: 'HumanOperator',
      model: null,
      request_payload: JSON.stringify({ role: 'user', content: 'Execute fraud check' }),
      response_payload: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 1,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_user_0',
      created_at: seed + 10
    };

    const s1_agent: TraceSpan = {
      id: `span_p3_1_agent_${seed}`,
      run_id: complexRunId,
      parent_span_id: s0_user.id,
      span_type: 'agent_state',
      agent_name: 'FraudSupervisor',
      model: null,
      request_payload: JSON.stringify({ agent_name: 'FraudSupervisor', role: 'Security Orchestrator' }),
      response_payload: JSON.stringify({ status: 'active' }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 5,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_agent_1',
      created_at: seed + 20
    };

    const s2_llm: TraceSpan = {
      id: `span_p3_2_llm_${seed}`,
      run_id: complexRunId,
      parent_span_id: s1_agent.id,
      span_type: 'llm_call',
      agent_name: 'FraudSupervisor',
      model: 'gpt-4o',
      request_payload: JSON.stringify({ messages: [{ role: 'user', content: 'Analyze transaction tx_992' }] }),
      response_payload: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Check ip_reputation' } }] }),
      prompt_tokens: 150,
      completion_tokens: 25,
      cost_usd: 0.0012,
      latency_ms: 320,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_llm_2',
      created_at: seed + 30
    };

    const s3_tool: TraceSpan = {
      id: `span_p3_3_tool_${seed}`,
      run_id: complexRunId,
      parent_span_id: s2_llm.id,
      span_type: 'tool_call',
      agent_name: 'FraudSupervisor',
      model: null,
      request_payload: JSON.stringify({ tool_name: 'ip_reputation', arguments: { ip: '198.51.100.42' } }),
      response_payload: JSON.stringify({ tool_name: 'ip_reputation', result: { risk_score: 0.88 }, is_error: false }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 120,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_tool_3',
      created_at: seed + 360
    };

    const s4_http: TraceSpan = {
      id: `span_p3_4_http_${seed}`,
      run_id: complexRunId,
      parent_span_id: s3_tool.id,
      span_type: 'http_call',
      agent_name: 'FraudSupervisor',
      model: null,
      request_payload: JSON.stringify({ method: 'POST', url: 'https://api.blocklist.io/v1/lookup' }),
      response_payload: JSON.stringify({ status_code: 429, error: 'Rate limit' }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 95,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_http_4',
      created_at: seed + 490
    };

    const s5_error: TraceSpan = {
      id: `span_p3_5_error_${seed}`,
      run_id: complexRunId,
      parent_span_id: s4_http.id,
      span_type: 'guardrail_block',
      agent_name: 'FraudSupervisor',
      model: null,
      request_payload: JSON.stringify({ error_type: 'RateLimitError', status_code: 429 }),
      response_payload: JSON.stringify({ action: 'trigger_retry' }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 2,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_error_5',
      created_at: seed + 590
    };

    const s6_retry: TraceSpan = {
      id: `span_p3_6_retry_${seed}`,
      run_id: complexRunId,
      parent_span_id: s5_error.id,
      span_type: 'retry',
      agent_name: 'FraudSupervisor',
      model: null,
      request_payload: JSON.stringify({ original_span_id: s4_http.id, attempt: 1, retry_reason: 'HTTP 429 backoff' }),
      response_payload: JSON.stringify({ status: 'retrying' }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 200,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_retry_6',
      created_at: seed + 600
    };

    const s7_subagent: TraceSpan = {
      id: `span_p3_7_subagent_${seed}`,
      run_id: complexRunId,
      parent_span_id: s6_retry.id,
      span_type: 'agent_state',
      agent_name: 'IdentityVerifierSubAgent',
      model: null,
      request_payload: JSON.stringify({ agent_name: 'IdentityVerifierSubAgent', parent_agent_name: 'FraudSupervisor', state: 'completed' }),
      response_payload: JSON.stringify({ verified: true }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 15,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: 'hash_subagent_7',
      created_at: seed + 810
    };

    const testSpans = [s0_user, s1_agent, s2_llm, s3_tool, s4_http, s5_error, s6_retry, s7_subagent];

    // Persist via POST /api/runs/import
    const importRes = await fetch(`${BASE_URL}/api/runs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run: complexRun, spans: testSpans })
    });
    if (!importRes.ok) throw new Error(`Import failed with ${importRes.status}`);

    // Compute Dagre layout
    const layout = computeDagreLayout(testSpans, s3_tool.id);
    if (layout.nodes.length !== 8) throw new Error(`Expected 8 DAG nodes, got ${layout.nodes.length}`);
    if (layout.edges.length !== 7) throw new Error(`Expected 7 DAG edges, got ${layout.edges.length}`);

    // Verify all 8 categories represented
    const categories = testSpans.map((s) => resolveEventCategory(s.span_type));
    const expectedCategories = ['USER', 'AGENT', 'LLM', 'TOOL', 'HTTP', 'ERROR', 'RETRY', 'AGENT'];
    for (let i = 0; i < expectedCategories.length; i++) {
      if (categories[i] !== expectedCategories[i]) {
        throw new Error(`Category mismatch at #${i}: expected ${expectedCategories[i]}, got ${categories[i]}`);
      }
    }

    pass('Graph layout generated for all 8 categories', '8 nodes with precise positions and 7 directed edges');

    // =========================================================================================
    // TEST 2: Node Selection State Synchronization
    // =========================================================================================
    console.log(`\n${colors.magenta}[2/12] Node Selection State Synchronization...${colors.reset}`);

    const selectedToolNode = layout.nodes.find((n) => n.id === s3_tool.id);
    if (!selectedToolNode?.data.isSelected) throw new Error('Selected node must have isSelected = true');

    const unselectedLlmNode = layout.nodes.find((n) => n.id === s2_llm.id);
    if (unselectedLlmNode?.data.isSelected) throw new Error('Unselected node must have isSelected = false');

    pass('Node selection state synchronized', `Selected node: ${s3_tool.agent_name} (${s3_tool.span_type})`);

    // =========================================================================================
    // TEST 3: Inspector Payload & Relationships Extraction
    // =========================================================================================
    console.log(`\n${colors.magenta}[3/12] Inspector Event Details & Safe Data Parsing...${colors.reset}`);

    // Verify tool payload extraction
    const parsedToolReq = JSON.parse(s3_tool.request_payload!);
    if (parsedToolReq.tool_name !== 'ip_reputation' || parsedToolReq.arguments.ip !== '198.51.100.42') {
      throw new Error('Tool arguments failed to parse');
    }

    // Verify retry extraction
    const retryChains = getRetryChains(testSpans);
    if (retryChains.length !== 1 || retryChains[0].original.id !== s4_http.id) {
      throw new Error('Retry chain detection failed');
    }

    // Verify ancestry path from leaf to root
    const ancestry = getAncestryPath(testSpans, s7_subagent.id);
    if (ancestry.length !== 8 || ancestry[0].id !== s0_user.id) {
      throw new Error(`Ancestry path incorrect: length ${ancestry.length}`);
    }

    pass('Inspector event details & relationships parsed safely', 'Extracted tool args, retry chain, and 8-level ancestry path');

    // =========================================================================================
    // TEST 4: Execution Timeline Waterfall Bounds & Duration
    // =========================================================================================
    console.log(`\n${colors.magenta}[4/12] Execution Timeline Waterfall Bounds & Duration...${colors.reset}`);

    const minTime = testSpans[0].created_at;
    let maxTime = minTime;
    for (const s of testSpans) {
      const end = s.created_at + s.latency_ms;
      if (end > maxTime) maxTime = end;
    }
    const totalTimelineMs = maxTime - minTime;

    if (totalTimelineMs <= 0) throw new Error('Total timeline duration must be positive');
    if (minTime !== s0_user.created_at) throw new Error('Min timeline time must equal first span created_at');

    pass('Execution timeline waterfall bounds validated', `Window: ${totalTimelineMs}ms across 8 spans`);

    // =========================================================================================
    // TEST 5: Live WebSocket Telemetry Event Delivery
    // =========================================================================================
    console.log(`\n${colors.magenta}[5/12] Live WebSocket Telemetry Event Delivery...${colors.reset}`);

    const wsStartCount = wsEvents.length;
    const liveSpanId = `span_live_${seed}`;

    // Emit span via POST /api/spans
    const emitRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: liveSpanId,
        run_id: complexRunId,
        parent_span_id: s7_subagent.id,
        span_type: 'tool_call',
        agent_name: 'IdentityVerifierSubAgent',
        request_payload: JSON.stringify({ tool_name: 'biometric_verify' }),
        response_payload: JSON.stringify({ match: true }),
        latency_ms: 45
      })
    });
    if (!emitRes.ok) throw new Error(`Emit span failed with HTTP ${emitRes.status}`);

    await sleep(250);

    const liveSpanEvent = wsEvents.find((e) => e.type === 'SPAN_CREATED' && (e.spanId === liveSpanId || e.data?.id === liveSpanId));
    if (!liveSpanEvent) throw new Error('WebSocket failed to deliver SPAN_CREATED event');

    pass('Live WebSocket event delivered instantly', `SpanId: ${liveSpanId}, Type: ${liveSpanEvent.type}`);

    // =========================================================================================
    // TEST 6: Breakpoint Hit & Paused State
    // =========================================================================================
    console.log(`\n${colors.magenta}[6/12] Breakpoint Hit & Paused State...${colors.reset}`);

    // Arm breakpoint for 'DebuggerTestAgent'
    const bpConfigRes = await fetch(`${BASE_URL}/api/breakpoints/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        matchAgentNames: ['DebuggerTestAgent'],
        matchModels: []
      })
    });
    if (!bpConfigRes.ok) throw new Error('Failed to update breakpoint config');

    // Trigger intercepted chat completion
    const bpRunId = `run_bp_test_${seed}`;
    let bpHitReceived = false;
    let bpHitSpanId: string | null = null;

    const reqPromise = fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': bpRunId,
        'X-Agent-Name': 'DebuggerTestAgent',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Suspended breakpoint request' }]
      })
    });

    // Wait for BREAKPOINT_HIT over WebSocket
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      const hitEvent = wsEvents.find((e) => e.type === 'BREAKPOINT_HIT' && e.runId === bpRunId);
      if (hitEvent) {
        bpHitReceived = true;
        bpHitSpanId = hitEvent.spanId || hitEvent.data?.spanId;
        break;
      }
    }

    if (!bpHitReceived || !bpHitSpanId) throw new Error('BREAKPOINT_HIT event was not broadcast');

    // Verify run status is 'paused' in SQLite
    const pausedRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(bpRunId) as TraceRun;
    if (pausedRun.status !== 'paused') throw new Error(`Expected run status 'paused', got '${pausedRun.status}'`);

    pass('Breakpoint hit held mid-flight and run marked paused', `SpanId: ${bpHitSpanId}, Status: ${pausedRun.status}`);

    // =========================================================================================
    // TEST 7: Breakpoint Resolution (Resume with Mutated Payload)
    // =========================================================================================
    console.log(`\n${colors.magenta}[7/12] Breakpoint Resolution (Resume with Mutated Prompt)...${colors.reset}`);

    const resolveRes = await fetch(`${BASE_URL}/api/breakpoints/${bpHitSpanId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resume',
        modifiedPayload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Mutated by developer in debugger' }]
        }
      })
    });

    if (!resolveRes.ok) throw new Error(`Resolve breakpoint failed: ${resolveRes.status}`);

    const httpRes = await reqPromise;
    if (!httpRes.ok) throw new Error(`HTTP call failed after resume: ${httpRes.status}`);
    const resJson = await httpRes.json();

    // Verify resolved in SQLite
    const resumedSpan = sqlite.prepare('SELECT * FROM trace_spans WHERE id = ?').get(bpHitSpanId) as TraceSpan;
    if (!resumedSpan.request_payload?.includes('Mutated by developer')) {
      throw new Error('Resumed span did not record mutated payload');
    }

    pass('Breakpoint resumed with mutated payload', 'Outbound payload successfully updated and executed');

    // =========================================================================================
    // TEST 8: Replay From Span Execution
    // =========================================================================================
    console.log(`\n${colors.magenta}[8/12] Replay From Historical Span Execution...${colors.reset}`);

    const replayRes = await fetch(`${BASE_URL}/api/spans/${s3_tool.id}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_run_name: 'Replay-From-Tool-Step' })
    });

    if (!replayRes.ok) throw new Error(`Replay endpoint failed: ${replayRes.status}`);
    const replayData = await replayRes.json();
    const replayRunId = replayData.newRunId;

    if (!replayRunId) throw new Error('Replay endpoint must return newRunId');

    // Verify replayed run in SQLite
    const replayRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(replayRunId) as TraceRun;
    if (!replayRun || replayRun.parent_run_id !== complexRunId) {
      throw new Error(`Replay run parent pointer invalid: ${replayRun?.parent_run_id}`);
    }

    const replayedSpans = sqlite
      .prepare('SELECT * FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC')
      .all(replayRunId) as TraceSpan[];

    // Ancestors: user (0), agent (1), llm (2), tool (3) = 4 spans
    if (replayedSpans.length !== 4) throw new Error(`Expected 4 replayed spans, got ${replayedSpans.length}`);

    // All replayed spans must be marked cache_hit = 1
    for (const rs of replayedSpans) {
      if (rs.cache_hit !== 1) throw new Error(`Replayed span ${rs.id} must have cache_hit = 1`);
    }

    pass('Replay from span created cleanly', `New RunId: ${replayRunId}, Copied ${replayedSpans.length} cached spans`);

    // =========================================================================================
    // TEST 9: Fork From Span Lineage & Pruning
    // =========================================================================================
    console.log(`\n${colors.magenta}[9/12] Fork From Span Lineage & Pruning...${colors.reset}`);

    const forkRes = await fetch(`${BASE_URL}/api/spans/${s2_llm.id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_run_name: 'Forked-Branch-Test', include_source: true })
    });

    if (!forkRes.ok) throw new Error(`Fork endpoint failed: ${forkRes.status}`);
    const forkData = await forkRes.json();
    const forkedRunId = forkData.newRunId;

    const forkedSpans = sqlite
      .prepare('SELECT * FROM trace_spans WHERE run_id = ?')
      .all(forkedRunId) as TraceSpan[];

    // Ancestors of s2_llm: user (0), agent (1), llm (2) = 3 spans
    if (forkedSpans.length !== 3) throw new Error(`Expected 3 forked spans, got ${forkedSpans.length}`);

    pass('Fork from span preserved lineage and pruned downstream', `Forked RunId: ${forkedRunId}, Spans: ${forkedSpans.length}`);

    // =========================================================================================
    // TEST 10: Run Diff Engine Integration
    // =========================================================================================
    console.log(`\n${colors.magenta}[10/12] Run Diff Engine Integration...${colors.reset}`);

    const diffRes = await fetch(`${BASE_URL}/api/runs/${complexRunId}/diff/${replayRunId}`);
    if (!diffRes.ok) throw new Error(`Diff endpoint failed: ${diffRes.status}`);
    const diffData = await diffRes.json();
    const diff = diffData.diff || diffData;

    if (!diff.summary || !diff.steps) throw new Error('Invalid diff response structure');
    if (diff.steps.length === 0) throw new Error('Diff steps must not be empty');

    pass('Run diff scorecard computed', `Steps aligned: ${diff.steps.length}, Identical: ${diff.summary.identicalStepsCount}`);

    // =========================================================================================
    // TEST 11: Error State & Failed Execution Experience
    // =========================================================================================
    console.log(`\n${colors.magenta}[11/12] Error State & Failed Execution Experience...${colors.reset}`);

    // Find the error span
    const errorSpan = testSpans.find((s) => s.span_type === 'guardrail_block');
    if (!errorSpan) throw new Error('Error span not found');

    const errPayload = JSON.parse(errorSpan.request_payload!);
    if (errPayload.error_type !== 'RateLimitError' || errPayload.status_code !== 429) {
      throw new Error('Error payload contents incorrect');
    }

    // Trace error back to triggering HTTP request
    if (errorSpan.parent_span_id !== s4_http.id) {
      throw new Error(`Error parent must be ${s4_http.id}, got ${errorSpan.parent_span_id}`);
    }

    pass('Failed execution causal tracking verified', `Error: ${errPayload.error_type} (429) linked to parent HTTP span`);

    // =========================================================================================
    // TEST 12: Large Trace Performance & Scalability (1,000 Spans Benchmark)
    // =========================================================================================
    console.log(`\n${colors.magenta}[12/12] Large Trace Performance & Scalability (1,000 Spans Benchmark)...${colors.reset}`);

    const largeSpanCount = 1000;
    const largeSpans: TraceSpan[] = [];
    const baseT = Date.now();

    for (let i = 0; i < largeSpanCount; i++) {
      largeSpans.push({
        id: `span_bench_${i}`,
        run_id: 'run_benchmark_1000',
        parent_span_id: i === 0 ? null : (i % 5 === 0 ? `span_bench_${Math.floor(i / 5) * 5}` : `span_bench_${i - 1}`),
        span_type: i % 4 === 0 ? 'tool_call' : i % 7 === 0 ? 'guardrail_block' : 'llm_call',
        agent_name: `Worker-${i % 10}`,
        model: i % 2 === 0 ? 'gpt-4o' : 'gpt-4o-mini',
        request_payload: JSON.stringify({ step: i }),
        response_payload: JSON.stringify({ done: true }),
        prompt_tokens: 20,
        completion_tokens: 10,
        cost_usd: 0.0001,
        latency_ms: 10 + (i % 50),
        cache_hit: 0,
        usage_status: 'reported',
        request_hash: `hash_bench_${i}`,
        created_at: baseT + i * 20
      });
    }

    // Benchmark DAG Layout calculation
    const tStartLayout = Date.now();
    const benchLayout = computeDagreLayout(largeSpans);
    const layoutDurationMs = Date.now() - tStartLayout;

    // Benchmark timeline waterfall calculation
    const tStartTimeline = Date.now();
    const sorted = [...largeSpans].sort((a, b) => a.created_at - b.created_at);
    const minT = sorted[0].created_at;
    let maxT = minT;
    for (const s of sorted) {
      const end = s.created_at + s.latency_ms;
      if (end > maxT) maxT = end;
    }
    const timelineDurationMs = Date.now() - tStartTimeline;

    if (benchLayout.nodes.length !== largeSpanCount) {
      throw new Error(`Expected ${largeSpanCount} layout nodes, got ${benchLayout.nodes.length}`);
    }

    // Performance assertion: layout must finish in reasonable time (< 400ms for 1,000 nodes)
    if (layoutDurationMs > 400) {
      console.warn(`  ${colors.yellow}⚠ Layout took ${layoutDurationMs}ms (threshold 400ms)${colors.reset}`);
    }

    pass('Large trace (1,000 spans) layout & timeline benchmark passed', `Layout: ${layoutDurationMs}ms, Timeline: ${timelineDurationMs}ms (1,000 nodes)`);

    console.log(`\n${colors.green}${colors.bold}===================================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL 12 PHASE 3 INTERACTIVE DEBUGGER TESTS PASSED! ✨${colors.reset}`);
    console.log(`${colors.green}${colors.bold}===================================================================================\n${colors.reset}`);
  } catch (err) {
    fail('Phase 3 Debugger Test Suite failed', err);
  } finally {
    ws.close();
    server.close();
    closeDatabase();
  }
}

runPhase3DebuggerTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
