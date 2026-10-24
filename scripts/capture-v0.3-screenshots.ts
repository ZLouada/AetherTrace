import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import Database from 'better-sqlite3';

const ROOT_DIR = resolve(process.cwd());
const SCREENSHOTS_DIR = resolve(ROOT_DIR, 'screenshots');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUrl(url: string, timeoutMs: number = 25000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(400);
  }
  return false;
}

function seedV03Data() {
  console.log('  ▶ Seeding deterministic v0.3.0 test traces in SQLite...');
  const db = new Database(resolve(ROOT_DIR, '.trace.sqlite'));
  const now = Date.now();

  const insertRun = db.prepare(`
    INSERT OR REPLACE INTO trace_runs (id, name, status, total_tokens, total_cost_usd, parent_run_id, forked_at_span_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSpan = db.prepare(`
    INSERT OR REPLACE INTO trace_spans (
      id, run_id, parent_span_id, span_type, agent_name, model,
      request_payload, response_payload, prompt_tokens, completion_tokens,
      cost_usd, latency_ms, cache_hit, usage_status, request_hash, created_at, execution_origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. Base Multi-Agent Security Triage Run
  insertRun.run('run_v03_base', 'Multi-Agent Security Triage', 'completed', 1850, 0.048, null, null, now - 60000);
  insertSpan.run(
    'span_v03_planner', 'run_v03_base', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Deconstruct incident alert CVE-2024-9981' }),
    JSON.stringify({ status: 'completed', steps: ['Analyze CVE', 'Scan repo', 'Draft remediation'] }),
    320, 180, 0.012, 450, 0, 'reported', 'hash_v03_1', now - 59000, 'original'
  );
  insertSpan.run(
    'span_v03_research', 'run_v03_base', 'span_v03_planner', 'tool_call', 'LeadPlanner', 'tavily_search',
    JSON.stringify({ query: 'CVE-2024-9981 exploit vectors' }),
    JSON.stringify({ results: ['RCE vulnerability found in dependency parser'] }),
    150, 90, 0.005, 320, 0, 'reported', 'hash_v03_2', now - 58000, 'original'
  );
  insertSpan.run(
    'span_v03_coder', 'run_v03_base', 'span_v03_planner', 'llm_call', 'DevSecOpsEngineer', 'gpt-4o',
    JSON.stringify({ prompt: 'Generate patch diff for CVE-2024-9981 in parser.c' }),
    JSON.stringify({ patch: 'Fixed buffer bounds check in parser.c' }),
    720, 480, 0.024, 910, 0, 'reported', 'hash_v03_3', now - 57000, 'original'
  );
  insertSpan.run(
    'span_v03_auditor', 'run_v03_base', 'span_v03_coder', 'llm_call', 'SecurityAuditor', 'claude-3-5-sonnet',
    JSON.stringify({ prompt: 'Verify patch does not break existing test cases' }),
    JSON.stringify({ verdict: 'APPROVED', regressions: 0 }),
    380, 140, 0.007, 340, 0, 'reported', 'hash_v03_4', now - 56000, 'original'
  );

  // 2. Live Paused Breakpoint Run
  insertRun.run('run_v03_paused', 'Live Auth Interception (Awaiting Review)', 'paused', 920, 0.028, null, null, now - 30000);
  insertSpan.run(
    'span_v03_p_planner', 'run_v03_paused', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Authenticate high-privilege IAM role' }),
    JSON.stringify({ status: 'in_progress', next: 'Request admin token' }),
    280, 140, 0.009, 390, 0, 'reported', 'hash_v03_p1', now - 29000, 'original'
  );
  insertSpan.run(
    'span_v03_p_interception', 'run_v03_paused', 'span_v03_p_planner', 'llm_call', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ prompt: 'Execute IAM privilege escalation for service account' }),
    JSON.stringify({
      status: 'intercepted',
      reason: "Breakpoint condition met: agent === 'LeadPlanner' && model === 'gpt-4o'",
      awaiting_human: true,
      intercepted_at: now - 27500
    }),
    410, 0, 0.015, 620, 0, 'reported', 'hash_v03_p2', now - 28000, 'original'
  );

  // 3. Replay / Fork Run with Lineage Parent
  insertRun.run('run_v03_forked', 'Fork [Lightweight Sanitizer v2]', 'completed', 810, 0.019, 'run_v03_base', 'span_v03_coder', now - 10000);
  insertSpan.run(
    'span_v03_fork_c1', 'run_v03_forked', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Cached prefix execution' }),
    JSON.stringify({ status: 'completed' }),
    320, 180, 0.0, 0, 1, 'reported', 'hash_v03_1', now - 9500, 'cached_replay'
  );
  insertSpan.run(
    'span_v03_fork_c2', 'run_v03_forked', 'span_v03_fork_c1', 'llm_call', 'DevSecOpsEngineer', 'gpt-4o-mini',
    JSON.stringify({ prompt: 'Alternative lightweight fix via input sanitation' }),
    JSON.stringify({ patch: 'Use regex validator on entry' }),
    490, 240, 0.0003, 310, 0, 'reported', 'hash_v03_f2', now - 9000, 'modified'
  );

  db.close();
  console.log('  ✔ v0.3.0 test traces seeded successfully');
}

async function main() {
  console.log('\n========================================================================');
  console.log('     AetherTrace v0.3.0 High-Fidelity UI Feature Screenshot Engine      ');
  console.log('========================================================================\n');

  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  seedV03Data();

  let proxyProcess: ChildProcess | null = null;
  let nextProcess: ChildProcess | null = null;

  try {
    // 1. Verify / Launch Proxy Server (:4000)
    console.log('[1/4] Ensuring AetherTrace Proxy is active on http://localhost:4000...');
    const proxyHealthy = await waitForUrl('http://localhost:4000/health', 1500);
    if (!proxyHealthy) {
      console.log('  ▶ Launching local proxy server instance...');
      proxyProcess = spawn('npx', ['tsx', 'apps/proxy-server/src/index.ts'], {
        cwd: ROOT_DIR,
        env: { ...process.env, PORT: '4000', AETHERTRACE_MOCK: 'true' },
        stdio: 'ignore'
      });
      const ok = await waitForUrl('http://localhost:4000/health', 15000);
      if (!ok) throw new Error('Proxy server failed to start on port 4000');
    }
    console.log('  ✔ Proxy server active');

    // 2. Verify / Launch Flight Deck (:3000)
    console.log('[2/4] Ensuring Flight Deck UI is active on http://localhost:3000...');
    const uiHealthy = await waitForUrl('http://localhost:3000', 1500);
    if (!uiHealthy) {
      console.log('  ▶ Launching Flight Deck Next.js server...');
      nextProcess = spawn('npx', ['next', 'start', '-p', '3000'], {
        cwd: resolve(ROOT_DIR, 'apps/flight-deck'),
        env: { ...process.env, PORT: '3000' },
        stdio: 'ignore'
      });
      const ok = await waitForUrl('http://localhost:3000', 25000);
      if (!ok) throw new Error('Flight Deck UI failed to start on port 3000');
    }
    console.log('  ✔ Flight Deck UI active');

    // 3. Launch Puppeteer Browser
    console.log('[3/4] Launching Chromium browser (Retina 2x, 1920x1080)...');
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 2
      }
    });

    const page = await browser.newPage();
    console.log('  ✔ Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(2500);

    console.log('[4/4] Capturing UI Feature Screenshots...');

    // Helper to select a run by name in the Run Sidebar
    const selectRunByName = async (runName: string) => {
      await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll('aside [role="button"], aside div.cursor-pointer'));
        const target = rows.find((r) => r.textContent?.includes(name));
        if (target) (target as HTMLElement).click();
      }, runName);
      await sleep(1000);
    };

    // ---------------------------------------------------------------------------------
    // Feature 1: Main Flight Deck & Execution DAG Canvas (v0.3.0)
    // ---------------------------------------------------------------------------------
    console.log('  📸 [1/10] Capturing 01_execution_dag.png...');
    await selectRunByName('Multi-Agent Security Triage');
    // Pin a span so the pin indicator and badges appear
    await page.keyboard.press('j');
    await sleep(300);
    await page.keyboard.press('p');
    await sleep(300);
    await page.keyboard.press('Escape'); // Deselect to keep full canvas clean
    await sleep(600);

    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '01_execution_dag.png') });
    console.log('     ✔ Saved 01_execution_dag.png');

    // ---------------------------------------------------------------------------------
    // Feature 2: Inspector Drawer 2.0 & Time-Travel Fork IDE
    // ---------------------------------------------------------------------------------
    console.log('  📸 [2/10] Capturing 02_inspector_drawer.png...');
    await page.keyboard.press('j');
    await sleep(300);
    await page.keyboard.press('j');
    await sleep(800);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '02_inspector_drawer.png') });
    console.log('     ✔ Saved 02_inspector_drawer.png');

    // ---------------------------------------------------------------------------------
    // Feature 3: Waterfall Execution Timeline 2.0
    // ---------------------------------------------------------------------------------
    console.log('  📸 [3/10] Capturing 03_execution_timeline.png...');
    await page.keyboard.press('t'); // Open timeline tray
    await sleep(800);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '03_execution_timeline.png') });
    console.log('     ✔ Saved 03_execution_timeline.png');

    // Close timeline and clear span selection
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.keyboard.press('t');
    await sleep(300);

    // ---------------------------------------------------------------------------------
    // Feature 4: Raycast-Style ⌘K Command Palette & FTS5 Search
    // ---------------------------------------------------------------------------------
    console.log('  📸 [4/10] Capturing 04_command_palette_search.png...');
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await sleep(600);

    const input = await page.$('input[role="combobox"]');
    if (input) {
      await input.type('model:gpt-4o', { delay: 30 });
      await sleep(700);
    }
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '04_command_palette_search.png') });
    console.log('     ✔ Saved 04_command_palette_search.png');

    // Close palette
    await page.keyboard.press('Escape');
    await sleep(400);

    // ---------------------------------------------------------------------------------
    // Feature 5: Side-by-Side Diff Arena 2.0
    // ---------------------------------------------------------------------------------
    console.log('  📸 [5/10] Capturing 05_diff_arena.png...');
    await page.keyboard.press('2'); // Switch to Diff view on App Rail
    await sleep(1500);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '05_diff_arena.png') });
    console.log('     ✔ Saved 05_diff_arena.png');

    // Return to Debugger view
    await page.keyboard.press('1');
    await sleep(600);

    // ---------------------------------------------------------------------------------
    // Feature 6: Real-Time Breakpoint HUD & Live Interception
    // ---------------------------------------------------------------------------------
    console.log('  📸 [6/10] Capturing 06_breakpoint_interceptor.png...');
    await selectRunByName('Live Auth Interception');
    await sleep(1200);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '06_breakpoint_interceptor.png') });
    console.log('     ✔ Saved 06_breakpoint_interceptor.png');

    // ---------------------------------------------------------------------------------
    // Feature 7: Chaos Engineering Fault Injection Modal
    // ---------------------------------------------------------------------------------
    console.log('  📸 [7/10] Capturing 07_chaos_engineering.png...');
    await page.keyboard.press('c'); // Open Chaos modal
    await sleep(700);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '07_chaos_engineering.png') });
    console.log('     ✔ Saved 07_chaos_engineering.png');

    // Close chaos modal
    await page.keyboard.press('Escape');
    await sleep(400);

    // ---------------------------------------------------------------------------------
    // Feature 8: Experiment Studio 2.0
    // ---------------------------------------------------------------------------------
    console.log('  📸 [8/10] Capturing 08_experiment_studio.png...');
    await page.keyboard.press('3'); // Switch to Experiments view
    await sleep(1500);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '08_experiment_studio.png') });
    console.log('     ✔ Saved 08_experiment_studio.png');

    // ---------------------------------------------------------------------------------
    // Feature 9: Evaluation Studio 2.0 & Assertions
    // ---------------------------------------------------------------------------------
    console.log('  📸 [9/10] Capturing 09_evaluation_studio.png...');
    await page.keyboard.press('4'); // Switch to Evaluations view
    await sleep(1500);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '09_evaluation_studio.png') });
    console.log('     ✔ Saved 09_evaluation_studio.png');

    // ---------------------------------------------------------------------------------
    // Feature 10: Replay Lineage & Action Feedback Banner
    // ---------------------------------------------------------------------------------
    console.log('  📸 [10/10] Capturing 10_multi_variant_matrix.png (Replay Lineage)...');
    await page.keyboard.press('1'); // Switch back to Debugger
    await sleep(600);
    await selectRunByName('Fork [Lightweight Sanitizer');
    await sleep(1200);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '10_multi_variant_matrix.png') });
    console.log('     ✔ Saved 10_multi_variant_matrix.png');

    await browser.close();
    console.log('\n✨ All 10 UI feature screenshots generated successfully into ./screenshots/!\n');
  } finally {
    if (proxyProcess) proxyProcess.kill('SIGTERM');
    if (nextProcess) nextProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('\n❌ Screenshot capture failed:', err);
  process.exit(1);
});
