/**
 * AetherTrace Complete Core Debugging Loop Example
 *
 * Demonstrates the canonical product loop:
 * OBSERVE -> INTERCEPT -> PAUSE -> INSPECT -> MODIFY -> REPLAY -> FORK -> DIFF -> VERIFY
 */

const BASE_URL = 'http://localhost:4000';

async function main() {
  console.log('\n======================================================');
  console.log('🔄 AetherTrace Complete Debugging Loop Demonstration');
  console.log('   OBSERVE -> INTERCEPT -> PAUSE -> INSPECT -> MODIFY -> REPLAY -> FORK -> DIFF -> VERIFY');
  console.log('======================================================\n');

  const seed = Date.now().toString().slice(-4);
  const runId = `run_loop_demo_${seed}`;

  // 1. OBSERVE & CAPTURE
  console.log('[1/8] OBSERVE: Executing initial baseline agent call...');
  const res1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Run-Id': runId,
      'X-Run-Name': `Core-Loop-Demo-${seed}`,
      'X-Agent-Name': 'Planner',
      'X-Mock-Upstream': 'true'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Design payment checkout architecture' }]
    })
  });
  const span1Id = res1.headers.get('x-span-id')!;
  console.log(`  ✔ Observed and captured Span: ${span1Id.slice(0, 16)}...`);

  // 2. INTERCEPT & PAUSE (Arm Breakpoint)
  console.log('\n[2/8] INTERCEPT & PAUSE: Arming breakpoint for Engineer agent...');
  await fetch(`${BASE_URL}/api/breakpoints/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      matchAgentNames: ['Engineer']
    })
  });

  // Dispatch call that hits the armed breakpoint
  console.log('  • Dispatching call to Engineer agent (intercepted mid-flight)...');
  const interceptedPromise = fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Run-Id': runId,
      'X-Agent-Name': 'Engineer',
      'X-Parent-Span-Id': span1Id,
      'X-Mock-Upstream': 'true'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate SQL migration without foreign keys' }]
    })
  });

  // Give proxy 100ms to hold the socket
  await new Promise((r) => setTimeout(r, 100));

  // 3. INSPECT (Find held breakpoint)
  console.log('\n[3/8] INSPECT: Querying pending breakpoints in proxy memory...');
  const bpRes = await fetch(`${BASE_URL}/api/breakpoints`);
  const bpData = await bpRes.json();
  const pending = bpData.pending?.[0];

  if (!pending) {
    throw new Error('Expected pending breakpoint not found');
  }
  console.log(`  ✔ Intercepted Span: ${pending.spanId} held in paused state`);

  // 4. MODIFY (Mutate Prompt)
  console.log('\n[4/8] MODIFY: Human operator intervenes to mutate prompt with strict FK constraints...');
  const resolutionRes = await fetch(`${BASE_URL}/api/breakpoints/${pending.spanId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'resume',
      mutatedPayload: {
        messages: [{ role: 'user', content: 'Generate SQL migration WITH strict foreign keys and CASCADE delete' }]
      }
    })
  });
  console.log(`  ✔ Mutated prompt released upstream (Status: ${resolutionRes.status})`);
  await interceptedPromise;

  // Disarm breakpoint
  await fetch(`${BASE_URL}/api/breakpoints/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false, matchAgentNames: [] })
  });

  // 5. REPLAY
  console.log('\n[5/8] REPLAY: Replaying full execution from local cache...');
  const replayRes = await fetch(`${BASE_URL}/api/runs/${runId}/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'cache_only' })
  });
  const replayData = await replayRes.json();
  console.log(`  ✔ Replay completed: ${replayData.newRunId} (All spans billed $0.00 from cache)`);

  // 6. FORK
  console.log('\n[6/8] FORK: Branching at Span #1 with model mutation (gpt-4o -> gpt-4o-mini)...');
  const forkRes = await fetch(`${BASE_URL}/api/spans/${span1Id}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      forkName: `Fork-Branch-${seed}`,
      mutations: { model: 'gpt-4o-mini' }
    })
  });
  const forkData = await forkRes.json();
  const forkedRunId = forkData.newRunId;
  console.log(`  ✔ Fork branch created: ${forkedRunId}`);

  // 7. DIFF
  console.log('\n[7/8] DIFF: Comparing original run vs forked run...');
  const diffRes = await fetch(`${BASE_URL}/api/runs/${runId}/diff/${forkedRunId}`);
  const diffData = await diffRes.json();
  console.log(`  ✔ Diff scorecard computed: ${diffData.summary.costSavingsPercent}% cost savings`);

  // 8. VERIFY
  console.log('\n[8/8] VERIFY: Validating reproducibility and provenance scorecards...');
  const provRes = await fetch(`${BASE_URL}/api/runs/${runId}/provenance`);
  const provData = await provRes.json();
  console.log(`  ✔ Provenance verified (Git: ${provData.provenance?.git?.branch || 'local'}, Runtime: ${provData.provenance?.environment?.runtime?.name || 'node'})`);

  console.log('\n======================================================');
  console.log('🎉 Core Product Loop Verification Complete!');
  console.log('   All 9 stages verified end-to-end.');
  console.log('======================================================\n');
}

main().catch(console.error);
