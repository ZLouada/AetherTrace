/**
 * AetherTrace Tool Execution & Retry Chains Example
 *
 * Demonstrates:
 * 1. Tracking tool invocations (name, arguments, return output)
 * 2. Capturing tool errors and rate limit failures
 * 3. Structured retry chains linking the retry attempt back to the failing call
 */

import { traceRun, traceAgent, traceTool, traceRetry, getTraceHeaders } from '../../packages/sdk-ts/src/index.js';

const PROXY_URL = 'http://localhost:4000/v1/chat/completions';

async function simulateDatabaseQuery(query: string, attempt: number = 1) {
  // Simulate rate limit or timeout on attempt 1, success on attempt 2
  if (attempt === 1) {
    throw new Error('DatabaseConnectionTimeout: connection pool exhausted (simulated)');
  }
  return { status: 'success', rows: [{ id: 101, status: 'active', balance: 4500.0 }] };
}

async function main() {
  console.log('\n======================================================');
  console.log('🛠️ Tool Execution, Failure Capture & Structured Retries');
  console.log('======================================================\n');

  const runName = `Tool-Retry-Pipeline-${Date.now().toString().slice(-4)}`;

  await traceRun(runName, { mockUpstream: true }, async () => {
    await traceAgent('DatabaseOperator', async () => {
      console.log('▶ Step 1: Agent decides to call query_postgres tool...');

      let initialSpanId = 'span_tool_query_001';
      let retrySuccess = false;

      // First Tool Attempt (Fails)
      try {
        await traceTool('query_postgres', { sql: 'SELECT * FROM accounts WHERE id = 101' }, async () => {
          console.log('  • Attempt 1: Executing query_postgres...');
          await simulateDatabaseQuery('SELECT * FROM accounts', 1);
        });
      } catch (err: any) {
        console.log(`  ⚠️ Attempt 1 failed with error: "${err.message}"`);
        console.log('  ▶ Step 2: Agent initiates structured retry attempt #1...');

        // Explicit Structured Retry
        await traceRetry(initialSpanId, 1, err.message, async () => {
          await traceTool('query_postgres', { sql: 'SELECT * FROM accounts WHERE id = 101', retry: 1 }, async () => {
            console.log('  • Attempt 2: Re-executing query_postgres with backoff...');
            const result = await simulateDatabaseQuery('SELECT * FROM accounts', 2);
            console.log('  ✔ Attempt 2 succeeded cleanly:', JSON.stringify(result.rows[0]));
            retrySuccess = true;
          });
        });
      }

      if (retrySuccess) {
        console.log('▶ Step 3: Agent synthesizes result for user.');
      }
    });
  });

  console.log('\n======================================================');
  console.log(`✨ Run Completed: "${runName}"`);
  console.log('💻 Inspect tool calls and retry relationships in Flight Deck:');
  console.log('   http://localhost:3000');
  console.log('======================================================\n');
}

main().catch(console.error);
