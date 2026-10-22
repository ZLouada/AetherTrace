/**
 * AetherTrace Multi-Agent Hierarchy & Fan-Out Example
 *
 * Demonstrates:
 * 1. Nested agent hierarchies (Supervisor -> Director -> Worker)
 * 2. Parallel fan-out agent branches (Worker Alpha and Worker Beta running concurrently)
 * 3. Topological ancestry linking without manual parameter passing
 */

import { traceRun, traceAgent, getTraceHeaders } from '../../packages/sdk-ts/src/index.js';

const PROXY_URL = 'http://localhost:4000/v1/chat/completions';

async function executeAgentCall(agentName: string, role: string, task: string) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mock-Upstream': 'true',
      ...getTraceHeaders()
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Role: ${role}. Agent: ${agentName}.` },
        { role: 'user', content: task }
      ]
    })
  });

  const spanId = response.headers.get('x-span-id');
  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content || `${agentName} finished task.`;
  console.log(`    • [${agentName}] Task completed (Span: ${spanId?.slice(0, 16)}...)`);
  return { spanId, summary };
}

async function main() {
  console.log('\n======================================================');
  console.log('🤖 Multi-Agent Nested Hierarchy & Parallel Fan-Out');
  console.log('======================================================\n');

  const runName = `MultiAgent-Audit-Workflow-${Date.now().toString().slice(-4)}`;

  await traceRun(runName, { mockUpstream: true }, async () => {
    // 1. Supervisor root agent
    console.log('▶ Step 1: Supervisor initializes engagement...');
    const supervisor = await traceAgent('Supervisor', async () => {
      return executeAgentCall('Supervisor', 'Lead Architect', 'Analyze smart contract security boundary');
    });

    // 2. Parallel Fan-Out: SubAgent Alpha & SubAgent Beta
    console.log('▶ Step 2: Supervisor branches into parallel worker agents...');
    await Promise.all([
      traceAgent('StaticAnalyzer_Alpha', { parentSpanId: supervisor.spanId }, async () => {
        return executeAgentCall('StaticAnalyzer_Alpha', 'Vulnerability Scanner', 'Scan reentrancy patterns');
      }),
      traceAgent('FormalVerifier_Beta', { parentSpanId: supervisor.spanId }, async () => {
        return executeAgentCall('FormalVerifier_Beta', 'Mathematical Verifier', 'Verify invariant state bounds');
      })
    ]);

    // 3. Nested Synthesis Agent
    console.log('▶ Step 3: Synthesis Agent compiles findings...');
    await traceAgent('SynthesisDirector', { parentSpanId: supervisor.spanId }, async () => {
      return executeAgentCall('SynthesisDirector', 'Security Officer', 'Produce final cryptographic audit report');
    });
  });

  console.log('\n======================================================');
  console.log(`✨ Run Completed: "${runName}"`);
  console.log('💻 Inspect parallel branches in Flight Deck:');
  console.log('   http://localhost:3000');
  console.log('======================================================\n');
}

main().catch(console.error);
