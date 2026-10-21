import { startServer } from '../apps/proxy-server/src/index.js';
import { getDatabase, closeDatabase } from '@aethertrace/core-schema';
import { handleDiff, handleAssert } from '../packages/cli/src/bin.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
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

async function runPhase5Tests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 5 Test: Run Diffing Arena & CI Regression Runner              ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log(`${colors.yellow}▶ Starting AetherTrace proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(350);

  const { sqlite } = getDatabase();
  const tempTraceFile = resolve(process.cwd(), 'temp-ci-regression.trace.json');

  try {
    const seed = Date.now();

    // -----------------------------------------------------------------------------------------
    // STEP 1: Create a 3-step Base Run using expensive model (gpt-4o)
    // -----------------------------------------------------------------------------------------
    console.log(`${colors.magenta}[1/4] Executing 3-step Base Run using gpt-4o...${colors.reset}`);

    const baseRunId = `run_base_gpt4o_${seed}`;
    const baseRunName = `Production-Incident-Triager-${seed.toString().slice(-4)}`;

    // Span 1: Planner
    const r1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': baseRunId,
        'X-Run-Name': baseRunName,
        'X-Agent-Name': 'Planner',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Deconstruct incident telemetry metrics' }]
      })
    });
    if (!r1.ok) throw new Error(`Base Step 1 failed with HTTP ${r1.status}`);

    const span1 = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC LIMIT 1').get(baseRunId) as any;

    // Span 2: Researcher (Parent: Planner)
    const r2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': baseRunId,
        'X-Parent-Span-Id': span1.id,
        'X-Agent-Name': 'Researcher',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Investigate downstream database latency spikes' }]
      })
    });
    if (!r2.ok) throw new Error(`Base Step 2 failed with HTTP ${r2.status}`);

    const span2 = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(baseRunId) as any;

    // Span 3: Coder (Parent: Researcher)
    const r3 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': baseRunId,
        'X-Parent-Span-Id': span2.id,
        'X-Agent-Name': 'Coder',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Generate Redis connection pool patch' }]
      })
    });
    if (!r3.ok) throw new Error(`Base Step 3 failed with HTTP ${r3.status}`);

    const baseRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(baseRunId) as any;
    pass('Base Run executed successfully', `ID: ${baseRunId}, Spend: $${baseRun.total_cost_usd.toFixed(6)}, 3 Spans`);

    // -----------------------------------------------------------------------------------------
    // STEP 2: Fork at Span #2 and execute forked branch with cheaper model (gpt-4o-mini)
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[2/4] Forking at Span #2 and substituting model with gpt-4o-mini...${colors.reset}`);

    const forkRes = await fetch(`${BASE_URL}/api/spans/${span2.id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_run_name: `Forked-Cost-Optimization-${seed.toString().slice(-4)}`
      })
    });
    if (!forkRes.ok) throw new Error(`Forking span ${span2.id} failed with HTTP ${forkRes.status}`);

    const forkData = (await forkRes.json()) as any;
    const forkedRunId = forkData.newRunId;

    pass('Time-Travel Fork created at Span #2', `Forked Run ID: ${forkedRunId}, Copied prefix spans: ${forkData.copiedSpansCount}`);

    // Execute step 2 in forked branch with gpt-4o-mini
    const f2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': forkedRunId,
        'X-Parent-Span-Id': span1.id,
        'X-Agent-Name': 'Researcher',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Investigate downstream database latency spikes (mini optimization)' }]
      })
    });
    if (!f2.ok) throw new Error(`Forked Step 2 failed with HTTP ${f2.status}`);

    const forkedSpan2 = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(forkedRunId) as any;

    // Execute step 3 in forked branch with gpt-4o-mini
    const f3 = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': forkedRunId,
        'X-Parent-Span-Id': forkedSpan2.id,
        'X-Agent-Name': 'Coder',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Generate Redis connection pool patch' }]
      })
    });
    if (!f3.ok) throw new Error(`Forked Step 3 failed with HTTP ${f3.status}`);

    const forkedRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(forkedRunId) as any;
    pass('Forked branch executed with gpt-4o-mini', `ID: ${forkedRunId}, Spend: $${forkedRun.total_cost_usd.toFixed(6)}`);

    // -----------------------------------------------------------------------------------------
    // STEP 3: Verify GET /api/runs/:baseId/diff/:targetId Classification & Savings
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[3/4] Evaluating Run Diffing Engine (/api/runs/:baseId/diff/:targetId)...${colors.reset}`);

    const diffRes = await fetch(`${BASE_URL}/api/runs/${baseRunId}/diff/${forkedRunId}`);
    if (!diffRes.ok) throw new Error(`Run diff endpoint failed with HTTP ${diffRes.status}`);

    const diffJson = (await diffRes.json()) as any;
    const diff = diffJson.diff || diffJson;

    // Verify Step 1: identical_cached
    if (diff.steps[0].status !== 'identical_cached') {
      throw new Error(`Expected Step 1 status to be 'identical_cached', got '${diff.steps[0].status}'`);
    }
    pass("Step 1 classified as 'identical_cached'", `Hash match, Cache hit prefix: 0ms / $0.00`);

    // Verify Step 2: modified_fork
    if (diff.steps[1].status !== 'modified_fork') {
      throw new Error(`Expected Step 2 status to be 'modified_fork', got '${diff.steps[1].status}'`);
    }
    pass("Step 2 classified as 'modified_fork'", `Fork point where gpt-4o was swapped for gpt-4o-mini`);

    // Verify Step 3: diverged_downstream
    if (diff.steps[2].status !== 'diverged_downstream') {
      throw new Error(`Expected Step 3 status to be 'diverged_downstream', got '${diff.steps[2].status}'`);
    }
    pass("Step 3 classified as 'diverged_downstream'", `Subsequent execution downstream from fork point`);

    // Verify costSavingsPercent shows significant positive savings
    const savings = diff.summary.costSavingsPercent;
    if (savings <= 0) {
      throw new Error(`Expected positive costSavingsPercent, got ${savings}%`);
    }
    pass('costSavingsPercent demonstrates significant positive savings', `Saved ${savings}% ($${diff.summary.baseCostUsd.toFixed(6)} ➔ $${diff.summary.targetCostUsd.toFixed(6)})`);

    // Test CLI Diff handler visual output
    console.log(`\n${colors.dim}Testing CLI diff terminal rendering:${colors.reset}`);
    await handleDiff(baseRunId, forkedRunId);
    pass('CLI diff command rendered formatted ASCII matrix');

    // -----------------------------------------------------------------------------------------
    // STEP 4: Export to portable .trace.json bundle & Invoke CLI Regression Gate
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[4/4] Verifying Deterministic CI Regression Gate (aethertrace assert)...${colors.reset}`);

    const exportRes = await fetch(`${BASE_URL}/api/runs/${forkedRunId}/export`);
    if (!exportRes.ok) throw new Error(`Export failed with HTTP ${exportRes.status}`);

    const exportBundle = await exportRes.json();
    writeFileSync(tempTraceFile, JSON.stringify(exportBundle, null, 2), 'utf-8');
    pass('Exported forked run to temporary .trace.json', tempTraceFile);

    // Test Regression Pass: max-cost $0.05 (run is ~0.00003)
    const passResult = await handleAssert(tempTraceFile, { maxCost: 0.05, maxLatency: 10000 }, false);
    if (!passResult.passed || !passResult.costPassed || !passResult.statusPassed) {
      throw new Error(`Expected CI assert to pass with maxCost 0.05, but failed: ${passResult.failures.join(', ')}`);
    }
    pass('CI Regression Assertion PASSED', `Cost: $${passResult.actualCostUsd.toFixed(6)} <= $0.05, Status: ${passResult.actualStatus}`);

    // Test Regression Failure: max-cost $0.000001 (must fail)
    const failResult = await handleAssert(tempTraceFile, { maxCost: 0.000001 }, false);
    if (failResult.passed || failResult.costPassed) {
      throw new Error('Expected CI assert to FAIL when actual cost exceeds micro-budget, but it passed');
    }
    pass('CI Regression Assertion correctly tripped on budget violation', `Caught violation: ${failResult.failures[0]}`);

    console.log(`\n${colors.green}${colors.bold}===================================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL PHASE 5 DIFF ARENA & CI REGRESSION RUNNER TESTS PASSED! ✨                 ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}===================================================================================${colors.reset}\n`);

  } finally {
    if (existsSync(tempTraceFile)) {
      try { unlinkSync(tempTraceFile); } catch {}
    }
    server.close();
    closeDatabase();
  }
}

runPhase5Tests().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}FATAL ERROR IN PHASE 5 TEST:${colors.reset}`, err);
  process.exit(1);
});
