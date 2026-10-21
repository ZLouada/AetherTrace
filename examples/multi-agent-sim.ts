import { getDatabase } from '@aethertrace/core-schema';
import { startServer } from '../apps/proxy-server/src/index.js';

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}       AetherTrace Multi-Agent Autonomous Workflow Simulator            ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;

  // Check if proxy server is already running; if not, spin up local instance
  let startedLocalServer = false;
  let serverInstance: any = null;

  try {
    const healthCheck = await fetch(`${BASE_URL}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      console.log(`${colors.yellow}▶ Starting local AetherTrace Proxy Server on port ${PORT}...${colors.reset}`);
      serverInstance = startServer(PORT);
      startedLocalServer = true;
      await sleep(400);
    } else {
      console.log(`${colors.green}✔ Connected to running AetherTrace Proxy on http://localhost:${PORT}${colors.reset}`);
    }
  } catch {
    serverInstance = startServer(PORT);
    startedLocalServer = true;
    await sleep(400);
  }

  const simSeed = Date.now();
  const runId = `run_dag_sim_${simSeed}`;
  const runName = `Sim-AutonomousSecOps-${simSeed.toString().slice(-4)}`;

  console.log(`\n${colors.bold}Session Initialized:${colors.reset} ${colors.cyan}${runName}${colors.reset}`);
  console.log(`${colors.dim}Run ID: ${runId}${colors.reset}\n`);

  try {
    const { sqlite } = getDatabase();

    // -----------------------------------------------------------------------------------------
    // Step 1: Planner Agent (Root DAG Node)
    // -----------------------------------------------------------------------------------------
    console.log(`${colors.magenta}[Step 1/5] Planner Agent (gpt-4o)${colors.reset}`);
    const plannerRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Run-Name': runName,
        'X-Agent-Name': 'Planner',
        'X-Max-Budget-USD': '0.10',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are the Lead Cyber Architect Agent.' },
          { role: 'user', content: `Deconstruct network packet ingestion architecture for 10Gbps stream [Seed:${simSeed}]` }
        ],
        temperature: 0.1
      })
    });

    if (!plannerRes.ok) throw new Error(`Planner failed: ${plannerRes.status}`);
    const plannerJson = await plannerRes.json();

    const plannerSpan = sqlite.prepare('SELECT id, cost_usd, latency_ms FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC LIMIT 1').get(runId) as any;
    console.log(`  ${colors.green}✔ Planner node spawned${colors.reset} [ID: ${plannerSpan.id.slice(0, 16)}...] ($${plannerSpan.cost_usd.toFixed(6)}, ${plannerSpan.latency_ms}ms)`);
    await sleep(300);

    // -----------------------------------------------------------------------------------------
    // Step 2: Researcher Agent (Branching from Planner)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Step 2/5] Researcher Agent (gpt-4o) [Parent: Planner]${colors.reset}`);
    const researcherRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': plannerSpan.id,
        'X-Agent-Name': 'Researcher',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are the Systems Performance Researcher Agent.' },
          { role: 'user', content: 'Benchmark DPDK kernel bypass vs eBPF XDP zero-copy ring buffers.' }
        ]
      })
    });

    if (!researcherRes.ok) throw new Error(`Researcher failed: ${researcherRes.status}`);
    const researcherSpan = sqlite.prepare('SELECT id, cost_usd, latency_ms FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as any;
    console.log(`  ${colors.green}✔ Researcher node spawned${colors.reset} [ID: ${researcherSpan.id.slice(0, 16)}...] (Parent: ${plannerSpan.id.slice(0, 12)}...)`);
    await sleep(300);

    // -----------------------------------------------------------------------------------------
    // Step 3: Coder Agent (Branching from Researcher)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Step 3/5] Coder Agent (claude-3-5-sonnet) [Parent: Researcher]${colors.reset}`);
    const coderRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': researcherSpan.id,
        'X-Agent-Name': 'Coder',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are the Systems Implementation Coder.' },
          { role: 'user', content: 'Implement zero-copy AF_XDP ring buffer socket reader in C/Rust.' }
        ]
      })
    });

    if (!coderRes.ok) throw new Error(`Coder failed: ${coderRes.status}`);
    const coderSpan = sqlite.prepare('SELECT id, cost_usd, latency_ms FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as any;
    console.log(`  ${colors.green}✔ Coder node spawned${colors.reset} [ID: ${coderSpan.id.slice(0, 16)}...] (Parent: ${researcherSpan.id.slice(0, 12)}...)`);
    await sleep(300);

    // -----------------------------------------------------------------------------------------
    // Step 4: Reviewer Agent (Branching from Coder)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Step 4/5] Reviewer Agent (gpt-4o-mini) [Parent: Coder]${colors.reset}`);
    const reviewerRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': coderSpan.id,
        'X-Agent-Name': 'Reviewer',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are the Memory Safety Reviewer Agent.' },
          { role: 'user', content: 'Verify packet boundary alignment and UMEM memory registration safety.' }
        ]
      })
    });

    if (!reviewerRes.ok) throw new Error(`Reviewer failed: ${reviewerRes.status}`);
    const reviewerSpan = sqlite.prepare('SELECT id, cost_usd, latency_ms FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as any;
    console.log(`  ${colors.green}✔ Reviewer node spawned${colors.reset} [ID: ${reviewerSpan.id.slice(0, 16)}...] (Parent: ${coderSpan.id.slice(0, 12)}...)`);
    await sleep(300);

    // -----------------------------------------------------------------------------------------
    // Step 5: Rogue Loop Agent (Branching from Coder, Trips Circuit Breaker)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[Step 5/5] Rogue Loop Agent (Trips Semantic Loop Circuit Breaker)${colors.reset}`);
    const loopPayload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Recursive thought loop reflection without progress [Seed:${simSeed}]` }]
    };

    console.log(`  ${colors.dim}Sending repeat iteration 1...${colors.reset}`);
    await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': coderSpan.id,
        'X-Agent-Name': 'Rogue Loop Agent',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });
    await sleep(150);

    console.log(`  ${colors.dim}Sending repeat iteration 2...${colors.reset}`);
    await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': coderSpan.id,
        'X-Agent-Name': 'Rogue Loop Agent',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });
    await sleep(150);

    console.log(`  ${colors.dim}Sending repeat iteration 3 (trip breaker)...${colors.reset}`);
    const breakerRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': runId,
        'X-Parent-Span-Id': coderSpan.id,
        'X-Agent-Name': 'Rogue Loop Agent',
        'X-Replay-Mode': 'false',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify(loopPayload)
    });

    if (breakerRes.status === 429) {
      const err = await breakerRes.json();
      console.log(`  ${colors.red}${colors.bold}🛑 CIRCUIT BREAKER TRIPPED!${colors.reset} (HTTP 429: ${err.error.code})`);
      console.log(`  ${colors.dim}${err.error.message}${colors.reset}`);
    } else {
      console.log(`  Unexpected status: ${breakerRes.status}`);
    }

    // Print DAG Summary
    const finalRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(runId) as any;
    const finalSpans = sqlite.prepare('SELECT id, parent_span_id, span_type, agent_name, model, cost_usd, latency_ms FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC').all(runId);

    console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}                    SIMULATION COMPLETE                                 ${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}\n`);

    console.log(`${colors.bold}Session Name:${colors.reset}    ${finalRun.name}`);
    console.log(`${colors.bold}Status:${colors.reset}          ${colors.red}${finalRun.status}${colors.reset}`);
    console.log(`${colors.bold}Total Tokens:${colors.reset}    ${finalRun.total_tokens}`);
    console.log(`${colors.bold}Total Cost:${colors.reset}      $${finalRun.total_cost_usd.toFixed(6)}`);
    console.log(`${colors.bold}Nodes in DAG:${colors.reset}    ${finalSpans.length}`);

    console.log(`\n${colors.yellow}${colors.bold}Hierarchical DAG Topology:${colors.reset}`);
    console.table(finalSpans);

    console.log(`${colors.green}${colors.bold}👉 Open the Flight Deck UI at http://localhost:3000 to explore the interactive DAG!${colors.reset}\n`);

  } finally {
    if (startedLocalServer && serverInstance) {
      serverInstance.server.close();
    }
  }
}

main().catch((err) => {
  console.error(`${colors.red}Simulator error:${colors.reset}`, err);
  process.exit(1);
});
