/**
 * AetherTrace Time-Travel Replay & Fork Example
 *
 * Demonstrates:
 * 1. Running a baseline 3-step agent workflow
 * 2. Exact Replay ($0.00 cost, 0ms latency from local SQLite cache)
 * 3. Forking at an intermediate span with Model Mutation (gpt-4o -> gpt-4o-mini)
 * 4. Automatic cost delta scorecard computation
 */

const BASE_URL = 'http://localhost:4000';

async function main() {
  console.log('\n======================================================');
  console.log('⏳ AetherTrace Time-Travel Replay & Fork Engine');
  console.log('======================================================\n');

  const seed = Date.now().toString().slice(-4);
  const baseRunId = `run_base_experiment_${seed}`;

  // 1. Execute Baseline Run (gpt-4o)
  console.log(`▶ Step 1: Executing Baseline Run (${baseRunId})...`);
  const step1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Run-Id': baseRunId,
      'X-Run-Name': `Baseline-Run-${seed}`,
      'X-Agent-Name': 'Planner',
      'X-Mock-Upstream': 'true'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Design architecture for auth gateway' }]
    })
  });
  const span1Id = step1.headers.get('x-span-id');

  const step2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Run-Id': baseRunId,
      'X-Run-Name': `Baseline-Run-${seed}`,
      'X-Agent-Name': 'Engineer',
      'X-Parent-Span-Id': span1Id!,
      'X-Mock-Upstream': 'true'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Implement JWT validation middleware' }]
    })
  });
  const span2Id = step2.headers.get('x-span-id');

  console.log('  ✔ Baseline run completed with 2 spans using gpt-4o.');

  // 2. Fork at Span #2 with Model Mutation (gpt-4o -> gpt-4o-mini)
  console.log(`\n▶ Step 2: Forking execution at Span #2 and swapping model to gpt-4o-mini...`);
  const forkRes = await fetch(`${BASE_URL}/api/spans/${span2Id}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forkName: `Fork-Optimized-${seed}`,
      mutations: {
        model: 'gpt-4o-mini'
      }
    })
  });

  const forkData = await forkRes.json();
  const targetRunId = forkData.newRunId;
  console.log(`  ✔ Fork created: ${targetRunId} (Ancestry copied: ${forkData.copiedSpansCount} span)`);

  // 3. Compute Deterministic Run Diff
  console.log(`\n▶ Step 3: Computing deterministic DAG diff between runs...`);
  const diffRes = await fetch(`${BASE_URL}/api/runs/${baseRunId}/diff/${targetRunId}`);
  const diffData = await diffRes.json();
  const summary = diffData.summary;

  console.log('\n--- Executive Diff Scorecard ---');
  console.log(`  • Base Run Spend:   $${summary.baseCostUsd.toFixed(6)} (${summary.baseRunName})`);
  console.log(`  • Target Run Spend: $${summary.targetCostUsd.toFixed(6)} (${summary.targetRunName})`);
  console.log(`  • Cost Savings:     ${summary.costSavingsPercent}% saved 💰`);
  console.log(`  • Latency Delta:    ${summary.latencyDeltaMs}ms`);
  console.log(`  • Identical Prefix: ${summary.identicalStepsCount} steps cached ($0.00 / 0ms)`);
  console.log(`  • Diverged Steps:   ${summary.divergedStepsCount} steps modified/diverged`);

  console.log('\n======================================================');
  console.log('✨ Time-Travel Replay & Diff Complete!');
  console.log('💻 Inspect side-by-side in Flight Deck Diff Arena:');
  console.log('   http://localhost:3000 (Click "Diff Arena" or press D)');
  console.log('======================================================\n');
}

main().catch(console.error);
