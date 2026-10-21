import { startServer } from '../apps/proxy-server/src/index.js';
import { traceRun, traceAgent, withSpan, createTracedFetch } from '../packages/sdk-ts/src/index.js';
import { getDatabase, closeDatabase } from '@aethertrace/core-schema';

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

async function runE2ETest() {
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}    AetherTrace Phase 3 E2E Test: Auto-Context SDK & .trace Bundles     ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}\n`);

  const PORT = 4000;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log(`${colors.yellow}▶ Starting local proxy server on port ${PORT}...${colors.reset}`);
  const { server } = startServer(PORT);
  await sleep(350);

  try {
    const tracedFetch = createTracedFetch(BASE_URL);
    const seed = Date.now();
    let capturedRunId = '';
    let architectSpanId = '';

    // -----------------------------------------------------------------------------------------
    // 1. Auto-Context Propagation SDK Test
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[1/3] Automatic Context Propagation via Node AsyncLocalStorage${colors.reset}`);

    await traceRun('SDK-Automated-DAG', { maxBudgetUsd: 0.15, mockUpstream: true }, async () => {
      // Step A: Architect
      const res1 = await traceAgent('Architect', async () => {
        const r = await tracedFetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: `Design distributed stream ingest pipeline [Seed:${seed}]` }]
          })
        });
        return r.json();
      });

      const { sqlite } = getDatabase();
      const firstSpan = sqlite.prepare("SELECT id, run_id, agent_name FROM trace_spans WHERE agent_name = 'Architect' ORDER BY created_at DESC LIMIT 1").get() as any;
      if (!firstSpan) throw new Error('Architect span not recorded in SQLite');
      capturedRunId = firstSpan.run_id;
      architectSpanId = firstSpan.id;
      pass('Architect node auto-injected headers', `RunId: ${capturedRunId.slice(0, 16)}..., SpanId: ${architectSpanId.slice(0, 16)}...`);

      // Step B: Engineer (Nested DAG Child using withSpan)
      await withSpan(architectSpanId, async () => {
        await traceAgent('Engineer', async () => {
          await tracedFetch('/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{ role: 'user', content: 'Implement zero-copy memory pool in C++' }]
            })
          });
        });
      });

      const engSpan = sqlite.prepare("SELECT id, parent_span_id, agent_name FROM trace_spans WHERE agent_name = 'Engineer' ORDER BY created_at DESC LIMIT 1").get() as any;
      if (!engSpan) throw new Error('Engineer span not recorded in SQLite');
      if (engSpan.parent_span_id !== architectSpanId) {
        throw new Error(`Expected parent_span_id '${architectSpanId}', got '${engSpan.parent_span_id}'`);
      }
      pass('Engineer node automatically linked parent_span_id via AsyncLocalStorage', `Parent: ${engSpan.parent_span_id.slice(0, 16)}...`);

      // Step C: Auditor (Nested DAG Child of Engineer)
      await withSpan(engSpan.id, async () => {
        await traceAgent('Auditor', async () => {
          await tracedFetch('/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: 'Verify buffer overflow safety' }]
            })
          });
        });
      });

      const auditorSpan = sqlite.prepare("SELECT id, parent_span_id, agent_name FROM trace_spans WHERE agent_name = 'Auditor' ORDER BY created_at DESC LIMIT 1").get() as any;
      if (!auditorSpan || auditorSpan.parent_span_id !== engSpan.id) {
        throw new Error('Auditor span not properly linked');
      }
      pass('Auditor node chained in DAG hierarchy', `Parent: ${auditorSpan.parent_span_id.slice(0, 16)}...`);
    });

    // -----------------------------------------------------------------------------------------
    // 2. Portable .trace.json Export Test
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[2/3] Portable .trace Bundle Export (Wireshark .pcap Equivalent)${colors.reset}`);
    const exportRes = await fetch(`${BASE_URL}/api/runs/${capturedRunId}/export`);
    if (!exportRes.ok) throw new Error(`Export failed: ${exportRes.status}`);

    const contentDisp = exportRes.headers.get('content-disposition');
    if (!contentDisp || !contentDisp.includes('.trace.json')) {
      throw new Error(`Expected Content-Disposition attachment header, got: ${contentDisp}`);
    }

    const exportedBundle = await exportRes.json();
    if (exportedBundle.version !== '1.0') throw new Error(`Expected version 1.0, got ${exportedBundle.version}`);
    if (!exportedBundle.run || exportedBundle.run.id !== capturedRunId) throw new Error('Exported run mismatch');
    if (!Array.isArray(exportedBundle.spans) || exportedBundle.spans.length !== 3) {
      throw new Error(`Expected 3 spans in exported bundle, got ${exportedBundle.spans?.length}`);
    }
    pass('Exported self-contained .trace.json bundle', `Spans: ${exportedBundle.spans.length}, Version: ${exportedBundle.version}`);

    // -----------------------------------------------------------------------------------------
    // 3. Portable .trace.json Import Test
    // -----------------------------------------------------------------------------------------
    console.log(`\n${colors.magenta}[3/3] Portable .trace Bundle Import & SQLite Reconstruction${colors.reset}`);
    const reimportRunId = `run_reimported_${seed}`;

    const importRes = await fetch(`${BASE_URL}/api/runs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...exportedBundle,
        run_id_override: reimportRunId,
        run_name_override: 'Imported-Teammate-Trace-BugReport'
      })
    });

    if (importRes.status !== 201) throw new Error(`Import failed with status: ${importRes.status}`);
    const importData = await importRes.json();
    pass('Imported .trace.json into SQLite with HTTP 201', `Target RunId: ${importData.runId}`);

    const { sqlite } = getDatabase();
    const importedRun = sqlite.prepare('SELECT * FROM trace_runs WHERE id = ?').get(reimportRunId) as any;
    if (!importedRun) throw new Error('Imported run not found in SQLite trace_runs');
    if (importedRun.total_tokens !== exportedBundle.run.total_tokens) {
      throw new Error('Total tokens mismatch between exported and imported run');
    }

    const importedSpans = sqlite.prepare('SELECT * FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC').all(reimportRunId) as any[];
    if (importedSpans.length !== 3) {
      throw new Error(`Expected 3 imported spans, found ${importedSpans.length}`);
    }

    const originalAgents = exportedBundle.spans.map((s: any) => s.agent_name);
    const restoredAgents = importedSpans.map((s: any) => s.agent_name);
    pass('Reconstructed exact execution DAG topology', `Agents: [${restoredAgents.join(' -> ')}]`);

    console.log(`\n${colors.green}${colors.bold}========================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✨ ALL PHASE 3 SDK & .TRACE BUNDLE TESTS PASSED! ✨                    ${colors.reset}`);
    console.log(`${colors.green}${colors.bold}========================================================================${colors.reset}\n`);

  } finally {
    server.close();
    closeDatabase();
  }
}

runE2ETest().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}FATAL ERROR IN SDK E2E TEST:${colors.reset}`, err);
  process.exit(1);
});
