#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '@aethertrace/proxy-server';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  computeRunDiff,
  type TraceRun,
  type TraceSpan,
  type RunDiffResult,
  type RegressionAssertionResult
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

function printHelp() {
  printBanner();
  console.log(`${colors.bold}USAGE:${colors.reset}`);
  console.log(`  npx aethertrace <command> [options]\n`);
  console.log(`${colors.bold}COMMANDS:${colors.reset}`);
  console.log(`  ${colors.green}start${colors.reset}                      Launch local proxy server (port 4000) & event bus`);
  console.log(`  ${colors.green}sim${colors.reset}                        Execute a 5-step autonomous multi-agent simulation`);
  console.log(`  ${colors.green}diff <base_id> <target_id>${colors.reset} Compare two runs side-by-side in an ASCII diff matrix`);
  console.log(`  ${colors.green}assert <trace.json>${colors.reset}        Assert budget, latency SLA, and zero-breaker status`);
  console.log(`  ${colors.green}export <run_id>${colors.reset}            Export a run to a portable .trace.json bundle`);
  console.log(`  ${colors.green}import <file.json>${colors.reset}         Import a .trace.json bundle into local SQLite`);
  console.log(`  ${colors.green}help${colors.reset}                       Show this help menu\n`);
  console.log(`${colors.bold}OPTIONS:${colors.reset}`);
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

  const bundle = {
    version: '1.0',
    exported_at: Date.now(),
    run: runs[0],
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

    db.insert(trace_runs).values({
      id: runData.id,
      name: runData.name || 'imported-run',
      status: runData.status || 'completed',
      total_tokens: runData.total_tokens || 0,
      total_cost_usd: runData.total_cost_usd || 0.0,
      parent_run_id: runData.parent_run_id || null,
      forked_at_span_id: runData.forked_at_span_id || null,
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
    } else if (step.status === 'modified_fork') {
      statusBadge = `${colors.yellow}🔀 FORK POINT   ${colors.reset}     `;
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

async function runCli() {
  const args = process.argv.slice(2);
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

