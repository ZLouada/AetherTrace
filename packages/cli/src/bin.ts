#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, executeVariantReplay } from '@aethertrace/proxy-server';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  computeRunDiff,
  captureFullProvenance,
  compareRunProvenance,
  executeSearch,
  rebuildSearchIndex,
  discoverErrors,
  analyzeExecutionIntelligence,
  createExperiment,
  getExperiment,
  listExperiments,
  deleteExperiment,
  createVariant,
  getVariant,
  compareExperimentVariants,
  getReplayHistory,
  experiments,
  experiment_variants,
  runEvaluation,
  getEvaluation,
  listEvaluations,
  exportEvaluationAsJson,
  exportEvaluationAsMarkdown,
  parseAssertionRule,
  type TraceRun,
  type TraceSpan,
  type RunDiffResult,
  type RegressionAssertionResult,
  type RunProvenance,
  type ProvenanceComparisonResult,
  type SearchResult,
  type ExperimentMutation,
  type ReplayMode,
  type EvaluationReport,
  type AssertionRule
} from '@aethertrace/core-schema';
import { eq, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

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

const CLI_VERSION = '0.1.0';

function printBanner() {
  console.log(`
${colors.cyan}${colors.bold}     ___         _   _               _____                     
    / _ \\  ___  | |_| |__   ___ _ __|_   _| __ __ _  ___ ___   
   / /_\\ \\/ _ \\ | __| '_ \\ / _ \\ '__| | || '__/ _\` |/ __/ _ \\  
  |  _  |  __/ | |_| | | |  __/ |    | || | | (_| | (_|  __/  
  |_| |_|\\___|  \\__|_| |_|\\___|_|    |_||_|  \\__,_|\\___\\___|  
           ⚡ Local-First Wireshark for AI Agents ⚡${colors.reset}
`);
}

function printVersion() {
  console.log(`aethertrace v${CLI_VERSION}`);
}

function printHelp() {
  printBanner();
  console.log(`${colors.bold}USAGE:${colors.reset}`);
  console.log(`  npx aethertrace <command> [options]\n`);
  console.log(`${colors.bold}COMMANDS:${colors.reset}`);
  console.log(`  ${colors.green}start${colors.reset}                      Launch local proxy server (port 4000) & event bus`);
  console.log(`  ${colors.green}sim${colors.reset}                        Execute a 5-step autonomous multi-agent simulation`);
  console.log(`  ${colors.green}inspect <run_id>${colors.reset}           Inspect run details, Git, environment, and lineage`);
  console.log(`  ${colors.green}provenance <run_id> [--json]${colors.reset} Display machine/human-readable execution provenance`);
  console.log(`  ${colors.green}compare <run_a> <run_b>${colors.reset}     Compare environment and Git provenance between two runs`);
  console.log(`  ${colors.green}reproduce <run_id>${colors.reset}          Analyze reproducibility requirements against current tree`);
  console.log(`  ${colors.green}diff <base_id> <target_id>${colors.reset} Compare two runs side-by-side in an ASCII diff matrix`);
  console.log(`  ${colors.green}assert <trace.json>${colors.reset}        Assert budget, latency SLA, and zero-breaker status`);
  console.log(`  ${colors.green}export <run_id>${colors.reset}            Export a run to a portable .trace.json bundle`);
  console.log(`  ${colors.green}import <file.json>${colors.reset}         Import a .trace.json bundle into local SQLite`);
  console.log(`  ${colors.green}search <query> [--limit <n>] [--json]${colors.reset} Global search across runs, spans, events, and errors`);
  console.log(`  ${colors.green}search rebuild${colors.reset}              Rebuild search index projection from trace database`);
  console.log(`  ${colors.green}errors [--limit <n>] [--json]${colors.reset} Cross-run error aggregation and failure discovery`);
  console.log(`  ${colors.green}experiment list [--json]${colors.reset}     List all experiments and variant summaries`);
  console.log(`  ${colors.green}experiment create <run_id>${colors.reset}   Create an experiment from a source run`);
  console.log(`  ${colors.green}experiment inspect <exp_id>${colors.reset}  Inspect an experiment and its configured variants`);
  console.log(`  ${colors.green}experiment variant-add <id>${colors.reset}  Add a variant with mutations to an experiment`);
  console.log(`  ${colors.green}experiment run <exp_id>${colors.reset}      Batch replay all variants with bounded concurrency`);
  console.log(`  ${colors.green}experiment compare <exp_id>${colors.reset}  Multi-variant scorecard and cost/latency comparison`);
  console.log(`  ${colors.green}evaluate list [--json]${colors.reset}       List evaluation records and quality scores`);
  console.log(`  ${colors.green}evaluate run <run_id>${colors.reset}        Run evaluation with assertions on a trace run`);
  console.log(`  ${colors.green}evaluate assert <id> --expr <r>${colors.reset} CI assertion gate with deterministic exit codes`);
  console.log(`  ${colors.green}evaluate inspect <eval_id>${colors.reset}   Inspect full evaluation report with evidence`);
  console.log(`  ${colors.green}evaluate failures <run_id>${colors.reset}   List localized failures and culprit spans`);
  console.log(`  ${colors.green}evaluate errors <run_id>${colors.reset}     List error clusters with redacted fingerprints`);
  console.log(`  ${colors.green}evaluate optimize <run_id>${colors.reset}   List actionable optimization recommendations`);
  console.log(`  ${colors.green}evaluate compare <a_id> <b_id>${colors.reset} Compare two evaluations in a scorecard matrix`);
  console.log(`  ${colors.green}evaluate export <eval_id>${colors.reset}    Export evaluation to JSON or Markdown bundle`);
  console.log(`  ${colors.green}status${colors.reset}                      Check system health, database record counts, and memory`);
  console.log(`  ${colors.green}clean${colors.reset}                       Purge local trace database (.trace.sqlite)`);
  console.log(`  ${colors.green}version, -v, --version${colors.reset}      Display installed AetherTrace version`);
  console.log(`  ${colors.green}help, -h, --help${colors.reset}            Show this help menu\n`);
  console.log(`${colors.bold}OPTIONS:${colors.reset}`);
  console.log(`  -d, --db <path>            Path to SQLite trace database (default: auto-detected or .trace.sqlite)`);
  console.log(`  -o, --output <file>        Output destination file for export (default: run_<id>.trace.json)`);
  console.log(`  -p, --port <number>        Port to listen on (default: 4000)`);
  console.log(`  --max-cost <usd>           Max cost allowed for regression gate assert (e.g. 0.05)`);
  console.log(`  --max-latency <ms>         Max latency allowed for regression gate assert (e.g. 2000)`);
}


async function handleStart(port: number = 4000) {
  printBanner();
  const { server } = startServer(port);

  console.log(`  ${colors.bold}📡 Interceptor Proxy:${colors.reset}   ${colors.cyan}http://localhost:${port}/v1/chat/completions${colors.reset}`);
  console.log(`  ${colors.bold}🛰️ Telemetry Bus:${colors.reset}       ${colors.cyan}ws://localhost:${port}/ws${colors.reset}`);
  console.log(`  ${colors.bold}💻 Flight Deck UI:${colors.reset}      ${colors.magenta}http://localhost:3000${colors.reset}`);
  console.log(`  ${colors.bold}💾 Local Storage:${colors.reset}       ${colors.yellow}.trace.sqlite (WAL mode)${colors.reset}\n`);
  console.log(`${colors.dim}Press Ctrl+C to stop.${colors.reset}\n`);

  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Shutting down AetherTrace proxy...${colors.reset}`);
    server.close();
    process.exit(0);
  });
}

async function handleSim() {
  printBanner();
  console.log(`${colors.yellow}▶ Dispatching 5-step autonomous agent DAG simulation...${colors.reset}\n`);
  const BASE_URL = 'http://localhost:4000';

  const healthRes = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!healthRes || !healthRes.ok) {
    console.error(`${colors.red}✖ Error:${colors.reset} AetherTrace proxy is not running on port 4000.`);
    console.log(`Run ${colors.cyan}npx aethertrace start${colors.reset} first or start via ${colors.cyan}pnpm dev${colors.reset}.`);
    process.exit(1);
  }

  const seed = Date.now();
  const runId = `run_cli_sim_${seed}`;
  const runName = `CLI-MultiAgent-Run-${seed.toString().slice(-4)}`;

  // 1. Planner
  const r1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': runId, 'X-Run-Name': runName, 'X-Agent-Name': 'Planner', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Deconstruct system task requirements' }] })
  });
  console.log(`  ${colors.green}✔ Planner node created${colors.reset} (gpt-4o)`);

  const { sqlite } = getDatabase();
  const pSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC LIMIT 1').get(runId) as any;

  // 2. Researcher
  await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': runId, 'X-Parent-Span-Id': pSpan.id, 'X-Agent-Name': 'Researcher', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Investigate benchmarks' }] })
  });
  console.log(`  ${colors.green}✔ Researcher node created${colors.reset} (Parent: Planner)`);

  // 3. Coder
  const rSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as any;
  await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': runId, 'X-Parent-Span-Id': rSpan.id, 'X-Agent-Name': 'Coder', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'Implement zero-copy buffer' }] })
  });
  console.log(`  ${colors.green}✔ Coder node created${colors.reset} (Parent: Researcher)`);

  // 4. Reviewer
  const cSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(runId) as any;
  await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': runId, 'X-Parent-Span-Id': cSpan.id, 'X-Agent-Name': 'Reviewer', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Security audit' }] })
  });
  console.log(`  ${colors.green}✔ Reviewer node created${colors.reset} (Parent: Coder)`);

  // 5. Rogue Loop Breaker
  for (let i = 0; i < 3; i++) {
    await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': runId, 'X-Parent-Span-Id': cSpan.id, 'X-Agent-Name': 'Rogue Loop Agent', 'X-Replay-Mode': 'false', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Recursive call without progression' }] })
    });
  }
  console.log(`  ${colors.red}${colors.bold}🛑 Rogue Loop Agent tripped circuit breaker (HTTP 429)${colors.reset}`);

  console.log(`\n${colors.green}${colors.bold}✨ Simulation complete! View the execution DAG at http://localhost:3000${colors.reset}\n`);
}

async function handleExport(runId: string, outputFile?: string) {
  if (!runId) {
    console.error(`${colors.red}Error: Missing <run_id> argument.${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();

  if (runs.length === 0) {
    console.error(`${colors.red}Error: Run '${runId}' not found in local database (.trace.sqlite).${colors.reset}`);
    process.exit(1);
  }

  const spans = db.select().from(trace_spans).where(eq(trace_spans.run_id, runId)).orderBy(asc(trace_spans.created_at)).all();

  let runProvenance: any = null;
  if (runs[0].provenance) {
    try { runProvenance = JSON.parse(runs[0].provenance); } catch {}
  }

  const bundle = {
    version: '1.0',
    exported_at: Date.now(),
    run: runs[0],
    provenance: runProvenance,
    spans
  };

  const dest = outputFile ? resolve(process.cwd(), outputFile) : resolve(process.cwd(), `run_${runId}.trace.json`);
  writeFileSync(dest, JSON.stringify(bundle, null, 2), 'utf-8');

  console.log(`  ${colors.green}✔ Exported run '${runId}' to:${colors.reset} ${dest}`);
  console.log(`  ${colors.dim}Nodes bundled: ${spans.length}, Total spend: $${runs[0].total_cost_usd.toFixed(6)}${colors.reset}`);
}

export async function handleImport(filePath: string, log: boolean = true) {
  if (!filePath) {
    console.error(`${colors.red}Error: Missing <file.trace.json> path.${colors.reset}`);
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    console.error(`${colors.red}Error: File not found: ${resolvedPath}${colors.reset}`);
    process.exit(1);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  let bundle: any;
  try {
    bundle = JSON.parse(content);
  } catch (err: any) {
    console.error(`${colors.red}Error parsing JSON file: ${err.message}${colors.reset}`);
    process.exit(1);
  }

  const runData = bundle.run || bundle;
  const spansData = bundle.spans || [];

  if (!runData || !runData.id) {
    console.error(`${colors.red}Invalid .trace bundle: missing run metadata.${colors.reset}`);
    process.exit(1);
  }

  const { db, sqlite } = getDatabase();
  const now = Date.now();

  const importTx = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM trace_spans WHERE run_id = ?').run(runData.id);
    sqlite.prepare('DELETE FROM trace_runs WHERE id = ?').run(runData.id);

    const rawProv = bundle.provenance || runData.provenance;
    const provStr = typeof rawProv === 'string' ? rawProv : rawProv ? JSON.stringify(rawProv) : null;

    db.insert(trace_runs).values({
      id: runData.id,
      name: runData.name || 'imported-run',
      status: runData.status || 'completed',
      total_tokens: runData.total_tokens || 0,
      total_cost_usd: runData.total_cost_usd || 0.0,
      parent_run_id: runData.parent_run_id || null,
      forked_at_span_id: runData.forked_at_span_id || null,
      mutations: typeof runData.mutations === 'string' ? runData.mutations : runData.mutations ? JSON.stringify(runData.mutations) : null,
      provenance: provStr,
      created_at: runData.created_at || now
    }).run();

    for (const rawSpan of spansData) {
      db.insert(trace_spans).values({
        id: rawSpan.id,
        run_id: runData.id,
        parent_span_id: rawSpan.parent_span_id || null,
        span_type: rawSpan.span_type || 'llm_call',
        agent_name: rawSpan.agent_name || 'default-agent',
        model: rawSpan.model || null,
        request_payload: rawSpan.request_payload || null,
        response_payload: rawSpan.response_payload || null,
        prompt_tokens: rawSpan.prompt_tokens || 0,
        completion_tokens: rawSpan.completion_tokens || 0,
        cost_usd: rawSpan.cost_usd || 0.0,
        latency_ms: rawSpan.latency_ms || 0,
        cache_hit: rawSpan.cache_hit || 0,
        request_hash: rawSpan.request_hash || 'unknown',
        created_at: rawSpan.created_at || now
      }).run();
    }
  });

  importTx();

  if (log) {
    console.log(`  ${colors.green}✔ Imported trace '${runData.name}' (${runData.id}) into local SQLite!${colors.reset}`);
    console.log(`  ${colors.dim}Spans restored: ${spansData.length}, Status: ${runData.status}${colors.reset}`);
  }
}

export async function handleInspect(runId: string) {
  if (!runId) {
    console.error(`${colors.red}Error: Missing <run_id> argument.${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();

  if (runs.length === 0) {
    console.error(`${colors.red}Error: Run '${runId}' not found in local database (.trace.sqlite).${colors.reset}`);
    process.exit(1);
  }

  const run = runs[0];
  const spans = db.select().from(trace_spans).where(eq(trace_spans.run_id, runId)).orderBy(asc(trace_spans.created_at)).all();

  let prov: RunProvenance | null = null;
  if (run.provenance) {
    try { prov = JSON.parse(run.provenance); } catch {}
  }

  printBanner();
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}🔍 AetherTrace Run Inspector${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);

  console.log(`  ${colors.bold}Run ID:${colors.reset}        ${run.id}`);
  console.log(`  ${colors.bold}Name:${colors.reset}          ${run.name}`);
  console.log(`  ${colors.bold}Status:${colors.reset}        ${run.status === 'completed' ? colors.green : run.status === 'paused' ? colors.yellow : colors.cyan}${run.status}${colors.reset}`);
  console.log(`  ${colors.bold}Total Cost:${colors.reset}    $${run.total_cost_usd.toFixed(6)}`);
  console.log(`  ${colors.bold}Total Tokens:${colors.reset}  ${run.total_tokens}`);
  console.log(`  ${colors.bold}Spans Count:${colors.reset}   ${spans.length}\n`);

  console.log(`  ${colors.bold}--- Git Provenance ---${colors.reset}`);
  if (prov?.git) {
    console.log(`  ${colors.bold}Commit:${colors.reset}        ${prov.git.commit_sha || 'unknown'} (${prov.git.short_sha || 'N/A'})`);
    console.log(`  ${colors.bold}Branch:${colors.reset}        ${prov.git.branch || '(detached HEAD)'}`);
    console.log(`  ${colors.bold}Working Tree:${colors.reset}  ${prov.git.dirty ? `${colors.yellow}⚠ DIRTY (Uncommitted Changes)${colors.reset}` : `${colors.green}✓ CLEAN${colors.reset}`}`);
    if (prov.git.source_fingerprint) {
      console.log(`  ${colors.bold}Fingerprint:${colors.reset}   ${colors.dim}${prov.git.source_fingerprint}${colors.reset}`);
    }
  } else {
    console.log(`  ${colors.dim}(No Git provenance captured for this run)${colors.reset}`);
  }
  console.log('');

  console.log(`  ${colors.bold}--- Environment ---${colors.reset}`);
  if (prov?.environment) {
    console.log(`  ${colors.bold}Runtime:${colors.reset}       ${prov.environment.runtime.name} ${prov.environment.runtime.version}`);
    console.log(`  ${colors.bold}Platform:${colors.reset}      ${prov.environment.os} (${prov.environment.architecture})`);
    console.log(`  ${colors.bold}Pkg Manager:${colors.reset}   ${prov.environment.package_manager || 'unknown'}`);
    console.log(`  ${colors.bold}AetherTrace:${colors.reset}   v${prov.environment.aethertrace_version || '0.4.0'}`);
  } else {
    console.log(`  ${colors.dim}(No environment provenance captured)${colors.reset}`);
  }
  console.log('');

  console.log(`  ${colors.bold}--- Dependencies ---${colors.reset}`);
  if (prov?.dependencies) {
    console.log(`  ${colors.bold}Lockfile:${colors.reset}      ${prov.dependencies.lockfile_type}`);
    console.log(`  ${colors.bold}Fingerprint:${colors.reset}   ${prov.dependencies.lockfile_fingerprint ? `${colors.dim}${prov.dependencies.lockfile_fingerprint}${colors.reset}` : 'none'}`);
  } else {
    console.log(`  ${colors.dim}(No dependency lockfile captured)${colors.reset}`);
  }
  console.log('');

  console.log(`  ${colors.bold}--- Lineage & Replay ---${colors.reset}`);
  console.log(`  ${colors.bold}Parent Run:${colors.reset}    ${run.parent_run_id || 'none (root session)'}`);
  console.log(`  ${colors.bold}Fork Span:${colors.reset}     ${run.forked_at_span_id || 'none'}`);
  if (run.mutations) {
    try {
      const muts = JSON.parse(run.mutations);
      console.log(`  ${colors.bold}Mutations:${colors.reset}     ${muts.length} recorded modifications`);
    } catch {}
  }
  console.log('');

  console.log(`  ${colors.bold}--- Reproducibility Assessment ---${colors.reset}`);
  const repStatus = prov?.reproducibility?.status || 'unknown';
  const statusColor = repStatus === 'reproducible' ? colors.green : repStatus === 'dirty_worktree' ? colors.yellow : colors.red;
  console.log(`  ${colors.bold}Status:${colors.reset}        ${statusColor}${repStatus.toUpperCase()}${colors.reset}`);
  if (prov?.reproducibility?.reasons && prov.reproducibility.reasons.length > 0) {
    for (const r of prov.reproducibility.reasons) {
      console.log(`  ${colors.dim}• ${r}${colors.reset}`);
    }
  }
  console.log('');

  // Agent Intelligence (Phase 11)
  const intel = analyzeExecutionIntelligence(spans, run);
  console.log(`  ${colors.bold}--- Agent Intelligence (Phase 11) ---${colors.reset}`);
  console.log(`  ${colors.bold}Agents Detected:${colors.reset}   ${intel.agents.length} agent(s)`);
  for (const ag of intel.agents) {
    const indent = '  '.repeat(ag.depth);
    const agCol = ag.status === 'failed' ? colors.red : colors.green;
    console.log(`    ${indent}• ${colors.bold}${ag.agentName}${colors.reset} [${agCol}${ag.status.toUpperCase()}${colors.reset}] (Depth: ${ag.depth}, Spans: ${ag.spanCount}, Duration: ${(ag.durationMs / 1000).toFixed(2)}s, Cost: $${ag.totalCostUsd.toFixed(6)})`);
  }

  console.log(`\n  ${colors.bold}Critical Path:${colors.reset}     ${(intel.criticalPath.durationMs / 1000).toFixed(2)}s (${intel.criticalPath.coveragePercentage}% of run duration)`);
  console.log(`    Critical Spans:  ${intel.criticalPath.spanIds.length} span(s) on longest execution chain`);
  if (intel.criticalPath.longestSpan) {
    console.log(`    Bottleneck Span: ${intel.criticalPath.longestSpan.label} (${(intel.criticalPath.longestSpan.durationMs / 1000).toFixed(2)}s, ${intel.criticalPath.longestSpan.percentageOfCriticalPath}% of critical path)`);
  }

  if (intel.toolChains.length > 0) {
    console.log(`\n  ${colors.bold}Tool Chains:${colors.reset}       ${intel.toolChains.length} chain(s)`);
    for (const tc of intel.toolChains.slice(0, 5)) {
      console.log(`    • ${tc.agentName} → ${tc.toolName} (${tc.steps.length} step(s), ${(tc.totalDurationMs / 1000).toFixed(2)}s, ${tc.finalStatus})`);
    }
    if (intel.toolChains.length > 5) {
      console.log(`    ${colors.dim}... and ${intel.toolChains.length - 5} more tool chain(s)${colors.reset}`);
    }
  }

  if (intel.parallelGroups.length > 0) {
    console.log(`\n  ${colors.bold}Parallel Groups:${colors.reset}   ${intel.parallelGroups.length} concurrent group(s)`);
    for (const pg of intel.parallelGroups) {
      console.log(`    • Group ${pg.id.slice(0, 8)}: ${pg.branchCount} branches (${(pg.wallClockDurationMs / 1000).toFixed(2)}s wall-clock, slowest: #${pg.slowestBranchIndex + 1})`);
    }
  }

  if (intel.retryChains.length > 0 || intel.failureHotspots.totalErrors > 0) {
    console.log(`\n  ${colors.bold}Failures & Retries:${colors.reset}`);
    console.log(`    Total Errors:    ${intel.failureHotspots.totalErrors}`);
    if (intel.failureHotspots.mostRetriedOperation) {
      console.log(`    Most Retried:    ${colors.yellow}${intel.failureHotspots.mostRetriedOperation}${colors.reset}`);
    }
    if (intel.failureHotspots.mostFailedTool) {
      console.log(`    Most Failed Tool:${colors.red}${intel.failureHotspots.mostFailedTool}${colors.reset}`);
    }
    console.log(`    Retry Chains:    ${intel.retryChains.length} chain(s) (Cost: $${intel.failureHotspots.highestRetryCostUsd.toFixed(6)})`);
  }
  console.log(`\n${colors.cyan}========================================================================${colors.reset}\n`);
}

export async function handleProvenance(runId: string, options: { json?: boolean } = {}) {
  if (!runId) {
    console.error(`${colors.red}Error: Missing <run_id> argument.${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();

  if (runs.length === 0) {
    console.error(`${colors.red}Error: Run '${runId}' not found.${colors.reset}`);
    process.exit(1);
  }

  const run = runs[0];
  let prov: RunProvenance | null = null;
  if (run.provenance) {
    try { prov = JSON.parse(run.provenance); } catch {}
  }

  if (options.json) {
    console.log(JSON.stringify({ runId: run.id, runName: run.name, provenance: prov }, null, 2));
    return;
  }

  printBanner();
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}📜 AetherTrace Execution Provenance Record${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);

  console.log(`  ${colors.bold}Run:${colors.reset}           ${run.name} (${run.id})`);
  console.log(`  ${colors.bold}Git Commit:${colors.reset}    ${prov?.git?.commit_sha || 'N/A'}`);
  console.log(`  ${colors.bold}Git Branch:${colors.reset}    ${prov?.git?.branch || 'N/A'}`);
  console.log(`  ${colors.bold}Git Dirty:${colors.reset}     ${prov?.git?.dirty ? 'Yes (uncommitted code)' : 'No (clean commit)'}`);
  console.log(`  ${colors.bold}Source Hash:${colors.reset}   ${prov?.git?.source_fingerprint || 'N/A'}`);
  console.log(`  ${colors.bold}Lockfile:${colors.reset}      ${prov?.dependencies?.lockfile_type || 'N/A'}`);
  console.log(`  ${colors.bold}Lockfile Hash:${colors.reset} ${prov?.dependencies?.lockfile_fingerprint || 'N/A'}`);
  console.log(`  ${colors.bold}Runtime:${colors.reset}       ${prov?.environment?.runtime?.name || 'N/A'} ${prov?.environment?.runtime?.version || ''}`);
  console.log(`  ${colors.bold}Platform:${colors.reset}      ${prov?.environment?.os || 'N/A'}-${prov?.environment?.architecture || ''}`);
  console.log(`  ${colors.bold}Reproducible:${colors.reset}  ${prov?.reproducibility?.status || 'unknown'}`);
  console.log(`\n${colors.cyan}========================================================================${colors.reset}\n`);
}

export async function handleCompare(runAId: string, runBId: string) {
  if (!runAId || !runBId) {
    console.error(`${colors.red}Error: Missing arguments. Usage: aethertrace compare <run_a> <run_b>${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const runA = db.select().from(trace_runs).where(eq(trace_runs.id, runAId)).limit(1).all()[0];
  const runB = db.select().from(trace_runs).where(eq(trace_runs.id, runBId)).limit(1).all()[0];

  if (!runA || !runB) {
    console.error(`${colors.red}Error: One or both runs not found ('${runAId}', '${runBId}')${colors.reset}`);
    process.exit(1);
  }

  let provA: RunProvenance | null = null;
  let provB: RunProvenance | null = null;
  try { if (runA.provenance) provA = JSON.parse(runA.provenance); } catch {}
  try { if (runB.provenance) provB = JSON.parse(runB.provenance); } catch {}

  const result = compareRunProvenance(provA, provB);

  printBanner();
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}⚖️  AetherTrace Provenance Comparator${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);

  console.log(`  ${colors.bold}Run A:${colors.reset} ${runA.name} (${colors.dim}${runA.id}${colors.reset})`);
  console.log(`  ${colors.bold}Run B:${colors.reset} ${runB.name} (${colors.dim}${runB.id}${colors.reset})\n`);

  // Source section
  console.log(`  ${colors.bold}SOURCE${colors.reset}`);
  if (result.source.status === 'identical') {
    console.log(`  ${colors.green}✓ Same commit (${result.source.base_commit?.slice(0, 7) || 'clean'})${colors.reset}`);
  } else if (result.source.status === 'dirty_divergence') {
    console.log(`  ${colors.yellow}⚠ Working tree dirty or divergence detected${colors.reset}`);
  } else {
    console.log(`  ${colors.red}✗ Commit differs (${result.source.base_commit?.slice(0, 7) || 'N/A'} -> ${result.source.target_commit?.slice(0, 7) || 'N/A'})${colors.reset}`);
  }
  console.log('');

  // Dependencies section
  console.log(`  ${colors.bold}DEPENDENCIES${colors.reset}`);
  if (result.dependencies.status === 'identical') {
    console.log(`  ${colors.green}✓ Same lockfile (${result.dependencies.base_lockfile}) & fingerprint${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}✗ Dependencies differ (${result.dependencies.base_lockfile} vs ${result.dependencies.target_lockfile})${colors.reset}`);
  }
  console.log('');

  // Runtime section
  console.log(`  ${colors.bold}RUNTIME${colors.reset}`);
  if (result.runtime.status === 'identical') {
    console.log(`  ${colors.green}✓ Same runtime version (${result.runtime.base_runtime})${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}✗ Runtime differs (${result.runtime.base_runtime} -> ${result.runtime.target_runtime})${colors.reset}`);
  }
  console.log('');

  // Platform section
  console.log(`  ${colors.bold}PLATFORM${colors.reset}`);
  if (result.platform.status === 'identical') {
    console.log(`  ${colors.green}✓ Same platform (${result.platform.base_platform})${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}✗ Platform differs (${result.platform.base_platform} -> ${result.platform.target_platform})${colors.reset}`);
  }
  console.log('');

  // Scorecard
  console.log(`  ${colors.bold}--- Reproducibility Scorecard ---${colors.reset}`);
  console.log(`  ${colors.bold}Source:       ${colors.reset} ${result.scorecard.source ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`}`);
  console.log(`  ${colors.bold}Dependencies: ${colors.reset} ${result.scorecard.dependencies ? `${colors.green}✓${colors.reset}` : `${colors.yellow}✗${colors.reset}`}`);
  console.log(`  ${colors.bold}Runtime:      ${colors.reset} ${result.scorecard.runtime ? `${colors.green}✓${colors.reset}` : `${colors.yellow}✗${colors.reset}`}`);
  console.log(`  ${colors.bold}Platform:     ${colors.reset} ${result.scorecard.platform ? `${colors.green}✓${colors.reset}` : `${colors.yellow}✗${colors.reset}`}`);
  console.log(`  ${colors.bold}Git state:    ${colors.reset} ${result.scorecard.git_state ? `${colors.green}✓${colors.reset}` : `${colors.yellow}⚠${colors.reset}`}\n`);

  console.log(`  ${colors.bold}Status:${colors.reset} ${result.scorecard.status === 'reproducible' ? colors.green : colors.yellow}${result.scorecard.status.toUpperCase()}${colors.reset}`);
  console.log(`  ${colors.bold}Interpretation:${colors.reset} ${result.scorecard.interpretation}`);
  console.log(`\n${colors.cyan}========================================================================${colors.reset}\n`);

  return result;
}

export async function handleReproduce(runId: string) {
  if (!runId) {
    console.error(`${colors.red}Error: Missing <run_id> argument.${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const run = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all()[0];
  if (!run) {
    console.error(`${colors.red}Error: Run '${runId}' not found.${colors.reset}`);
    process.exit(1);
  }

  let targetProv: RunProvenance | null = null;
  try { if (run.provenance) targetProv = JSON.parse(run.provenance); } catch {}

  const currentProv = captureFullProvenance();
  const comp = compareRunProvenance(targetProv, currentProv);

  printBanner();
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}🔄 AetherTrace Run Reproduction Advisor${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);

  console.log(`  ${colors.bold}Target Run:${colors.reset}       ${run.name} (${run.id})`);
  console.log(`  ${colors.bold}Target Commit:${colors.reset}    ${targetProv?.git?.commit_sha || 'N/A'} (${targetProv?.git?.branch || 'detached'})`);
  console.log(`  ${colors.bold}Target Tree:${colors.reset}      ${targetProv?.git?.dirty ? `${colors.yellow}⚠ DIRTY${colors.reset}` : `${colors.green}✓ CLEAN${colors.reset}`}\n`);

  console.log(`  ${colors.bold}Current Tree:${colors.reset}`);
  console.log(`  ${colors.bold}Current Commit:${colors.reset}   ${currentProv.git?.commit_sha || 'N/A'} (${currentProv.git?.branch || 'detached'})`);
  console.log(`  ${colors.bold}Current State:${colors.reset}    ${currentProv.git?.dirty ? `${colors.yellow}⚠ DIRTY (Uncommitted modifications present)${colors.reset}` : `${colors.green}✓ CLEAN${colors.reset}`}\n`);

  console.log(`  ${colors.bold}--- Reproduction Analysis ---${colors.reset}`);
  if (!targetProv?.git?.commit_sha) {
    console.log(`  ${colors.red}✖ Missing historical Git provenance. Full reproduction cannot be guaranteed.${colors.reset}`);
  } else if (comp.source.same_commit && !comp.source.target_dirty && !comp.source.base_dirty) {
    console.log(`  ${colors.green}✔ Current repository exactly matches the target commit and working tree is clean.${colors.reset}`);
    console.log(`  ${colors.dim}You can safely replay this run via:${colors.reset} ${colors.cyan}npx aethertrace sim${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}⚠ Current repository state differs from target run:${colors.reset}`);
    if (!comp.source.same_commit) {
      console.log(`    • Target commit:  ${colors.cyan}${targetProv.git.commit_sha}${colors.reset}`);
      console.log(`    • Current commit: ${colors.dim}${currentProv.git?.commit_sha || 'N/A'}${colors.reset}`);
    }
    if (currentProv.git?.dirty) {
      console.log(`    • ${colors.yellow}Working tree has uncommitted modifications.${colors.reset}`);
    }
    console.log(`\n  ${colors.bold}Recommended manual reproduction steps:${colors.reset}`);
    if (currentProv.git?.dirty) {
      console.log(`    1. ${colors.cyan}git stash${colors.reset} (preserve current uncommitted changes)`);
    }
    console.log(`    ${currentProv.git?.dirty ? '2' : '1'}. ${colors.cyan}git checkout ${targetProv.git.commit_sha}${colors.reset}`);
    console.log(`    ${currentProv.git?.dirty ? '3' : '2'}. ${colors.cyan}pnpm install${colors.reset} (match dependency lockfile)`);
    console.log(`    ${currentProv.git?.dirty ? '4' : '3'}. Re-run agent script or launch replay\n`);
    console.log(`  ${colors.dim}Note: AetherTrace never automatically mutates or checks out your git working tree.${colors.reset}`);
  }

  console.log(`\n${colors.cyan}========================================================================${colors.reset}\n`);
  return comp;
}

export async function handleDiff(baseId: string, targetId: string) {
  if (!baseId || !targetId) {
    console.error(`${colors.red}Error: Missing arguments. Usage: aethertrace diff <base_run_id> <target_run_id>${colors.reset}`);
    process.exit(1);
  }

  const { db } = getDatabase();
  const diff = computeRunDiff(db, baseId, targetId);
  if (!diff) {
    console.error(`${colors.red}Error: One or both runs not found in local database (.trace.sqlite): '${baseId}', '${targetId}'${colors.reset}`);
    process.exit(1);
  }

  printBanner();
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}⚖️  AetherTrace Side-by-Side Run Diff Arena${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}\n`);

  console.log(`  ${colors.bold}Base Run:${colors.reset}   ${diff.summary.baseRunName} (${colors.dim}${diff.summary.baseRunId}${colors.reset})`);
  console.log(`  ${colors.bold}Target Run:${colors.reset} ${diff.summary.targetRunName} (${colors.dim}${diff.summary.targetRunId}${colors.reset})\n`);

  // Executive Scorecard
  const isCheaper = diff.summary.costSavingsPercent > 0;
  const costColor = isCheaper ? colors.green : diff.summary.costSavingsPercent < 0 ? colors.red : colors.dim;
  const savingsSign = diff.summary.costSavingsPercent > 0 ? '-' : '+';
  const absSavings = Math.abs(diff.summary.costSavingsPercent).toFixed(2);

  console.log(`  ${colors.bold}--- Executive Summary Scorecard ---${colors.reset}`);
  console.log(`  ${colors.bold}Cost:${colors.reset}     $${diff.summary.baseCostUsd.toFixed(6)} -> $${diff.summary.targetCostUsd.toFixed(6)}  (${costColor}${savingsSign}${absSavings}% ${isCheaper ? 'Saved 💰' : ''}${colors.reset})`);
  console.log(`  ${colors.bold}Tokens:${colors.reset}   ${diff.summary.baseTokens} -> ${diff.summary.targetTokens} (${diff.summary.tokenDelta >= 0 ? '+' : ''}${diff.summary.tokenDelta} tokens)`);
  console.log(`  ${colors.bold}Latency:${colors.reset}  ${diff.summary.baseLatencyMs}ms -> ${diff.summary.targetLatencyMs}ms (${diff.summary.latencyDeltaMs <= 0 ? colors.green : colors.yellow}${diff.summary.latencyDeltaMs >= 0 ? '+' : ''}${diff.summary.latencyDeltaMs}ms${colors.reset})\n`);

  console.log(`  ${colors.bold}--- Step-by-Step Aligned DAG Timeline ---${colors.reset}`);
  console.log(`  ${colors.dim}┌──────┬──────────────────────┬─────────────┬─────────────────────────────────┬──────────────┬─────────────┐${colors.reset}`);
  console.log(`  ${colors.dim}│${colors.reset} ${colors.bold}Step${colors.reset} ${colors.dim}│${colors.reset} ${colors.bold}Status${colors.reset}               ${colors.dim}│${colors.reset} ${colors.bold}Agent${colors.reset}       ${colors.dim}│${colors.reset} ${colors.bold}Model Transition${colors.reset}                ${colors.dim}│${colors.reset} ${colors.bold}Cost Delta${colors.reset}   ${colors.dim}│${colors.reset} ${colors.bold}Latency${colors.reset}     ${colors.dim}│${colors.reset}`);
  console.log(`  ${colors.dim}├──────┼──────────────────────┼─────────────┼─────────────────────────────────┼──────────────┼─────────────┤${colors.reset}`);

  for (const step of diff.steps) {
    let statusBadge = '';
    if (step.status === 'identical_cached') {
      statusBadge = `${colors.green}⚡ CACHED PREFIX${colors.reset}     `;
    } else if (step.status === 'modified_fork' || step.status === 'modified') {
      statusBadge = `${colors.yellow}🔀 FORK POINT   ${colors.reset}     `;
    } else if (step.status === 'inserted') {
      statusBadge = `${colors.cyan}➕ INSERTED     ${colors.reset}     `;
    } else if (step.status === 'removed') {
      statusBadge = `${colors.red}➖ REMOVED      ${colors.reset}     `;
    } else {
      statusBadge = `${colors.magenta}⬇ DIVERGED      ${colors.reset}     `;
    }

    const stepNum = step.stepIndex.toString().padEnd(4, ' ');
    const agent = step.agentName.slice(0, 11).padEnd(11, ' ');
    const baseModel = step.baseSpan?.model || 'none';
    const targetModel = step.targetSpan?.model || 'none';
    const modelTrans = (baseModel === targetModel ? `${baseModel} (replayed)` : `${baseModel} -> ${targetModel}`).slice(0, 31).padEnd(31, ' ');

    const costDelta = (step.deltas.costDeltaUsd >= 0 ? `+$${step.deltas.costDeltaUsd.toFixed(6)}` : `-$${Math.abs(step.deltas.costDeltaUsd).toFixed(6)}`).padEnd(12, ' ');
    const latDelta = `${step.deltas.latencyDeltaMs >= 0 ? '+' : ''}${step.deltas.latencyDeltaMs}ms`.padEnd(11, ' ');

    console.log(`  ${colors.dim}│${colors.reset} ${stepNum} ${colors.dim}│${colors.reset} ${statusBadge} ${colors.dim}│${colors.reset} ${agent} ${colors.dim}│${colors.reset} ${modelTrans} ${colors.dim}│${colors.reset} ${costDelta} ${colors.dim}│${colors.reset} ${latDelta} ${colors.dim}│${colors.reset}`);
  }
  console.log(`  ${colors.dim}└──────┴──────────────────────┴─────────────┴─────────────────────────────────┴──────────────┴─────────────┘${colors.reset}\n`);

  return diff;
}

export async function handleAssert(
  filePath: string,
  options: { maxCost?: number; maxLatency?: number } = {},
  exitOnComplete: boolean = true
): Promise<RegressionAssertionResult> {
  if (!filePath) {
    console.error(`${colors.red}Error: Missing <trace_file.json> path.${colors.reset}`);
    if (exitOnComplete) process.exit(1);
    throw new Error('Missing file path');
  }

  const resolvedPath = resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    console.error(`${colors.red}Error: File not found: ${resolvedPath}${colors.reset}`);
    if (exitOnComplete) process.exit(1);
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  let bundle: any;
  try {
    bundle = JSON.parse(content);
  } catch (err: any) {
    console.error(`${colors.red}Error parsing JSON file: ${err.message}${colors.reset}`);
    if (exitOnComplete) process.exit(1);
    throw err;
  }

  // Import into local SQLite so it is persisted and verifiable
  await handleImport(filePath, false);

  const runData = bundle.run || bundle;
  const spansData = bundle.spans || [];

  const actualStatus = runData.status || 'completed';
  const actualCostUsd = runData.total_cost_usd || 0;
  const actualLatencyMs = spansData.reduce((sum: number, s: any) => sum + (s.latency_ms || 0), 0);

  const failures: string[] = [];

  // 1. Status check: must not be breaker_tripped or failed
  const statusPassed = actualStatus !== 'breaker_tripped' && actualStatus !== 'failed';
  if (!statusPassed) {
    failures.push(`Run status is '${actualStatus}' (expected clean execution without breaker trips)`);
  }

  // 2. Cost ceiling check
  let costPassed = true;
  if (options.maxCost !== undefined) {
    costPassed = actualCostUsd <= options.maxCost;
    if (!costPassed) {
      failures.push(`Total cost $${actualCostUsd.toFixed(6)} exceeds budget limit of $${options.maxCost.toFixed(6)}`);
    }
  }

  // 3. Latency SLA check
  let latencyPassed = true;
  if (options.maxLatency !== undefined) {
    latencyPassed = actualLatencyMs <= options.maxLatency;
    if (!latencyPassed) {
      failures.push(`Total latency ${actualLatencyMs}ms exceeds SLA limit of ${options.maxLatency}ms`);
    }
  }

  const passed = failures.length === 0;

  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}🎯 AetherTrace CI Regression Gate${colors.reset}`);
  console.log(`${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}Trace File:${colors.reset}    ${filePath}`);
  console.log(`  ${colors.bold}Run Name:${colors.reset}      ${runData.name} (${colors.dim}${runData.id}${colors.reset})`);
  console.log(`  ${statusPassed ? colors.green : colors.red}● Status:${colors.reset}        ${actualStatus} ${statusPassed ? '✔' : '✖ (Breaker Tripped/Failed)'}`);
  console.log(`  ${costPassed ? colors.green : colors.red}● Total Spend:${colors.reset}   $${actualCostUsd.toFixed(6)}${options.maxCost !== undefined ? ` (Max allowed: $${options.maxCost.toFixed(6)}) ${costPassed ? '✔' : '✖'}` : ''}`);
  console.log(`  ${latencyPassed ? colors.green : colors.red}● Total Latency:${colors.reset} ${actualLatencyMs}ms${options.maxLatency !== undefined ? ` (Max SLA: ${options.maxLatency}ms) ${latencyPassed ? '✔' : '✖'}` : ''}`);

  if (passed) {
    console.log(`\n  ${colors.green}${colors.bold}✨ REGRESSION ASSERTION PASSED (Exit Code: 0)${colors.reset}\n`);
    console.log(`${colors.cyan}========================================================================${colors.reset}\n`);
    if (exitOnComplete) process.exit(0);
  } else {
    console.log(`\n  ${colors.red}${colors.bold}✖ REGRESSION ASSERTION FAILED (Exit Code: 1):${colors.reset}`);
    for (const f of failures) {
      console.log(`    ${colors.red}• ${f}${colors.reset}`);
    }
    console.log(`\n${colors.cyan}========================================================================${colors.reset}\n`);
    if (exitOnComplete) process.exit(1);
  }

  return {
    passed,
    runId: runData.id,
    runName: runData.name,
    actualStatus,
    actualCostUsd,
    maxCostUsd: options.maxCost,
    costPassed,
    actualLatencyMs,
    maxLatencyMs: options.maxLatency,
    latencyPassed,
    statusPassed,
    failures
  };
}

async function handleSearch(query: string, options: { limit?: number; json?: boolean } = {}) {
  const { sqlite } = getDatabase();

  if (!query || query === 'rebuild') {
    const res = rebuildSearchIndex(sqlite);
    if (options.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      printBanner();
      console.log(`  ${colors.green}✔ Search index rebuilt successfully:${colors.reset}`);
      console.log(`    • Runs indexed:  ${colors.bold}${res.runsIndexed}${colors.reset}`);
      console.log(`    • Spans indexed: ${colors.bold}${res.spansIndexed}${colors.reset}`);
      console.log(`    • Time taken:    ${colors.cyan}${res.tookMs}ms${colors.reset}\n`);
    }
    return;
  }

  const response = executeSearch(sqlite, query, { limit: options.limit });

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printBanner();
  console.log(`${colors.bold}🔍 AetherTrace Global Search:${colors.reset} "${colors.cyan}${query}${colors.reset}"`);
  console.log(`${colors.dim}Found ${response.total} result(s) in ${response.took_ms}ms${colors.reset}\n`);

  if (response.results.length === 0) {
    console.log(`  ${colors.yellow}No matching runs, spans, or errors found.${colors.reset}`);
    console.log(`  ${colors.dim}Try a broader term, removing a filter, or run 'aethertrace search rebuild'.${colors.reset}\n`);
    return;
  }

  for (const r of response.results) {
    const badgeColor =
      r.type === 'error' ? colors.red :
      r.type === 'tool' ? colors.cyan :
      r.type === 'run' ? colors.magenta :
      colors.green;

    const badge = `[${r.type.toUpperCase()}]`.padEnd(10);
    console.log(`  ${badgeColor}${colors.bold}${badge}${colors.reset} ${colors.bold}${r.title}${colors.reset}`);
    if (r.subtitle) {
      console.log(`             ${colors.dim}${r.subtitle}${colors.reset}`);
    }
    if (r.snippet) {
      console.log(`             ${colors.dim}"${r.snippet}"${colors.reset}`);
    }
    console.log(`             ${colors.dim}ID: ${r.id} · Run: ${r.runId}${colors.reset}\n`);
  }
}

async function handleErrors(options: { limit?: number; json?: boolean } = {}) {
  const { sqlite } = getDatabase();
  const errors = discoverErrors(sqlite, { limit: options.limit });

  if (options.json) {
    console.log(JSON.stringify({ errors, count: errors.length }, null, 2));
    return;
  }

  printBanner();
  console.log(`${colors.bold}⚠️  AetherTrace Cross-Run Error Discovery:${colors.reset}`);
  console.log(`${colors.dim}Discovered ${errors.length} failure pattern(s) across trace history${colors.reset}\n`);

  if (errors.length === 0) {
    console.log(`  ${colors.green}✔ No execution errors or safety breaker trips detected across all runs!${colors.reset}\n`);
    return;
  }

  console.log(`  ${'ERROR TYPE'.padEnd(28)} ${'COUNT'.padEnd(8)} ${'RUNS'.padEnd(8)} ${'SAMPLE RUN'.padEnd(30)}`);
  console.log(`  ${'─'.repeat(28)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(30)}`);

  for (const err of errors) {
    const errName = err.errorType.slice(0, 26).padEnd(28);
    const countStr = String(err.count).padEnd(8);
    const runsStr = String(err.runsCount).padEnd(8);
    console.log(`  ${colors.red}${errName}${colors.reset} ${countStr} ${runsStr} ${colors.dim}${err.sampleRunId}${colors.reset}`);
    if (err.message) {
      console.log(`    ${colors.dim}Message: ${err.message.slice(0, 90)}${colors.reset}`);
    }
    if (err.affectedAgents.length > 0) {
      console.log(`    ${colors.dim}Agents:  ${err.affectedAgents.join(', ')}${colors.reset}`);
    }
    console.log('');
  }
}

async function handleExperiment(subcommand: string = 'list', args: string[] = []) {
  const { db } = getDatabase();

  switch (subcommand) {
    case 'list': {
      const isJson = args.includes('--json');
      const list = listExperiments(db);
      if (isJson) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}AetherTrace Experiments (${list.length}):${colors.reset}\n`);
      if (list.length === 0) {
        console.log(`  ${colors.dim}No experiments found. Create one with: npx aethertrace experiment create <run_id>${colors.reset}\n`);
        return;
      }
      console.log(`  ${'ID'.padEnd(24)} ${'NAME'.padEnd(28)} ${'STATUS'.padEnd(12)} ${'VARS'.padEnd(6)} ${'SOURCE RUN'.padEnd(24)}`);
      console.log(`  ${'─'.repeat(24)} ${'─'.repeat(28)} ${'─'.repeat(12)} ${'─'.repeat(6)} ${'─'.repeat(24)}`);
      for (const e of list) {
        const idStr = e.id.slice(0, 22).padEnd(24);
        const nameStr = e.name.slice(0, 26).padEnd(28);
        const statusStr = (e.status === 'completed' ? colors.green : e.status === 'running' ? colors.yellow : colors.dim) + e.status.padEnd(12) + colors.reset;
        const varsStr = `${e.variant_count}`.padEnd(6);
        const srcStr = e.source_run_id.slice(0, 22);
        console.log(`  ${colors.cyan}${idStr}${colors.reset} ${nameStr} ${statusStr} ${varsStr} ${colors.dim}${srcStr}${colors.reset}`);
      }
      console.log('');
      break;
    }
    case 'create': {
      const runId = args[0];
      if (!runId) {
        console.error(`${colors.red}✖ Error: Source run_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace experiment create <run_id> [--name <name>] [--description <desc>]`);
        process.exit(1);
      }
      const nameIdx = args.findIndex((a) => a === '--name');
      const name = nameIdx !== -1 ? args[nameIdx + 1] : `Experiment ${Date.now().toString().slice(-4)}`;
      const descIdx = args.findIndex((a) => a === '--description' || a === '--desc');
      const description = descIdx !== -1 ? args[descIdx + 1] : undefined;

      try {
        const exp = createExperiment(db, {
          sourceRunId: runId,
          name,
          description
        });
        printBanner();
        console.log(`${colors.green}✔ Experiment created successfully:${colors.reset}`);
        console.log(`  ${colors.bold}ID:${colors.reset}          ${colors.cyan}${exp.id}${colors.reset}`);
        console.log(`  ${colors.bold}Name:${colors.reset}        ${exp.name}`);
        console.log(`  ${colors.bold}Source Run:${colors.reset}  ${exp.source_run_id}`);
        console.log(`  ${colors.bold}Status:${colors.reset}      ${exp.status}\n`);
      } catch (err: any) {
        console.error(`${colors.red}✖ Error creating experiment:${colors.reset} ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case 'inspect': {
      const expId = args[0];
      if (!expId) {
        console.error(`${colors.red}✖ Error: experiment_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace experiment inspect <exp_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const exp = getExperiment(db, expId);
      if (!exp) {
        console.error(`${colors.red}✖ Error: Experiment '${expId}' not found.${colors.reset}`);
        process.exit(1);
      }
      if (isJson) {
        console.log(JSON.stringify(exp, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}Experiment Details:${colors.reset}`);
      console.log(`  ID:          ${colors.cyan}${exp.id}${colors.reset}`);
      console.log(`  Name:        ${exp.name}`);
      console.log(`  Status:      ${exp.status}`);
      console.log(`  Source Run:  ${exp.source_run_id}`);
      if (exp.description) console.log(`  Description: ${exp.description}`);
      console.log(`  Variants:    ${exp.variants.length}\n`);

      if (exp.variants.length > 0) {
        console.log(`  ${'VARIANT ID'.padEnd(20)} ${'NAME'.padEnd(24)} ${'MODE'.padEnd(16)} ${'STATUS'.padEnd(12)} ${'REPLAY RUN'.padEnd(20)}`);
        console.log(`  ${'─'.repeat(20)} ${'─'.repeat(24)} ${'─'.repeat(16)} ${'─'.repeat(12)} ${'─'.repeat(20)}`);
        for (const v of exp.variants) {
          const vId = v.id.slice(0, 18).padEnd(20);
          const vName = v.name.slice(0, 22).padEnd(24);
          const vMode = v.replay_mode.padEnd(16);
          const vStatus = (v.status === 'completed' ? colors.green : v.status === 'failed' ? colors.red : colors.dim) + v.status.padEnd(12) + colors.reset;
          const vReplay = (v.replay_run_id || 'none').slice(0, 18);
          console.log(`  ${colors.dim}${vId}${colors.reset} ${vName} ${vMode} ${vStatus} ${colors.cyan}${vReplay}${colors.reset}`);
        }
        console.log('');
      }
      break;
    }
    case 'variant-add': {
      const expId = args[0];
      if (!expId) {
        console.error(`${colors.red}✖ Error: experiment_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace experiment variant-add <exp_id> --name <name> [--mode <mode>] [--mutations <json>]`);
        process.exit(1);
      }
      const nameIdx = args.findIndex((a) => a === '--name');
      const name = nameIdx !== -1 ? args[nameIdx + 1] : `Variant ${Date.now().toString().slice(-4)}`;
      const modeIdx = args.findIndex((a) => a === '--mode');
      const mode = (modeIdx !== -1 ? args[modeIdx + 1] : 'mock_mutated') as ReplayMode;
      const forkIdx = args.findIndex((a) => a === '--fork-span');
      const forkSpanId = forkIdx !== -1 ? args[forkIdx + 1] : undefined;
      const mutIdx = args.findIndex((a) => a === '--mutations');
      let mutations: ExperimentMutation[] = [];
      if (mutIdx !== -1) {
        try {
          mutations = JSON.parse(args[mutIdx + 1]);
        } catch {
          console.error(`${colors.red}✖ Error: --mutations must be a valid JSON array.${colors.reset}`);
          process.exit(1);
        }
      }

      try {
        const variant = createVariant(db, {
          experimentId: expId,
          name,
          replayMode: mode,
          forkSpanId,
          mutations
        });
        printBanner();
        console.log(`${colors.green}✔ Variant added successfully:${colors.reset}`);
        console.log(`  ${colors.bold}Variant ID:${colors.reset}  ${colors.cyan}${variant.id}${colors.reset}`);
        console.log(`  ${colors.bold}Name:${colors.reset}        ${variant.name}`);
        console.log(`  ${colors.bold}Mode:${colors.reset}        ${variant.replay_mode}`);
        console.log(`  ${colors.bold}Mutations:${colors.reset}   ${mutations.length}\n`);
      } catch (err: any) {
        console.error(`${colors.red}✖ Error adding variant:${colors.reset} ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case 'run': {
      const expId = args[0];
      if (!expId) {
        console.error(`${colors.red}✖ Error: experiment_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace experiment run <exp_id> [--confirm-live]`);
        process.exit(1);
      }
      const confirmLive = args.includes('--confirm-live');
      const exp = getExperiment(db, expId);
      if (!exp) {
        console.error(`${colors.red}✖ Error: Experiment '${expId}' not found.${colors.reset}`);
        process.exit(1);
      }
      if (exp.variants.length === 0) {
        console.error(`${colors.red}✖ Error: Experiment '${expId}' has no variants configured.${colors.reset}`);
        process.exit(1);
      }

      printBanner();
      console.log(`${colors.yellow}▶ Executing batch replay for ${exp.variants.length} variant(s)...${colors.reset}\n`);

      let completed = 0;
      let failed = 0;

      for (const v of exp.variants) {
        process.stdout.write(`  • Replaying '${v.name}' [${v.replay_mode}]... `);
        try {
          const res = await executeVariantReplay(v.id, { confirmLive });
          process.stdout.write(`${colors.green}✔ SUCCESS (Run: ${res.newRunId.slice(0, 16)}...)${colors.reset}\n`);
          completed++;
        } catch (err: any) {
          process.stdout.write(`${colors.red}✖ FAILED (${err.message})${colors.reset}\n`);
          failed++;
        }
      }

      console.log(`\n${colors.bold}Execution Summary:${colors.reset}`);
      console.log(`  Total:     ${exp.variants.length}`);
      console.log(`  Completed: ${colors.green}${completed}${colors.reset}`);
      console.log(`  Failed:    ${failed > 0 ? colors.red + failed + colors.reset : '0'}\n`);
      break;
    }
    case 'compare': {
      const expId = args[0];
      if (!expId) {
        console.error(`${colors.red}✖ Error: experiment_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace experiment compare <exp_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      try {
        const comparison = compareExperimentVariants(db, expId);
        if (isJson) {
          console.log(JSON.stringify(comparison, null, 2));
          return;
        }
        printBanner();
        console.log(`${colors.bold}Multi-Variant Comparison Scorecard:${colors.reset}`);
        console.log(`  Experiment: ${comparison.experimentName} (${comparison.experimentId})`);
        console.log(`  Source Run: ${comparison.sourceRun.name} ($${comparison.sourceRun.costUsd.toFixed(4)}, ${comparison.sourceRun.durationMs}ms, ${comparison.sourceRun.tokenCount} tok)\n`);

        if (comparison.scorecard.length === 0) {
          console.log(`  ${colors.dim}No executed variants to compare. Run variants first with: npx aethertrace experiment run ${expId}${colors.reset}\n`);
          return;
        }

        console.log(`  ${'VARIANT'.padEnd(20)} ${'COST ($)'.padEnd(12)} ${'COST DELTA'.padEnd(16)} ${'LATENCY'.padEnd(12)} ${'TOKENS'.padEnd(10)}`);
        console.log(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(16)} ${'─'.repeat(12)} ${'─'.repeat(10)}`);

        for (const sc of comparison.scorecard) {
          const vName = sc.variantName.slice(0, 18).padEnd(20);
          const costStr = `$${sc.costUsd.toFixed(4)}`.padEnd(12);
          const deltaSign = sc.costDeltaUsd <= 0 ? '' : '+';
          const deltaColor = sc.costDeltaUsd <= 0 ? colors.green : colors.red;
          const costDeltaStr = deltaColor + `${deltaSign}$${sc.costDeltaUsd.toFixed(4)} (${sc.costSavingsPercent.toFixed(1)}%)`.padEnd(16) + colors.reset;
          const latStr = `${sc.durationMs}ms`.padEnd(12);
          const tokStr = `${sc.tokenCount}`.padEnd(10);
          console.log(`  ${colors.bold}${vName}${colors.reset} ${costStr} ${costDeltaStr} ${latStr} ${tokStr}`);
        }
        console.log('');
      } catch (err: any) {
        console.error(`${colors.red}✖ Error comparing variants:${colors.reset} ${err.message}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`${colors.red}Unknown experiment subcommand: ${subcommand}${colors.reset}`);
      console.log(`Available: list, create, inspect, variant-add, run, compare`);
      process.exit(1);
  }
}

async function handleEvaluate(subcommand: string, args: string[]) {
  const { db } = getDatabase();

  switch (subcommand) {
    case 'list': {
      const isJson = args.includes('--json');
      const evals = listEvaluations(db);
      if (isJson) {
        console.log(JSON.stringify(evals, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}AetherTrace Evaluations (${evals.length}):${colors.reset}\n`);
      if (evals.length === 0) {
        console.log(`  ${colors.dim}No evaluations recorded yet. Run one with:${colors.reset}`);
        console.log(`  ${colors.cyan}npx aethertrace evaluate run <run_id>${colors.reset}\n`);
        return;
      }
      console.log(`  ${'ID'.padEnd(38)} ${'NAME'.padEnd(24)} ${'TARGET'.padEnd(12)} ${'STATUS'.padEnd(10)} ${'SCORE'.padEnd(8)} ${'DATE'.padEnd(20)}`);
      console.log(`  ${'─'.repeat(38)} ${'─'.repeat(24)} ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(20)}`);

      for (const ev of evals) {
        const idStr = ev.id.padEnd(38);
        const nameStr = (ev.name || 'unnamed').slice(0, 22).padEnd(24);
        const targetStr = `${ev.target_type}:${ev.target_id.slice(0, 4)}`.padEnd(12);
        const statusColor = ev.status === 'passed' ? colors.green : ev.status === 'failed' ? colors.red : colors.yellow;
        const statusStr = (statusColor + ev.status.toUpperCase() + colors.reset).padEnd(10 + statusColor.length + colors.reset.length);
        const scorePct = ev.assertions_total > 0 ? (ev.assertions_passed / ev.assertions_total) * 100 : 100;
        const scoreStr = `${scorePct.toFixed(0)}%`.padEnd(8);
        const dateStr = new Date(ev.created_at).toISOString().replace('T', ' ').slice(0, 19).padEnd(20);
        console.log(`  ${idStr} ${nameStr} ${targetStr} ${statusStr} ${scoreStr} ${dateStr}`);
      }
      console.log('');
      break;
    }

    case 'run': {
      const targetId = args[0];
      if (!targetId || targetId.startsWith('--')) {
        console.error(`${colors.red}✖ Error: target_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate run <run_id> [--assert "<rule>"] [--baseline <run_id>] [--name <name>] [--json]`);
        process.exit(2);
      }

      const isJson = args.includes('--json');
      const targetIndex = args.findIndex((a) => a === '--target');
      const targetType = (targetIndex !== -1 && args[targetIndex + 1]) ? (args[targetIndex + 1] as 'run' | 'variant' | 'experiment') : 'run';

      const nameIndex = args.findIndex((a) => a === '--name');
      const name = nameIndex !== -1 ? args[nameIndex + 1] : undefined;

      const baselineIndex = args.findIndex((a) => a === '--baseline');
      const baselineRunId = baselineIndex !== -1 ? args[baselineIndex + 1] : undefined;

      // Collect all --assert rules
      const customRules: AssertionRule[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--assert' && args[i + 1]) {
          try {
            customRules.push(parseAssertionRule(args[i + 1]));
          } catch (err: any) {
            console.error(`${colors.red}✖ Invalid assertion rule '${args[i + 1]}': ${err.message}${colors.reset}`);
            process.exit(2);
          }
        }
      }

      try {
        const report = await runEvaluation(db, {
          targetType,
          targetId,
          name,
          rules: customRules.length > 0 ? customRules : undefined,
          baselineRunId
        });

        if (isJson) {
          console.log(JSON.stringify(report, null, 2));
          process.exit(report.status === 'passed' ? 0 : 1);
        }

        printBanner();
        const statusColor = report.status === 'passed' ? colors.green : colors.red;
        console.log(`${colors.bold}Evaluation Report:${colors.reset} ${report.name} (${report.id})`);
        console.log(`  Target:     ${report.targetType} (${report.targetId})`);
        console.log(`  Status:     ${statusColor}${report.status.toUpperCase()}${colors.reset}`);
        console.log(`  Score:      ${report.score.passPercentage.toFixed(1)}% (${report.score.assertionsPassed}/${report.score.assertionsTotal} passed)`);
        console.log(`  Created:    ${new Date(report.createdAt).toISOString()}`);
        console.log('');

        console.log(`${colors.bold}Execution Metrics:${colors.reset}`);
        console.log(`  Cost:       $${report.metrics.cost.totalCostUsd.toFixed(4)} (Saved: $${report.metrics.cost.cachedSavingsUsd.toFixed(4)})`);
        console.log(`  Latency:    ${report.metrics.latency.totalDurationMs}ms (CritPath: ${report.metrics.latency.criticalPathMs}ms)`);
        console.log(`  Tokens:     ${report.metrics.tokens.totalTokens} (Prompt: ${report.metrics.tokens.promptTokens}, Comp: ${report.metrics.tokens.completionTokens})`);
        console.log(`  Reliability: Errors: ${report.metrics.reliability.errorCount}, Retries: ${report.metrics.reliability.retryCount}`);
        console.log('');

        console.log(`${colors.bold}Assertion Results (${report.assertions.length}):${colors.reset}`);
        for (const ass of report.assertions) {
          const passIcon = ass.status === 'passed' ? `${colors.green}✔ PASS${colors.reset}` : `${colors.red}✖ FAIL${colors.reset}`;
          const actualStr = `(actual: ${JSON.stringify(ass.actual)})`;
          console.log(`  ${passIcon} ${ass.expression.padEnd(35)} ${actualStr}`);
          if (ass.status !== 'passed' && ass.message) {
            console.log(`         ${colors.dim}Reason: ${ass.message}${colors.reset}`);
          }
        }
        console.log('');

        if (report.failures.length > 0) {
          console.log(`${colors.bold}Failures Detected (${report.failures.length}):${colors.reset}`);
          for (const f of report.failures.slice(0, 5)) {
            const culprit = f.spanIds.length > 0 ? `[Span: ${f.spanIds[0].slice(0, 8)}] ` : '';
            console.log(`  ${colors.red}• [${f.severity.toUpperCase()}] ${f.assertionName}:${colors.reset} ${culprit}${f.explanation}`);
          }
          if (report.failures.length > 5) {
            console.log(`  ${colors.dim}... and ${report.failures.length - 5} more failures.${colors.reset}`);
          }
          console.log('');
        }

        if (report.rootCauses.length > 0) {
          console.log(`${colors.bold}Primary Root Causes (${report.rootCauses.length}):${colors.reset}`);
          for (const rc of report.rootCauses.slice(0, 3)) {
            console.log(`  ${colors.yellow}• [${rc.candidateType.toUpperCase()}] ${rc.agentName} (${rc.spanType})${colors.reset}`);
            console.log(`    ${colors.dim}${rc.explanation}${colors.reset}`);
            if (rc.errorSummary) {
              console.log(`    ${colors.cyan}Error: ${rc.errorSummary}${colors.reset}`);
            }
          }
          console.log('');
        }

        if (report.optimizationSignals.length > 0) {
          console.log(`${colors.bold}Optimization Signals (${report.optimizationSignals.length}):${colors.reset}`);
          for (const sig of report.optimizationSignals.slice(0, 3)) {
            const sav = sig.potentialSavingsUsd ? ` (Est. savings: $${sig.potentialSavingsUsd.toFixed(4)})` : '';
            console.log(`  ${colors.cyan}• [${sig.priority.toUpperCase()}] ${sig.title}${sav}${colors.reset}`);
            console.log(`    ${colors.dim}${sig.recommendation}${colors.reset}`);
          }
          console.log('');
        }

        process.exit(report.status === 'passed' ? 0 : 1);
      } catch (err: any) {
        console.error(`${colors.red}✖ Evaluation execution failed: ${err.message}${colors.reset}`);
        process.exit(2);
      }
      break;
    }

    case 'assert': {
      const targetId = args[0];
      if (!targetId || targetId.startsWith('--')) {
        console.error(`${colors.red}✖ Error: run_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate assert <run_id> --expr "<expression>"`);
        process.exit(2);
      }

      // Collect --expr expressions
      const rawRules: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--expr' || args[i] === '--rule') && args[i + 1]) {
          rawRules.push(args[i + 1]);
        }
      }

      if (rawRules.length === 0) {
        console.error(`${colors.red}✖ Error: At least one --expr "<rule>" argument is required.${colors.reset}`);
        console.log(`Example: npx aethertrace evaluate assert <run_id> --expr "cost_usd <= 0.05"`);
        process.exit(2);
      }

      const customRules: AssertionRule[] = [];
      for (const r of rawRules) {
        try {
          customRules.push(parseAssertionRule(r));
        } catch (err: any) {
          console.error(`${colors.red}✖ Parse error for assertion '${r}': ${err.message}${colors.reset}`);
          process.exit(2);
        }
      }

      const isJson = args.includes('--json');

      try {
        const report = await runEvaluation(db, {
          targetType: 'run',
          targetId,
          name: `CI Assertion Gate (${targetId.slice(0, 8)})`,
          rules: customRules
        });

        if (isJson) {
          console.log(JSON.stringify({
            passed: report.status === 'passed',
            score: report.score,
            assertions: report.assertions,
            metrics: report.metrics
          }, null, 2));
          process.exit(report.status === 'passed' ? 0 : 1);
        }

        let allPassed = true;
        for (const ass of report.assertions) {
          if (ass.status === 'passed') {
            console.log(`${colors.green}✔ [PASS]${colors.reset} ${ass.expression} (actual: ${JSON.stringify(ass.actual)})`);
          } else {
            allPassed = false;
            console.error(`${colors.red}✖ [FAIL]${colors.reset} ${ass.expression} (actual: ${JSON.stringify(ass.actual)})`);
            if (ass.message) {
              console.error(`       ${colors.dim}Reason: ${ass.message}${colors.reset}`);
            }
          }
        }

        if (allPassed) {
          console.log(`\n${colors.green}${colors.bold}✔ CI Assertion Gate Passed${colors.reset} for run ${targetId}\n`);
          process.exit(0);
        } else {
          console.error(`\n${colors.red}${colors.bold}✖ CI Assertion Gate Failed${colors.reset} for run ${targetId}\n`);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`${colors.red}✖ CI assertion execution failed: ${err.message}${colors.reset}`);
        process.exit(2);
      }
      break;
    }

    case 'inspect': {
      const evalId = args[0];
      if (!evalId) {
        console.error(`${colors.red}✖ Error: eval_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate inspect <eval_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const rep = getEvaluation(db, evalId);
      if (!rep) {
        console.error(`${colors.red}✖ Error: Evaluation '${evalId}' not found.${colors.reset}`);
        process.exit(1);
      }

      if (isJson) {
        console.log(JSON.stringify(rep, null, 2));
        return;
      }

      printBanner();
      const statusColor = rep.status === 'passed' ? colors.green : colors.red;
      console.log(`${colors.bold}Evaluation Details:${colors.reset} ${rep.name} (${rep.id})`);
      console.log(`  Target:     ${rep.targetType} (${rep.targetId})`);
      console.log(`  Status:     ${statusColor}${rep.status.toUpperCase()}${colors.reset}`);
      console.log(`  Score:      ${rep.score.passPercentage.toFixed(1)}%`);
      console.log(`  Created At: ${new Date(rep.createdAt).toISOString()}\n`);

      console.log(`${colors.bold}Metrics Breakdown:${colors.reset}`);
      console.log(`  Spend:      $${rep.metrics.cost.totalCostUsd.toFixed(4)} (Saved: $${rep.metrics.cost.cachedSavingsUsd.toFixed(4)})`);
      console.log(`  Duration:   ${rep.metrics.latency.totalDurationMs}ms (CritPath: ${rep.metrics.latency.criticalPathMs}ms)`);
      console.log(`  Tokens:     ${rep.metrics.tokens.totalTokens} (Prompt: ${rep.metrics.tokens.promptTokens}, Completion: ${rep.metrics.tokens.completionTokens})`);
      console.log(`  Errors:     ${rep.metrics.reliability.errorCount}`);
      console.log(`  Retries:    ${rep.metrics.reliability.retryCount}\n`);

      console.log(`${colors.bold}Assertions (${rep.assertions.length}):${colors.reset}`);
      for (const ass of rep.assertions) {
        const passIcon = ass.status === 'passed' ? `${colors.green}✔ PASS${colors.reset}` : `${colors.red}✖ FAIL${colors.reset}`;
        console.log(`  ${passIcon} ${ass.expression} (actual: ${JSON.stringify(ass.actual)})`);
      }
      console.log('');

      if (rep.failures.length > 0) {
        console.log(`${colors.bold}Failures (${rep.failures.length}):${colors.reset}`);
        for (const f of rep.failures) {
          console.log(`  ${colors.red}• [${f.severity.toUpperCase()}] ${f.assertionName}:${colors.reset} ${f.explanation}`);
        }
        console.log('');
      }

      if (rep.errorClusters.length > 0) {
        console.log(`${colors.bold}Error Clusters (${rep.errorClusters.length}):${colors.reset}`);
        for (const ec of rep.errorClusters) {
          console.log(`  ${colors.yellow}• [${ec.occurrences}x] ${ec.errorType}:${colors.reset} ${ec.normalizedMessage.slice(0, 60)}...`);
        }
        console.log('');
      }

      if (rep.optimizationSignals.length > 0) {
        console.log(`${colors.bold}Optimization Signals (${rep.optimizationSignals.length}):${colors.reset}`);
        for (const sig of rep.optimizationSignals) {
          console.log(`  ${colors.cyan}• [${sig.priority.toUpperCase()}] ${sig.title}:${colors.reset} ${sig.recommendation}`);
        }
        console.log('');
      }
      break;
    }

    case 'failures': {
      const runId = args[0];
      if (!runId) {
        console.error(`${colors.red}✖ Error: run_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate failures <run_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const rep = await runEvaluation(db, { targetType: 'run', targetId: runId });
      if (isJson) {
        console.log(JSON.stringify(rep.failures, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}Failures for Run ${runId} (${rep.failures.length}):${colors.reset}\n`);
      if (rep.failures.length === 0) {
        console.log(`  ${colors.green}✔ Zero failures detected!${colors.reset}\n`);
        return;
      }
      for (const f of rep.failures) {
        const culprit = f.spanIds.length > 0 ? `[Culprit Span: ${f.spanIds[0]}] ` : '';
        console.log(`  ${colors.red}• [${f.severity.toUpperCase()}] ${f.assertionName}:${colors.reset} ${culprit}${f.explanation}`);
      }
      console.log('');
      break;
    }

    case 'errors': {
      const runId = args[0];
      if (!runId) {
        console.error(`${colors.red}✖ Error: run_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate errors <run_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const rep = await runEvaluation(db, { targetType: 'run', targetId: runId });
      if (isJson) {
        console.log(JSON.stringify(rep.errorClusters, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}Error Clusters for Run ${runId} (${rep.errorClusters.length}):${colors.reset}\n`);
      if (rep.errorClusters.length === 0) {
        console.log(`  ${colors.green}✔ Zero error clusters detected!${colors.reset}\n`);
        return;
      }
      for (const ec of rep.errorClusters) {
        console.log(`  ${colors.yellow}• [${ec.occurrences}x] ${ec.errorType} (${ec.id}):${colors.reset}`);
        console.log(`    Message: ${ec.normalizedMessage}`);
        console.log(`    Spans:   ${ec.affectedSpans.join(', ')}\n`);
      }
      break;
    }

    case 'optimize': {
      const runId = args[0];
      if (!runId) {
        console.error(`${colors.red}✖ Error: run_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate optimize <run_id> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const rep = await runEvaluation(db, { targetType: 'run', targetId: runId });
      if (isJson) {
        console.log(JSON.stringify(rep.optimizationSignals, null, 2));
        return;
      }
      printBanner();
      console.log(`${colors.bold}Optimization Signals for Run ${runId} (${rep.optimizationSignals.length}):${colors.reset}\n`);
      if (rep.optimizationSignals.length === 0) {
        console.log(`  ${colors.green}✔ No performance or cost bottlenecks detected!${colors.reset}\n`);
        return;
      }
      for (const sig of rep.optimizationSignals) {
        const savings = sig.potentialSavingsUsd ? ` (Est. savings: $${sig.potentialSavingsUsd.toFixed(4)})` : '';
        console.log(`  ${colors.cyan}• [${sig.priority.toUpperCase()}] ${sig.title}${savings}:${colors.reset}`);
        console.log(`    Description: ${sig.description}`);
        console.log(`    Action:      ${sig.recommendation}\n`);
      }
      break;
    }

    case 'compare': {
      const evalAId = args[0];
      const evalBId = args[1];
      if (!evalAId || !evalBId) {
        console.error(`${colors.red}✖ Error: Two evaluation IDs are required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate compare <eval_a> <eval_b> [--json]`);
        process.exit(1);
      }
      const isJson = args.includes('--json');
      const repA = getEvaluation(db, evalAId);
      const repB = getEvaluation(db, evalBId);
      if (!repA || !repB) {
        console.error(`${colors.red}✖ Error: One or both evaluation reports not found.${colors.reset}`);
        process.exit(1);
      }

      const comparison = {
        evalA: { id: repA.id, name: repA.name, score: repA.score, status: repA.status, metrics: repA.metrics },
        evalB: { id: repB.id, name: repB.name, score: repB.score, status: repB.status, metrics: repB.metrics },
        deltas: {
          scoreDelta: repB.score.passPercentage - repA.score.passPercentage,
          costDeltaUsd: repB.metrics.cost.totalCostUsd - repA.metrics.cost.totalCostUsd,
          durationDeltaMs: repB.metrics.latency.totalDurationMs - repA.metrics.latency.totalDurationMs,
          tokenDelta: repB.metrics.tokens.totalTokens - repA.metrics.tokens.totalTokens,
          errorDelta: repB.metrics.reliability.errorCount - repA.metrics.reliability.errorCount
        }
      };

      if (isJson) {
        console.log(JSON.stringify(comparison, null, 2));
        return;
      }

      printBanner();
      console.log(`${colors.bold}Evaluation Comparison Scorecard:${colors.reset}\n`);
      console.log(`  Evaluation A (Baseline): ${repA.name} [${repA.id}] (${repA.score.passPercentage.toFixed(1)}%)`);
      console.log(`  Evaluation B (Target):   ${repB.name} [${repB.id}] (${repB.score.passPercentage.toFixed(1)}%)\n`);

      console.log(`  ${'METRIC'.padEnd(20)} ${'BASELINE'.padEnd(14)} ${'TARGET'.padEnd(14)} ${'DELTA'.padEnd(16)}`);
      console.log(`  ${'─'.repeat(20)} ${'─'.repeat(14)} ${'─'.repeat(14)} ${'─'.repeat(16)}`);

      const fmtDelta = (val: number, isCurrency = false, isMs = false) => {
        const sign = val <= 0 ? '' : '+';
        const str = isCurrency ? `${sign}$${val.toFixed(4)}` : isMs ? `${sign}${val}ms` : `${sign}${val}`;
        const col = val <= 0 ? colors.green : colors.red;
        return col + str + colors.reset;
      };

      console.log(`  ${'Score'.padEnd(20)} ${repA.score.passPercentage.toFixed(1).padEnd(14)}% ${repB.score.passPercentage.toFixed(1).padEnd(14)}% ${(repB.score.passPercentage - repA.score.passPercentage).toFixed(1)}%`);
      console.log(`  ${'Spend ($)'.padEnd(20)} $${repA.metrics.cost.totalCostUsd.toFixed(4).padEnd(13)} $${repB.metrics.cost.totalCostUsd.toFixed(4).padEnd(13)} ${fmtDelta(comparison.deltas.costDeltaUsd, true)}`);
      console.log(`  ${'Latency (ms)'.padEnd(20)} ${String(repA.metrics.latency.totalDurationMs).padEnd(14)} ${String(repB.metrics.latency.totalDurationMs).padEnd(14)} ${fmtDelta(comparison.deltas.durationDeltaMs, false, true)}`);
      console.log(`  ${'Tokens'.padEnd(20)} ${String(repA.metrics.tokens.totalTokens).padEnd(14)} ${String(repB.metrics.tokens.totalTokens).padEnd(14)} ${fmtDelta(comparison.deltas.tokenDelta)}`);
      console.log(`  ${'Errors'.padEnd(20)} ${String(repA.metrics.reliability.errorCount).padEnd(14)} ${String(repB.metrics.reliability.errorCount).padEnd(14)} ${fmtDelta(comparison.deltas.errorDelta)}\n`);
      break;
    }

    case 'export': {
      const evalId = args[0];
      if (!evalId) {
        console.error(`${colors.red}✖ Error: eval_id is required.${colors.reset}`);
        console.log(`Usage: npx aethertrace evaluate export <eval_id> [--format json|markdown] [-o <file>]`);
        process.exit(1);
      }
      const rep = getEvaluation(db, evalId);
      if (!rep) {
        console.error(`${colors.red}✖ Error: Evaluation '${evalId}' not found.${colors.reset}`);
        process.exit(1);
      }
      const fmtIndex = args.findIndex((a) => a === '--format');
      const format = fmtIndex !== -1 ? args[fmtIndex + 1] : 'markdown';
      const outIndex = args.findIndex((a) => a === '-o' || a === '--output');
      const outFile = outIndex !== -1 ? args[outIndex + 1] : undefined;

      const output = format === 'json' ? exportEvaluationAsJson(rep) : exportEvaluationAsMarkdown(rep);

      if (outFile) {
        writeFileSync(outFile, output, 'utf-8');
        console.log(`${colors.green}✔ Exported evaluation to ${outFile}${colors.reset}`);
      } else {
        console.log(output);
      }
      break;
    }

    default:
      console.error(`${colors.red}Unknown evaluate subcommand: ${subcommand}${colors.reset}`);
      console.log(`Available: list, run, inspect, assert, failures, errors, optimize, compare, export`);
      process.exit(1);
  }
}

async function handleClean() {
  printBanner();
  console.log(`${colors.yellow}Cleaning local trace database...${colors.reset}`);
  const dbPath = resolve(process.cwd(), '.trace.sqlite');
  let removed = 0;
  for (const ext of ['', '-wal', '-shm']) {
    const f = `${dbPath}${ext}`;
    if (existsSync(f)) {
      try {
        unlinkSync(f);
        removed++;
      } catch {}
    }
  }
  console.log(`${colors.green}✔ Removed ${removed} database file(s). Clean state restored.${colors.reset}\n`);
}

async function handleStatus(port: number = 4000) {
  printBanner();
  try {
    const res = await fetch(`http://localhost:${port}/api/system/status`);
    if (res.ok) {
      const data = await res.json();
      console.log(`${colors.bold}AetherTrace System Status (v${data.version}):${colors.reset}`);
      console.log(`  Uptime:       ${data.uptime_seconds}s`);
      console.log(`  Memory (RSS): ${data.memory?.rss_mb} MB`);
      console.log(`  Runs Count:   ${data.database?.runs_count}`);
      console.log(`  Spans Count:  ${data.database?.spans_count}`);
      console.log(`  DB Path:      ${data.database?.path}`);
      console.log(`  WS Clients:   ${data.telemetry?.active_ws_clients}\n`);
      return;
    }
  } catch {}

  const { db } = getDatabase();
  const runsCount = (db.select().from(trace_runs).all() as any[]).length;
  const spansCount = (db.select().from(trace_spans).all() as any[]).length;
  console.log(`${colors.bold}AetherTrace Status (Offline/Local):${colors.reset}`);
  console.log(`  Proxy:        Not running on port ${port}`);
  console.log(`  Runs Count:   ${runsCount}`);
  console.log(`  Spans Count:  ${spansCount}\n`);
}

async function runCli() {
  const args = process.argv.slice(2);
  const dbIndex = args.findIndex((a) => a === '-d' || a === '--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    process.env.AETHERTRACE_DB_PATH = args[dbIndex + 1];
    // Remove db flags from args so command positions are maintained
    args.splice(dbIndex, 2);
  }

  const command = args[0] || 'start';

  switch (command) {
    case 'start': {
      const portIndex = args.findIndex((a) => a === '-p' || a === '--port');
      const port = portIndex !== -1 ? Number(args[portIndex + 1]) || 4000 : 4000;
      await handleStart(port);
      break;
    }
    case 'sim':
      await handleSim();
      break;
    case 'inspect': {
      const runId = args[1];
      await handleInspect(runId);
      break;
    }
    case 'provenance': {
      const runId = args[1];
      const isJson = args.includes('--json');
      await handleProvenance(runId, { json: isJson });
      break;
    }
    case 'compare': {
      const runA = args[1];
      const runB = args[2];
      await handleCompare(runA, runB);
      break;
    }
    case 'reproduce': {
      const runId = args[1];
      await handleReproduce(runId);
      break;
    }
    case 'diff': {
      const baseId = args[1];
      const targetId = args[2];
      await handleDiff(baseId, targetId);
      break;
    }
    case 'assert': {
      const file = args[1];
      const costIndex = args.findIndex((a) => a === '--max-cost');
      const maxCost = costIndex !== -1 ? Number(args[costIndex + 1]) : undefined;
      const latIndex = args.findIndex((a) => a === '--max-latency');
      const maxLatency = latIndex !== -1 ? Number(args[latIndex + 1]) : undefined;
      await handleAssert(file, { maxCost, maxLatency });
      break;
    }
    case 'export': {
      const runId = args[1];
      const outIndex = args.findIndex((a) => a === '-o' || a === '--output');
      const out = outIndex !== -1 ? args[outIndex + 1] : undefined;
      await handleExport(runId, out);
      break;
    }
    case 'import': {
      const file = args[1];
      await handleImport(file);
      break;
    }
    case 'search': {
      const query = args[1] || '';
      const isJson = args.includes('--json');
      const limitIndex = args.findIndex((a) => a === '--limit');
      const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : undefined;
      await handleSearch(query, { limit, json: isJson });
      break;
    }
    case 'errors': {
      const isJson = args.includes('--json');
      const limitIndex = args.findIndex((a) => a === '--limit');
      const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : undefined;
      await handleErrors({ limit, json: isJson });
      break;
    }
    case 'experiment': {
      const subcommand = args[1] || 'list';
      const subArgs = args.slice(2);
      await handleExperiment(subcommand, subArgs);
      break;
    }
    case 'evaluate': {
      const subcommand = args[1] || 'list';
      const subArgs = args.slice(2);
      await handleEvaluate(subcommand, subArgs);
      break;
    }
    case 'status': {
      const portIndex = args.findIndex((a) => a === '-p' || a === '--port');
      const port = portIndex !== -1 ? Number(args[portIndex + 1]) || 4000 : 4000;
      await handleStatus(port);
      break;
    }
    case 'clean': {
      await handleClean();
      break;
    }
    case 'version':
    case '--version':
    case '-v':
      printVersion();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}\n`);
      printHelp();
      process.exit(1);
  }
}


const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('/bin.ts') ||
    process.argv[1].endsWith('/bin.js') ||
    process.argv[1].endsWith('/aethertrace') ||
    fileURLToPath(import.meta.url) === resolve(process.argv[1]));

if (isDirectRun) {
  runCli().catch((err) => {
    console.error(`${colors.red}Fatal CLI Error:${colors.reset}`, err);
    process.exit(1);
  });
}

