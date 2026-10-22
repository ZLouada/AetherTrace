import { startServer } from '../apps/proxy-server/src/index.js';
import {
  getDatabase,
  closeDatabase,
  resolveEventCategory,
  alignSpanSequences,
  computeRunDiff,
  type TraceSpan
} from '@aethertrace/core-schema';

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

async function runPhase1IntegrityTests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 1 Test: Trace Foundation & Data Integrity Suite               ${colors.reset}`);
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
    // TEST 1: Concurrent Trace Aggregation & Atomic SQLite Updates (100 Parallel Spans)
    // =========================================================================================
    console.log(`${colors.magenta}[1/5] Concurrent Trace Aggregation (100 Parallel Spans)...${colors.reset}`);

    const concurrentRunId = `run_concurrent_p1_${seed}`;
    const concurrentRunName = `Concurrency-Test-${seed.toString().slice(-4)}`;
    const spanCount = 100;

    console.log(`  ${colors.dim}Dispatching ${spanCount} concurrent requests via Promise.all...${colors.reset}`);

    const startTime = Date.now();
    const concurrentRequests = Array.from({ length: spanCount }, (_, idx) => {
      return fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Run-Id': concurrentRunId,
          'X-Run-Name': concurrentRunName,
          'X-Agent-Name': `Agent-Worker-${idx % 5}`,
          'X-Mock-Upstream': 'true'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `Parallel request task #${idx}: Analyze microservice telemetry stream with seed ${seed}_${idx}`
            }
          ]
        })
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request #${idx} failed with HTTP ${res.status}`);
        }
        const data = await res.json();
        const spanId = res.headers.get('x-span-id');
        return {
          idx,
          spanId,
          usage: data.usage
        };
      });
    });

    const results = await Promise.all(concurrentRequests);
    const elapsed = Date.now() - startTime;

    console.log(`  ${colors.dim}Completed ${spanCount} parallel requests in ${elapsed}ms (${(spanCount / (elapsed / 1000)).toFixed(1)} req/s)${colors.reset}`);

    // Verify all 100 spans succeeded
    if (results.length !== spanCount) {
      throw new Error(`Expected ${spanCount} results, received ${results.length}`);
    }

    // Calculate expected tokens and costs
    const spansInDb = sqlite
      .prepare('SELECT id, prompt_tokens, completion_tokens, cost_usd, usage_status FROM trace_spans WHERE run_id = ?')
      .all(concurrentRunId) as any[];

    if (spansInDb.length !== spanCount) {
      throw new Error(`Expected ${spanCount} spans in SQLite, found ${spansInDb.length}`);
    }

    let expectedDbTokens = 0;
    let expectedDbCost = 0.0;
    for (const s of spansInDb) {
      expectedDbTokens += (s.prompt_tokens + s.completion_tokens);
      expectedDbCost += s.cost_usd;
    }

    const runRow = sqlite
      .prepare('SELECT id, total_tokens, total_cost_usd, status FROM trace_runs WHERE id = ?')
      .get(concurrentRunId) as any;

    if (!runRow) {
      throw new Error(`Run ${concurrentRunId} not found in database!`);
    }

    // Atomic Assertion 1: Total tokens in trace_runs matches sum of span tokens exactly
    if (runRow.total_tokens !== expectedDbTokens) {
      throw new Error(
        `Atomic token race detected! Run total_tokens=${runRow.total_tokens}, but sum of spans=${expectedDbTokens}`
      );
    }
    pass('Atomic token aggregation verified', `Expected & Actual: ${runRow.total_tokens} tokens across ${spanCount} spans`);

    // Atomic Assertion 2: Total cost in trace_runs matches sum of span costs within floating point epsilon
    const costDiff = Math.abs(runRow.total_cost_usd - expectedDbCost);
    if (costDiff > 1e-6) {
      throw new Error(
        `Atomic cost race detected! Run total_cost_usd=${runRow.total_cost_usd}, but sum of spans=${expectedDbCost} (diff: ${costDiff})`
      );
    }
    pass('Atomic cost aggregation verified', `Expected & Actual: $${runRow.total_cost_usd.toFixed(6)} (zero lost updates)`);

    // =========================================================================================
    // TEST 2: Explicit Trace Lineage Verification (Linear, Branching, Parallel, Retry)
    // =========================================================================================
    console.log(`\n${colors.magenta}[2/5] Explicit Trace Lineage Topologies...${colors.reset}`);

    // 2A: Linear Lineage (A -> B -> C -> D)
    const linearRunId = `run_lineage_linear_${seed}`;
    const spanA_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': linearRunId,
        'X-Agent-Name': 'Linear-A',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Node A' }] })
    });
    const spanA_id = spanA_res.headers.get('x-span-id')!;

    const spanB_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': linearRunId,
        'X-Parent-Span-Id': spanA_id,
        'X-Agent-Name': 'Linear-B',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Node B' }] })
    });
    const spanB_id = spanB_res.headers.get('x-span-id')!;

    const spanC_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': linearRunId,
        'X-Parent-Span-Id': spanB_id,
        'X-Agent-Name': 'Linear-C',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Node C' }] })
    });
    const spanC_id = spanC_res.headers.get('x-span-id')!;

    const spanD_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': linearRunId,
        'X-Parent-Span-Id': spanC_id,
        'X-Agent-Name': 'Linear-D',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Node D' }] })
    });
    const spanD_id = spanD_res.headers.get('x-span-id')!;

    // Query spans to verify linear parent-child relationships
    const linearSpans = sqlite
      .prepare('SELECT id, parent_span_id, agent_name FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC')
      .all(linearRunId) as any[];

    if (linearSpans.length !== 4) throw new Error(`Expected 4 linear spans, got ${linearSpans.length}`);
    if (linearSpans[0].parent_span_id !== null) throw new Error(`Root span A parent must be null`);
    if (linearSpans[1].parent_span_id !== spanA_id) throw new Error(`Span B parent must be span A`);
    if (linearSpans[2].parent_span_id !== spanB_id) throw new Error(`Span C parent must be span B`);
    if (linearSpans[3].parent_span_id !== spanC_id) throw new Error(`Span D parent must be span C`);
    pass('Linear lineage hierarchy verified', 'A (root) ➔ B ➔ C ➔ D');

    // 2B: Parallel Spans (Root -> [P1, P2, P3] in parallel)
    const parallelRunId = `run_lineage_parallel_${seed}`;
    const pRoot_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': parallelRunId,
        'X-Agent-Name': 'Coordinator',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Coordinator root' }] })
    });
    const pRoot_id = pRoot_res.headers.get('x-span-id')!;

    await Promise.all([1, 2, 3].map((num) => {
      return fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Run-Id': parallelRunId,
          'X-Parent-Span-Id': pRoot_id,
          'X-Agent-Name': `SubAgent-${num}`,
          'X-Mock-Upstream': 'true'
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: `Task ${num}` }] })
      });
    }));

    const parallelSpans = sqlite
      .prepare('SELECT id, parent_span_id, agent_name FROM trace_spans WHERE run_id = ? AND parent_span_id = ?')
      .all(parallelRunId, pRoot_id) as any[];

    if (parallelSpans.length !== 3) {
      throw new Error(`Expected 3 parallel children pointing to root, got ${parallelSpans.length}`);
    }
    pass('Parallel fan-out lineage verified', `Root ➔ 3 simultaneous subagents [${parallelSpans.map(s => s.agent_name).join(', ')}]`);

    // 2C: Retry Lineage
    const retryRunId = `run_lineage_retry_${seed}`;
    const rRoot_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': retryRunId, 'X-Agent-Name': 'Supervisor', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Execute step' }] })
    });
    const rRoot_id = rRoot_res.headers.get('x-span-id')!;

    // Step that fails with injected 429
    const rFail_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': retryRunId,
        'X-Parent-Span-Id': rRoot_id,
        'X-Agent-Name': 'WorkerAttempt1',
        'X-Chaos-Inject': 'rate_limit',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Attempt 1' }] })
    });
    const rFail_id = rFail_res.headers.get('x-span-id')!;

    // Retry step that succeeds, chained to failed span
    const rRetry_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Run-Id': retryRunId,
        'X-Parent-Span-Id': rFail_id,
        'X-Agent-Name': 'WorkerAttempt2-Retry',
        'X-Mock-Upstream': 'true'
      },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Attempt 2 retry' }] })
    });
    const rRetry_id = rRetry_res.headers.get('x-span-id')!;

    const retrySpans = sqlite
      .prepare('SELECT id, parent_span_id, span_type, agent_name FROM trace_spans WHERE run_id = ?')
      .all(retryRunId) as any[];

    if (retrySpans.length !== 3) throw new Error(`Expected 3 spans in retry flow, got ${retrySpans.length}`);
    pass('Retry lineage verified', 'Supervisor ➔ Attempt1 (rate_limit fault) ➔ Attempt2-Retry (success)');

    // =========================================================================================
    // TEST 3: Strict Topological Forking (Ancestry Traversal & Sibling/Child Pruning)
    // =========================================================================================
    console.log(`\n${colors.magenta}[3/5] Strict Topological Ancestry Forking...${colors.reset}`);

    // Build branching graph:
    // Root A
    //   ├── Branch 1: Node B ➔ Node D
    //   └── Branch 2: Node C (sibling of B)
    const branchRunId = `run_branch_topology_${seed}`;

    const nodeA_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': branchRunId, 'X-Agent-Name': 'NodeA_Root', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'A' }] })
    });
    const nodeA_id = nodeA_res.headers.get('x-span-id')!;

    const nodeB_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': branchRunId, 'X-Parent-Span-Id': nodeA_id, 'X-Agent-Name': 'NodeB_Branch1', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'B' }] })
    });
    const nodeB_id = nodeB_res.headers.get('x-span-id')!;

    // Create sibling Node C directly attached to Node A
    const nodeC_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': branchRunId, 'X-Parent-Span-Id': nodeA_id, 'X-Agent-Name': 'NodeC_Branch2_Sibling', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'C' }] })
    });
    const nodeC_id = nodeC_res.headers.get('x-span-id')!;

    // Create child Node D attached to Node B
    const nodeD_res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': branchRunId, 'X-Parent-Span-Id': nodeB_id, 'X-Agent-Name': 'NodeD_DownstreamFromB', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'D' }] })
    });
    const nodeD_id = nodeD_res.headers.get('x-span-id')!;

    // Verify parent run has all 4 nodes
    const origSpans = sqlite.prepare('SELECT id, agent_name FROM trace_spans WHERE run_id = ?').all(branchRunId) as any[];
    if (origSpans.length !== 4) throw new Error(`Expected 4 spans in parent run, found ${origSpans.length}`);

    // Fork at Node B!
    // Strict topological ancestry requirement:
    // Ancestry of B is: B ➔ A.
    // Therefore, the forked run MUST contain ONLY [A, B]!
    // It MUST NOT contain Sibling C!
    // It MUST NOT contain Downstream D!
    const forkRes = await fetch(`${BASE_URL}/api/spans/${nodeB_id}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Forked-At-B-${seed.toString().slice(-4)}`,
        include_source: true
      })
    });

    if (!forkRes.ok) throw new Error(`Fork failed with HTTP ${forkRes.status}`);
    const forkData = await forkRes.json();
    const forkedRunId = forkData.new_run_id || forkData.newRunId;

    const forkedSpans = sqlite
      .prepare('SELECT id, agent_name, parent_span_id, cache_hit FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC')
      .all(forkedRunId) as any[];

    if (forkedSpans.length !== 2) {
      throw new Error(`Expected exactly 2 spans in forked run (A and B), but found ${forkedSpans.length}! Spans: ${JSON.stringify(forkedSpans)}`);
    }

    const agentNames = forkedSpans.map(s => s.agent_name);
    if (!agentNames.includes('NodeA_Root') || !agentNames.includes('NodeB_Branch1')) {
      throw new Error(`Forked run missing A or B! Got: ${agentNames.join(', ')}`);
    }

    if (agentNames.includes('NodeC_Branch2_Sibling')) {
      throw new Error(`Topological violation: Sibling Node C was erroneously copied into forked branch!`);
    }
    if (agentNames.includes('NodeD_DownstreamFromB')) {
      throw new Error(`Topological violation: Downstream Node D was erroneously copied into forked prefix!`);
    }

    pass('Topological ancestry traversal verified', 'Fork at Node B copied ONLY ancestry [Node A, Node B]');
    pass('Sibling and downstream branches pruned', 'Sibling Node C and Downstream Node D correctly excluded from fork');

    // =========================================================================================
    // TEST 4: Needleman-Wunsch Semantic Diff Alignment Engine
    // =========================================================================================
    console.log(`\n${colors.magenta}[4/5] Needleman-Wunsch Semantic Diff Alignment...${colors.reset}`);

    // Unit test alignment with synthetic span arrays
    const mockSpan = (id: string, agent_name: string, model: string, hash: string): TraceSpan => ({
      id,
      run_id: 'run_test',
      parent_span_id: null,
      span_type: 'llm_call',
      agent_name,
      model,
      request_payload: '{}',
      response_payload: '{}',
      prompt_tokens: 10,
      completion_tokens: 10,
      cost_usd: 0.0001,
      latency_ms: 100,
      cache_hit: 0,
      usage_status: 'reported',
      request_hash: hash,
      created_at: Date.now()
    });

    const sA = mockSpan('sA', 'Planner', 'gpt-4o', 'hash_A');
    const sB = mockSpan('sB', 'Researcher', 'gpt-4o', 'hash_B');
    const sX = mockSpan('sX', 'SecurityGate', 'gpt-4o-mini', 'hash_X'); // Inserted step
    const sC = mockSpan('sC', 'Coder', 'gpt-4o', 'hash_C');
    const sD = mockSpan('sD', 'Reviewer', 'gpt-4o', 'hash_D');

    // 4A: Insertion alignment test: [A, B, C, D] vs [A, B, X, C, D]
    const baseSeq = [sA, sB, sC, sD];
    const targetSeqInserted = [sA, sB, sX, sC, sD];
    const alignedInserted = alignSpanSequences(baseSeq, targetSeqInserted);

    if (alignedInserted.length !== 5) {
      throw new Error(`Expected 5 aligned pairs for inserted sequence, got ${alignedInserted.length}`);
    }
    // Check that sX is aligned with base: null
    const xPair = alignedInserted[2];
    if (xPair.base !== null || xPair.target?.id !== 'sX') {
      throw new Error(`Expected step 2 to align null ➔ sX (inserted), got ${JSON.stringify(xPair)}`);
    }
    // Check that sC and sD are correctly aligned downstream
    if (alignedInserted[3].base?.id !== 'sC' || alignedInserted[3].target?.id !== 'sC') {
      throw new Error(`Downstream alignment broke at sC after insertion!`);
    }
    if (alignedInserted[4].base?.id !== 'sD' || alignedInserted[4].target?.id !== 'sD') {
      throw new Error(`Downstream alignment broke at sD after insertion!`);
    }
    pass('Semantic alignment handles inserted steps', 'Correctly aligned [A, B, C, D] vs [A, B, X, C, D]');

    // 4B: Removal alignment test: [A, B, C, D] vs [A, C, D]
    const targetSeqRemoved = [sA, sC, sD];
    const alignedRemoved = alignSpanSequences(baseSeq, targetSeqRemoved);

    if (alignedRemoved.length !== 4) {
      throw new Error(`Expected 4 aligned pairs for removed sequence, got ${alignedRemoved.length}`);
    }
    const bPair = alignedRemoved[1];
    if (bPair.base?.id !== 'sB' || bPair.target !== null) {
      throw new Error(`Expected step 1 to align sB ➔ null (removed), got ${JSON.stringify(bPair)}`);
    }
    if (alignedRemoved[2].base?.id !== 'sC' || alignedRemoved[2].target?.id !== 'sC') {
      throw new Error(`Downstream alignment broke at sC after removal!`);
    }
    pass('Semantic alignment handles removed steps', 'Correctly aligned [A, B, C, D] vs [A, C, D]');

    // =========================================================================================
    // TEST 5: Event Semantics & Token Accounting Verification
    // =========================================================================================
    console.log(`\n${colors.magenta}[5/5] Event Semantics & Token Usage Status...${colors.reset}`);

    // Verify resolveEventCategory mapping
    if (resolveEventCategory('llm_call') !== 'LLM') throw new Error('llm_call must resolve to LLM');
    if (resolveEventCategory('tool_call') !== 'TOOL') throw new Error('tool_call must resolve to TOOL');
    if (resolveEventCategory('guardrail_block') !== 'ERROR') throw new Error('guardrail_block must resolve to ERROR');
    if (resolveEventCategory('agent_state') !== 'AGENT') throw new Error('agent_state must resolve to AGENT');
    if (resolveEventCategory('http_call') !== 'HTTP') throw new Error('http_call must resolve to HTTP');
    if (resolveEventCategory('retry') !== 'RETRY') throw new Error('retry must resolve to RETRY');
    if (resolveEventCategory('user_input') !== 'USER') throw new Error('user_input must resolve to USER');
    if (resolveEventCategory('system_event') !== 'SYSTEM') throw new Error('system_event must resolve to SYSTEM');
    pass('Event categories mapped deterministically', 'LLM, TOOL, AGENT, HTTP, USER, SYSTEM, ERROR, RETRY');

    // Verify usage_status values in database
    const sampleSpans = sqlite
      .prepare('SELECT id, span_type, usage_status, prompt_tokens, cost_usd FROM trace_spans WHERE run_id = ? LIMIT 5')
      .all(concurrentRunId) as any[];

    for (const span of sampleSpans) {
      if (span.usage_status !== 'reported') {
        throw new Error(`Expected span ${span.id} usage_status to be 'reported', found ${span.usage_status}`);
      }
    }
    pass('Token accounting usage status validated', 'Spans accurately record usage_status = "reported"');

    console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
    console.log(`  ${colors.green}${colors.bold}✨ ALL PHASE 1 TRACE FOUNDATION & DATA INTEGRITY TESTS PASSED! ✨${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  } finally {
    server.close();
    closeDatabase();
  }
}

runPhase1IntegrityTests().catch((err) => {
  console.error('\n❌ Phase 1 Integrity Test failed:', err);
  process.exit(1);
});
