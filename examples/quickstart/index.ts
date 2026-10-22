/**
 * AetherTrace Quickstart Example
 *
 * Demonstrates the 30-second developer workflow:
 * 1. Automatic context propagation across agents (Planner -> Researcher -> Coder)
 * 2. Zero-cost mock execution ($0.00 spend, zero external API keys needed)
 * 3. Instant capture into local SQLite (.trace.sqlite) and live Flight Deck visualization
 *
 * Usage:
 *   # Ensure proxy is running in another terminal: pnpm start or aethertrace start
 *   pnpm tsx examples/quickstart/index.ts
 */

import { traceRun, traceAgent, getTraceHeaders } from '../../packages/sdk-ts/src/index.js';

const PROXY_URL = 'http://localhost:4000/v1/chat/completions';

async function callModel(agentName: string, prompt: string, model: string = 'gpt-4o') {
  const headers = {
    'Content-Type': 'application/json',
    'X-Mock-Upstream': 'true', // Zero-cost local simulation
    ...getTraceHeaders()
  };

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `You are the ${agentName} agent.` },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Proxy error (${response.status}): ${await response.text()}`);
  }

  const spanId = response.headers.get('x-span-id');
  const cost = response.headers.get('x-aethertrace-cost');
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content || 'No content';

  console.log(`  ✔ [${agentName}] -> Span: ${spanId?.slice(0, 16)}... | Cost: $${cost || '0.000000'}`);
  return { answer, spanId };
}

async function main() {
  console.log('\n======================================================');
  console.log('⚡ AetherTrace 30-Second Quickstart Execution');
  console.log('======================================================\n');

  // Verify proxy server is reachable
  const healthCheck = await fetch('http://localhost:4000/health').catch(() => null);
  if (!healthCheck || !healthCheck.ok) {
    console.error('❌ AetherTrace proxy is not running at http://localhost:4000');
    console.error('   Start it in another terminal: pnpm start (or npx aethertrace start)\n');
    process.exit(1);
  }

  const runName = `Quickstart-Incident-Analysis-${Date.now().toString().slice(-4)}`;

  await traceRun(runName, { mockUpstream: true }, async () => {
    // Step 1: Planner Agent
    console.log('▶ Step 1: Dispatching Planner Agent...');
    const step1 = await traceAgent('Planner', async () => {
      return callModel('Planner', 'Triage payment webhook failure pattern');
    });

    // Step 2: Researcher Agent (Chained to Planner)
    console.log('▶ Step 2: Dispatching Researcher Agent...');
    const step2 = await traceAgent('Researcher', { parentSpanId: step1.spanId }, async () => {
      return callModel('Researcher', `Investigate idempotency key collisions for: ${step1.answer}`);
    });

    // Step 3: Implementation Coder Agent (Chained to Researcher)
    console.log('▶ Step 3: Dispatching Coder Agent...');
    await traceAgent('Coder', { parentSpanId: step2.spanId }, async () => {
      return callModel('Coder', `Write patch with distributed Redis lock: ${step2.answer}`, 'gpt-4o-mini');
    });
  });

  console.log('\n======================================================');
  console.log(`✨ Run Captured: "${runName}"`);
  console.log('💻 Open Flight Deck to inspect execution DAG:');
  console.log('   http://localhost:3000');
  console.log('======================================================\n');
}

main().catch(console.error);
