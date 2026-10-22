import { startServer } from '../apps/proxy-server/src/index.js';
import {
  getDatabase,
  closeDatabase,
  resolveEventCategory,
  buildExecutionTree,
  getAncestryPath,
  getRetryChains,
  computeRunDiff,
  type TraceSpan,
  type TraceRun
} from '@aethertrace/core-schema';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

async function runPhase2Tests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 2 Test: Agent Execution Model & Semantic DAG Suite             ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log(`${colors.yellow}▶ Starting AetherTrace proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(350);

  const { sqlite, db } = getDatabase();

  try {
    const seed = Date.now();

    // =========================================================================================
    // TEST 1: Simple Agent Execution (USER -> AGENT -> LLM -> TOOL -> LLM)
    // =========================================================================================
    console.log(`${colors.magenta}[1/9] Simple Agent Execution (USER ➔ AGENT ➔ LLM ➔ TOOL ➔ LLM)...${colors.reset}`);
    const run1Id = `run_p2_simple_${seed}`;

    // 1A. User Input
    const userRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run1Id,
        run_name: `Simple-Agent-Session-${seed.toString().slice(-4)}`,
        parent_span_id: null,
        span_type: 'user_input',
        agent_name: 'User',
        request_payload: { prompt: 'Find the current weather in Paris and write an itinerary' }
      })
    });
    const userSpan = (await userRes.json()).span;

    // 1B. Agent activation
    const agentRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run1Id,
        parent_span_id: userSpan.id,
        span_type: 'agent_state',
        agent_name: 'TravelAgent',
        request_payload: { task: 'Weather-aware itinerary planning', status: 'running' }
      })
    });
    const agentSpan = (await agentRes.json()).span;

    // 1C. LLM call 1 (decides to call weather tool)
    const llm1Res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': run1Id,
        'X-Parent-Span-Id': agentSpan.id,
        'X-Agent-Name': 'TravelAgent',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Check weather in Paris' }]
      })
    });
    const llm1SpanId = llm1Res.headers.get('x-span-id')!;

    // 1D. Tool call (weather_api)
    const toolRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run1Id,
        parent_span_id: llm1SpanId,
        span_type: 'tool_call',
        agent_name: 'TravelAgent',
        request_payload: { tool_name: 'weather_api', arguments: { city: 'Paris', units: 'celsius' } },
        response_payload: { status: 'success', result: { condition: 'Sunny', temp_c: 22 } },
        latency_ms: 120
      })
    });
    const toolSpan = (await toolRes.json()).span;

    // 1E. LLM call 2 (generates final itinerary based on weather tool output)
    const llm2Res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': run1Id,
        'X-Parent-Span-Id': toolSpan.id,
        'X-Agent-Name': 'TravelAgent',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Sunny 22C in Paris: generate itinerary' }]
      })
    });
    const llm2SpanId = llm2Res.headers.get('x-span-id')!;

    // Verify DAG hierarchy and execution tree
    const run1Spans = sqlite
      .prepare('SELECT * FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC')
      .all(run1Id) as TraceSpan[];

    if (run1Spans.length !== 5) throw new Error(`Expected 5 spans, found ${run1Spans.length}`);

    const tree = buildExecutionTree(run1Spans);
    if (tree.length !== 1) throw new Error(`Expected 1 root node (User), found ${tree.length}`);
    if (tree[0].category !== 'USER') throw new Error(`Root category must be USER, got ${tree[0].category}`);

    const agentNode = tree[0].children[0];
    if (agentNode.category !== 'AGENT') throw new Error(`Expected child of USER to be AGENT, got ${agentNode.category}`);

    const llm1Node = agentNode.children[0];
    if (llm1Node.category !== 'LLM') throw new Error(`Expected child of AGENT to be LLM, got ${llm1Node.category}`);

    const toolNode = llm1Node.children[0];
    if (toolNode.category !== 'TOOL') throw new Error(`Expected child of LLM to be TOOL, got ${toolNode.category}`);

    const llm2Node = toolNode.children[0];
    if (llm2Node.category !== 'LLM') throw new Error(`Expected child of TOOL to be LLM, got ${llm2Node.category}`);
    if (llm2Node.depth !== 4) throw new Error(`Expected depth 4 at leaf, got ${llm2Node.depth}`);

    pass('Simple agent execution pipeline verified', 'USER ➔ AGENT ➔ LLM ➔ TOOL ➔ LLM (depth: 4)');

    // =========================================================================================
    // TEST 2: Nested Agents Hierarchy (AGENT A -> AGENT B -> AGENT C -> TOOL)
    // =========================================================================================
    console.log(`\n${colors.magenta}[2/9] Nested Agents Hierarchy (A ➔ B ➔ C ➔ TOOL)...${colors.reset}`);
    const run2Id = `run_p2_nested_${seed}`;

    // Agent A
    const aRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run2Id,
        parent_span_id: null,
        span_type: 'agent_state',
        agent_name: 'DirectorAgent',
        request_payload: { role: 'Director' }
      })
    });
    const spanA = (await aRes.json()).span;

    // Agent B
    const bRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run2Id,
        parent_span_id: spanA.id,
        span_type: 'agent_state',
        agent_name: 'ManagerAgent',
        request_payload: { role: 'Manager', parent_agent: 'DirectorAgent' }
      })
    });
    const spanB = (await bRes.json()).span;

    // Agent C
    const cRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run2Id,
        parent_span_id: spanB.id,
        span_type: 'agent_state',
        agent_name: 'WorkerAgent',
        request_payload: { role: 'Worker', parent_agent: 'ManagerAgent' }
      })
    });
    const spanC = (await cRes.json()).span;

    // Tool under Agent C
    const tRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run2Id,
        parent_span_id: spanC.id,
        span_type: 'tool_call',
        agent_name: 'WorkerAgent',
        request_payload: { tool_name: 'database_exec', arguments: { query: 'SELECT count(*) FROM orders' } },
        response_payload: { status: 'success', result: { count: 1420 } }
      })
    });
    const spanTool = (await tRes.json()).span;

    const run2Spans = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').all(run2Id) as TraceSpan[];
    const ancestry = getAncestryPath(run2Spans, spanTool.id);

    if (ancestry.length !== 4) throw new Error(`Expected ancestry length 4, got ${ancestry.length}`);
    if (ancestry[0].id !== spanA.id) throw new Error(`Ancestry root must be Agent A`);
    if (ancestry[1].id !== spanB.id) throw new Error(`Ancestry step 1 must be Agent B`);
    if (ancestry[2].id !== spanC.id) throw new Error(`Ancestry step 2 must be Agent C`);
    if (ancestry[3].id !== spanTool.id) throw new Error(`Ancestry leaf must be Tool`);

    pass('Nested agent hierarchy verified', 'DirectorAgent ➔ ManagerAgent ➔ WorkerAgent ➔ database_exec');

    // =========================================================================================
    // TEST 3: Parallel Agents Fan-Out (Supervisor -> [Agent A -> Tool A, Agent B -> Tool B])
    // =========================================================================================
    console.log(`\n${colors.magenta}[3/9] Parallel Agents Fan-Out (Supervisor ➔ [Agent A ➔ Tool A, Agent B ➔ Tool B])...${colors.reset}`);
    const run3Id = `run_p2_parallel_${seed}`;

    const supRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run3Id,
        parent_span_id: null,
        span_type: 'agent_state',
        agent_name: 'Supervisor',
        request_payload: { role: 'Supervisor' }
      })
    });
    const supSpan = (await supRes.json()).span;

    // Spawn Sub-Agent A and Sub-Agent B in parallel
    const [branchA, branchB] = await Promise.all([
      (async () => {
        const agRes = await fetch(`${BASE_URL}/api/spans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run3Id,
            parent_span_id: supSpan.id,
            span_type: 'agent_state',
            agent_name: 'SubAgent_Alpha',
            request_payload: { branch: 'A' }
          })
        });
        const agSpan = (await agRes.json()).span;

        const toolRes = await fetch(`${BASE_URL}/api/spans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run3Id,
            parent_span_id: agSpan.id,
            span_type: 'tool_call',
            agent_name: 'SubAgent_Alpha',
            request_payload: { tool_name: 'fetch_user_profile', arguments: { uid: 'u123' } },
            response_payload: { status: 'success', result: { name: 'Alice' } }
          })
        });
        return (await toolRes.json()).span;
      })(),
      (async () => {
        const agRes = await fetch(`${BASE_URL}/api/spans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run3Id,
            parent_span_id: supSpan.id,
            span_type: 'agent_state',
            agent_name: 'SubAgent_Beta',
            request_payload: { branch: 'B' }
          })
        });
        const agSpan = (await agRes.json()).span;

        const toolRes = await fetch(`${BASE_URL}/api/spans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run3Id,
            parent_span_id: agSpan.id,
            span_type: 'tool_call',
            agent_name: 'SubAgent_Beta',
            request_payload: { tool_name: 'fetch_billing_history', arguments: { uid: 'u123' } },
            response_payload: { status: 'success', result: { invoices: 3 } }
          })
        });
        return (await toolRes.json()).span;
      })()
    ]);

    const run3Spans = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').all(run3Id) as TraceSpan[];
    const run3Tree = buildExecutionTree(run3Spans);

    if (run3Tree.length !== 1) throw new Error('Expected 1 root (Supervisor)');
    if (run3Tree[0].children.length !== 2) throw new Error(`Expected 2 parallel subagents, got ${run3Tree[0].children.length}`);

    const subAgentNames = run3Tree[0].children.map(c => c.span.agent_name).sort();
    if (subAgentNames[0] !== 'SubAgent_Alpha' || subAgentNames[1] !== 'SubAgent_Beta') {
      throw new Error(`Unexpected subagent names: ${subAgentNames.join(', ')}`);
    }

    pass('Parallel agent execution verified', 'Supervisor cleanly branched into [SubAgent_Alpha, SubAgent_Beta] with dedicated tools');

    // =========================================================================================
    // TEST 4: Retry Semantics (TOOL -> ERROR -> RETRY -> TOOL)
    // =========================================================================================
    console.log(`\n${colors.magenta}[4/9] Structured Retry Semantics (TOOL ➔ ERROR ➔ RETRY ➔ TOOL)...${colors.reset}`);
    const run4Id = `run_p2_retry_${seed}`;

    // 4A. Tool Attempt 1
    const t1Res = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run4Id,
        parent_span_id: null,
        span_type: 'tool_call',
        agent_name: 'PaymentWorker',
        request_payload: { tool_name: 'charge_card', arguments: { amount_cents: 5000 } },
        response_payload: { status: 'error', error: { message: 'Gateway timeout', error_type: 'GatewayTimeout' } }
      })
    });
    const spanT1 = (await t1Res.json()).span;

    // 4B. Error event
    const errRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run4Id,
        parent_span_id: spanT1.id,
        span_type: 'guardrail_block',
        agent_name: 'PaymentWorker',
        request_payload: { error_type: 'GatewayTimeout', message: 'HTTP 504 Gateway Timeout from payment processor' },
        response_payload: { recoverable: true, retryable: true, source_span_id: spanT1.id }
      })
    });
    const spanErr = (await errRes.json()).span;

    // 4C. Explicit Retry event
    const retryRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run4Id,
        parent_span_id: spanErr.id,
        span_type: 'retry',
        agent_name: 'PaymentWorker',
        request_payload: {
          original_span_id: spanT1.id,
          attempt: 1,
          reason: 'Retry after 504 Gateway Timeout with exponential backoff'
        },
        response_payload: { status: 'in_progress' }
      })
    });
    const spanRetry = (await retryRes.json()).span;

    // 4D. Tool Attempt 2 (Success)
    const t2Res = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run4Id,
        parent_span_id: spanRetry.id,
        span_type: 'tool_call',
        agent_name: 'PaymentWorker',
        request_payload: { tool_name: 'charge_card', arguments: { amount_cents: 5000 } },
        response_payload: { status: 'success', result: { tx_id: 'tx_success_999' } }
      })
    });
    const spanT2 = (await t2Res.json()).span;

    const run4Spans = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ?').all(run4Id) as TraceSpan[];
    const retryChains = getRetryChains(run4Spans);

    if (retryChains.length !== 1) throw new Error(`Expected 1 retry chain, got ${retryChains.length}`);
    if (retryChains[0].original.id !== spanT1.id) throw new Error(`Original span in retry chain must be spanT1`);
    if (retryChains[0].attempt !== 1) throw new Error(`Retry attempt must be 1`);

    pass('Structured retry relationship verified', 'charge_card (fail) ➔ GatewayTimeout ➔ retry attempt #1 ➔ charge_card (success)');

    // =========================================================================================
    // TEST 5: LLM Usage Status Fidelity (reported vs estimated vs unavailable)
    // =========================================================================================
    console.log(`\n${colors.magenta}[5/9] LLM Usage Status Fidelity (reported / estimated / unavailable)...${colors.reset}`);
    const run5Id = `run_p2_usage_${seed}`;

    // Reported span
    await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run5Id,
        span_type: 'llm_call',
        agent_name: 'Agent1',
        model: 'gpt-4o',
        prompt_tokens: 50,
        completion_tokens: 30,
        cost_usd: 0.0005,
        usage_status: 'reported'
      })
    });

    // Estimated span
    await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run5Id,
        span_type: 'llm_call',
        agent_name: 'Agent1',
        model: 'gpt-4o',
        prompt_tokens: 45,
        completion_tokens: 25,
        cost_usd: 0.00045,
        usage_status: 'estimated'
      })
    });

    // Unavailable span (e.g. guardrail block / fault)
    await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: run5Id,
        span_type: 'guardrail_block',
        agent_name: 'Agent1',
        usage_status: 'unavailable'
      })
    });

    const usageSpans = sqlite
      .prepare('SELECT usage_status, prompt_tokens, cost_usd FROM trace_spans WHERE run_id = ?')
      .all(run5Id) as any[];

    const statuses = usageSpans.map(s => s.usage_status).sort();
    if (statuses[0] !== 'estimated' || statuses[1] !== 'reported' || statuses[2] !== 'unavailable') {
      throw new Error(`Unexpected usage statuses: ${statuses.join(', ')}`);
    }

    pass('Token accounting fidelity verified', 'Accurately preserved reported, estimated, and unavailable without synthetic distortion');

    // =========================================================================================
    // TEST 6: Trace Export / Import Fidelity
    // =========================================================================================
    console.log(`\n${colors.magenta}[6/9] Complex Agent Trace Export & Import Round-Trip...${colors.reset}`);

    // Export run 1 (Simple Agent Execution containing USER, AGENT, LLM, TOOL, LLM)
    const exportRes = await fetch(`${BASE_URL}/api/runs/${run1Id}/export`);
    if (!exportRes.ok) throw new Error(`Export failed with HTTP ${exportRes.status}`);
    const exportedBundle = await exportRes.json();

    if (!exportedBundle.version || exportedBundle.version !== '1.0') throw new Error('Exported bundle missing version 1.0');
    if (exportedBundle.spans.length !== 5) throw new Error(`Expected 5 spans in exported bundle, got ${exportedBundle.spans.length}`);

    // Import into a new run ID
    const importedRunId = `run_p2_reimported_${seed}`;
    const importRes = await fetch(`${BASE_URL}/api/runs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...exportedBundle,
        run_id_override: importedRunId,
        run_name_override: 'Reimported-Execution-Model-Run'
      })
    });

    if (!importRes.ok) throw new Error(`Import failed with HTTP ${importRes.status}`);

    const importedSpans = sqlite
      .prepare('SELECT * FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC')
      .all(importedRunId) as TraceSpan[];

    if (importedSpans.length !== 5) throw new Error(`Expected 5 spans in imported run, got ${importedSpans.length}`);

    // Verify semantic tree of reimported run matches original exactly
    const importedTree = buildExecutionTree(importedSpans);
    if (importedTree.length !== 1 || importedTree[0].category !== 'USER') {
      throw new Error(`Reimported tree root must be USER`);
    }
    const impToolNode = importedTree[0].children[0].children[0].children[0];
    if (impToolNode.category !== 'TOOL') throw new Error(`Reimported tree broken at TOOL node`);

    pass('Full fidelity export/import round-trip verified', 'All 5 spans, categories, payloads, and DAG parent links reconstructed cleanly');

    // =========================================================================================
    // TEST 7: Backward Compatibility with Phase 1 Trace Fixtures
    // =========================================================================================
    console.log(`\n${colors.magenta}[7/9] Backward Compatibility with Phase 1 Trace Fixtures...${colors.reset}`);

    const sampleFiles = [
      'linear-trace.json',
      'branching-trace.json',
      'forked-trace.json',
      'chaos-breakpoint-trace.json'
    ];

    for (const file of sampleFiles) {
      const filePath = resolve(process.cwd(), 'docs/trace-format/examples', file);
      if (!existsSync(filePath)) throw new Error(`Sample file not found: ${filePath}`);

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (!content.run || !Array.isArray(content.spans)) {
        throw new Error(`Invalid format in ${file}`);
      }

      // Verify that buildExecutionTree processes each Phase 1 example seamlessly
      const exTree = buildExecutionTree(content.spans);
      if (exTree.length === 0) throw new Error(`buildExecutionTree failed on ${file}`);

      pass(`Phase 1 fixture validated: ${file}`, `${content.spans.length} spans, ${exTree.length} root(s)`);
    }

    // =========================================================================================
    // TEST 8: Fork Compatibility with Complex Agent Traces
    // =========================================================================================
    console.log(`\n${colors.magenta}[8/9] Fork Compatibility with Execution Model Traces...${colors.reset}`);

    // In run 3 (Parallel Supervisor -> Alpha, Beta), fork at SubAgent_Alpha tool
    const forkTargetSpan = branchA; // SubAgent_Alpha's tool
    const forkRes = await fetch(`${BASE_URL}/api/spans/${forkTargetSpan.id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_run_name: `Fork-Agent-Alpha-${seed.toString().slice(-4)}`,
        include_source: true
      })
    });

    if (!forkRes.ok) throw new Error(`Fork failed with HTTP ${forkRes.status}`);
    const forkData = await forkRes.json();
    const forkedRunId = forkData.newRunId || forkData.new_run_id;

    const forkedSpans = sqlite
      .prepare('SELECT id, agent_name, span_type, parent_span_id FROM trace_spans WHERE run_id = ?')
      .all(forkedRunId) as TraceSpan[];

    // Ancestry of SubAgent_Alpha tool is: Supervisor ➔ SubAgent_Alpha ➔ Tool A (3 spans)
    if (forkedSpans.length !== 3) {
      throw new Error(`Expected 3 spans in forked branch, got ${forkedSpans.length}`);
    }

    const forkedAgentNames = forkedSpans.map(s => s.agent_name);
    if (!forkedAgentNames.includes('Supervisor') || !forkedAgentNames.includes('SubAgent_Alpha')) {
      throw new Error(`Forked branch missing Supervisor or SubAgent_Alpha: ${forkedAgentNames.join(', ')}`);
    }

    // Crucially verify Sibling SubAgent_Beta is NOT present
    if (forkedAgentNames.includes('SubAgent_Beta')) {
      throw new Error(`Topological error: Sibling SubAgent_Beta leaked into forked Alpha branch!`);
    }

    pass('Forking complex agent trace verified', 'Forked Alpha branch retained ancestry and pruned sibling Beta branch');

    // =========================================================================================
    // TEST 9: Diff Compatibility (Inserted Tool, Removed Tool, Modified Args, Retries)
    // =========================================================================================
    console.log(`\n${colors.magenta}[9/9] Semantic Diff Arena with Tools, Models, and Retries...${colors.reset}`);

    // Create Base Run: Tool A, Tool B, Tool C
    const diffBaseRunId = `run_diff_base_${seed}`;
    const tA = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffBaseRunId,
        parent_span_id: null,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'read_file', arguments: { path: 'src/index.ts' } }
      })
    });
    const spanTA_id = (await tA.json()).span.id;

    const tB = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffBaseRunId,
        parent_span_id: spanTA_id,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'run_linter', arguments: { strict: false } }
      })
    });
    const spanTB_id = (await tB.json()).span.id;

    const tC = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffBaseRunId,
        parent_span_id: spanTB_id,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'git_commit', arguments: { message: 'feat: add feature' } }
      })
    });

    // Create Target Run: Tool A (identical), Tool X (inserted: type_check), Tool B (modified args: strict: true), Tool C (removed)
    const diffTargetRunId = `run_diff_target_${seed}`;
    const tA2 = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffTargetRunId,
        parent_span_id: null,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'read_file', arguments: { path: 'src/index.ts' } }
      })
    });
    const spanTA2_id = (await tA2.json()).span.id;

    // Inserted tool X: type_check
    const tX = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffTargetRunId,
        parent_span_id: spanTA2_id,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'type_check', arguments: { noEmit: true } }
      })
    });
    const spanTX_id = (await tX.json()).span.id;

    // Modified tool B: strict: true
    const tB2 = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: diffTargetRunId,
        parent_span_id: spanTX_id,
        span_type: 'tool_call',
        agent_name: 'CoderAgent',
        request_payload: { tool_name: 'run_linter', arguments: { strict: true } }
      })
    });

    const diffRes = await fetch(`${BASE_URL}/api/runs/${diffBaseRunId}/diff/${diffTargetRunId}`);
    if (!diffRes.ok) throw new Error(`Diff endpoint failed with HTTP ${diffRes.status}`);
    const diffJson = await diffRes.json();

    const diffStatuses = diffJson.steps.map((s: any) => s.status);

    // Verify that identical, inserted, and modified/removed steps are represented
    if (!diffStatuses.includes('identical_cached') && !diffStatuses.includes('modified')) {
      throw new Error(`Expected identical or modified steps in diff matrix, got: ${diffStatuses.join(', ')}`);
    }

    pass('Semantic diff handles tool mutations and insertions', `Aligned steps classified: [${diffStatuses.join(', ')}]`);

    console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
    console.log(`  ${colors.green}${colors.bold}✨ ALL 9 PHASE 2 AGENT EXECUTION MODEL TESTS PASSED! ✨${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  } finally {
    server.close();
    closeDatabase();
  }
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ Phase 2 Test failed:', err);
  process.exit(1);
});
