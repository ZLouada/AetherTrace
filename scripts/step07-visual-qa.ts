import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import Database from 'better-sqlite3';

const ROOT_DIR = resolve(process.cwd());
const SCREENSHOTS_DIR = resolve(ROOT_DIR, 'screenshots', 'step07');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUrl(url: string, timeoutMs: number = 20000): Promise<boolean> {
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

function seedStep07Data() {
  console.log('  ▶ Seeding deterministic Step 07 test data in SQLite...');
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

  // 1. Base Multi-Agent Run
  insertRun.run('run_step07_base', 'Multi-Agent Security Triage', 'completed', 1450, 0.042, null, null, now - 60000);
  insertSpan.run(
    'span_s7_base_planner', 'run_step07_base', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Deconstruct incident alert CVE-2024-9981' }),
    JSON.stringify({ status: 'completed', steps: ['Analyze CVE', 'Scan repo', 'Draft remediation'] }),
    320, 180, 0.012, 450, 0, 'reported', 'hash_s7_1', now - 59000, 'original'
  );
  insertSpan.run(
    'span_s7_base_research', 'run_step07_base', 'span_s7_base_planner', 'tool_call', 'LeadPlanner', 'tavily_search',
    JSON.stringify({ query: 'CVE-2024-9981 exploit vectors' }),
    JSON.stringify({ results: ['RCE vulnerability found in dependency'] }),
    150, 90, 0.005, 320, 0, 'reported', 'hash_s7_2', now - 58000, 'original'
  );
  insertSpan.run(
    'span_s7_base_coder', 'run_step07_base', 'span_s7_base_planner', 'llm_call', 'DevSecOpsEngineer', 'gpt-4o',
    JSON.stringify({ prompt: 'Generate patch diff for CVE-2024-9981' }),
    JSON.stringify({ patch: 'Fixed buffer bounds check in parser.c' }),
    650, 420, 0.021, 880, 0, 'reported', 'hash_s7_3', now - 57000, 'original'
  );
  insertSpan.run(
    'span_s7_base_auditor', 'run_step07_base', 'span_s7_base_coder', 'llm_call', 'SecurityAuditor', 'claude-3-5-sonnet',
    JSON.stringify({ prompt: 'Verify patch does not break existing test cases' }),
    JSON.stringify({ verdict: 'APPROVED', regressions: 0 }),
    330, 110, 0.004, 290, 0, 'reported', 'hash_s7_4', now - 56000, 'original'
  );

  // 2. Intercepted / Paused Breakpoint Run
  insertRun.run('run_step07_paused', 'Live Auth Interception (Awaiting Review)', 'paused', 920, 0.028, null, null, now - 30000);
  insertSpan.run(
    'span_s7_paused_planner', 'run_step07_paused', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Authenticate high-privilege IAM role' }),
    JSON.stringify({ status: 'in_progress', next: 'Request admin token' }),
    280, 140, 0.009, 390, 0, 'reported', 'hash_s7_p1', now - 29000, 'original'
  );
  insertSpan.run(
    'span_s7_paused_interception', 'run_step07_paused', 'span_s7_paused_planner', 'llm_call', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ prompt: 'Execute IAM privilege escalation for service account' }),
    JSON.stringify({
      status: 'intercepted',
      reason: "Breakpoint condition met: agent === 'LeadPlanner' && model === 'gpt-4o'",
      awaiting_human: true,
      intercepted_at: now - 27500
    }),
    410, 0, 0.015, 620, 0, 'reported', 'hash_s7_p2', now - 28000, 'original'
  );

  // 3. Replay / Fork Run with Lineage Parent
  insertRun.run('run_step07_forked', 'Fork [Simulated Patch v2]', 'completed', 810, 0.019, 'run_step07_base', 'span_s7_base_coder', now - 10000);
  insertSpan.run(
    'span_s7_fork_c1', 'run_step07_forked', null, 'agent_state', 'LeadPlanner', 'gpt-4o',
    JSON.stringify({ task: 'Cached prefix execution' }),
    JSON.stringify({ status: 'completed' }),
    320, 180, 0.0, 0, 1, 'reported', 'hash_s7_1', now - 9500, 'cached'
  );
  insertSpan.run(
    'span_s7_fork_c2', 'run_step07_forked', 'span_s7_fork_c1', 'llm_call', 'DevSecOpsEngineer', 'gpt-4o-mini',
    JSON.stringify({ prompt: 'Alternative lightweight fix via input sanitation' }),
    JSON.stringify({ patch: 'Use regex validator on entry' }),
    490, 240, 0.0003, 310, 0, 'reported', 'hash_s7_f2', now - 9000, 'modified'
  );

  db.close();
  console.log('  ✔ Step 07 deterministic test traces seeded successfully');
}

async function main() {
  console.log('\n========================================================================');
  console.log('    AetherTrace Step 07: Interaction Polish & Debugger Flow Visual QA   ');
  console.log('========================================================================\n');

  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  seedStep07Data();

  let proxyProcess: ChildProcess | null = null;
  let nextProcess: ChildProcess | null = null;

  try {
    // 1. Verify / Launch Proxy Server (:4000)
    console.log('[1/4] Ensuring AetherTrace Proxy is active on http://localhost:4000...');
    const proxyHealthy = await waitForUrl('http://localhost:4000/health', 1000);
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
    const uiHealthy = await waitForUrl('http://localhost:3000', 1000);
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

    // 3. Launch Chromium Browser
    console.log('[3/4] Launching Chromium browser (Retina 2x)...');
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
    await sleep(2000);

    console.log('[4/4] Executing Visual QA Capture Scenarios...');

    // ---------------------------------------------------------------------------------
    // Scenario 1: Breakpoint HUD active + paused span on DAG + paused marker on Timeline
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenario 1: Breakpoint HUD & Paused Timeline Playhead...');
    // Select the paused run
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('aside div.cursor-pointer'));
      const pausedCard = cards.find((c) => c.textContent?.includes('Live Auth Interception') || c.textContent?.includes('paused'));
      if (pausedCard) (pausedCard as HTMLElement).click();
    });
    await sleep(1500);

    // Open timeline if not open
    await page.keyboard.press('t');
    await sleep(600);

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '01_breakpoint_hud_and_timeline_paused.png')
    });
    console.log('     ✔ Saved 01_breakpoint_hud_and_timeline_paused.png');

    // ---------------------------------------------------------------------------------
    // Scenario 2: Selection Ring + Pinned State Precedence
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenario 2: Selection Ring & Pinned State Precedence...');
    // Select base run
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('aside div.cursor-pointer'));
      const baseCard = cards.find((c) => c.textContent?.includes('Security Triage'));
      if (baseCard) (baseCard as HTMLElement).click();
    });
    await sleep(1500);

    // Select first span with J, Pin it with P, then navigate to next span with J
    await page.keyboard.press('j'); // Selects span 1
    await sleep(300);
    await page.keyboard.press('p'); // Pins span 1 (amber badge & ring)
    await sleep(300);
    await page.keyboard.press('j'); // Selects span 2 (bright orange ring)
    await sleep(600);

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '02_selection_and_pinned_precedence.png')
    });
    console.log('     ✔ Saved 02_selection_and_pinned_precedence.png');

    // ---------------------------------------------------------------------------------
    // Scenario 3: ReplayContextBanner on forked/replayed run
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenario 3: ReplayContextBanner on Forked Run...');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('aside div.cursor-pointer'));
      const forkCard = cards.find((c) => c.textContent?.includes('Fork [Simulated Patch') || c.textContent?.includes('Fork'));
      if (forkCard) (forkCard as HTMLElement).click();
    });
    await sleep(1500);

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '03_replay_context_banner.png')
    });
    console.log('     ✔ Saved 03_replay_context_banner.png');

    // ---------------------------------------------------------------------------------
    // Scenario 4: ActionFeedbackBanner (Trigger Copy / Feedback Toast)
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenario 4: ActionFeedbackBanner Toast...');
    // Trigger copy or action feedback toast via keyboard or palette
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await sleep(600);

    // Filter to copy
    await page.keyboard.type('Copy Run ID', { delay: 20 });
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(600);

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '04_action_feedback_banner.png')
    });
    console.log('     ✔ Saved 04_action_feedback_banner.png');

    // ---------------------------------------------------------------------------------
    // Scenario 5: Command Palette with Breakpoint Actions & Span Actions
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenario 5: Command Palette Contextual Breakpoint & Span Actions...');
    // Re-select paused run so pending breakpoint actions are available
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('aside div.cursor-pointer'));
      const pausedCard = cards.find((c) => c.textContent?.includes('Live Auth Interception') || c.textContent?.includes('paused'));
      if (pausedCard) (pausedCard as HTMLElement).click();
    });
    await sleep(1000);

    // Open palette
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await sleep(600);

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '05_command_palette_breakpoint_actions.png')
    });
    console.log('     ✔ Saved 05_command_palette_breakpoint_actions.png');

    // Close palette
    await page.keyboard.press('Escape');
    await sleep(300);

    // ---------------------------------------------------------------------------------
    // Scenario 6-9: Multi-Resolution Responsiveness (1920x1080, 1440x900, 1280x800, 1024x768)
    // ---------------------------------------------------------------------------------
    console.log('  📸 Scenarios 6–9: Multi-Resolution Viewports...');
    const viewports = [
      { name: '06_viewport_1920x1080.png', width: 1920, height: 1080 },
      { name: '07_viewport_1440x900.png', width: 1440, height: 900 },
      { name: '08_viewport_1280x800.png', width: 1280, height: 800 },
      { name: '09_viewport_1024x768.png', width: 1024, height: 768 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
      await sleep(500);
      await page.screenshot({
        path: resolve(SCREENSHOTS_DIR, vp.name)
      });
      console.log(`     ✔ Saved ${vp.name} (${vp.width}x${vp.height})`);
    }

    await browser.close();
    console.log('\n========================================================================');
    console.log('  ✨ ALL STEP 07 VISUAL QA ARTIFACTS CAPTURED SUCCESSFULLY! ✨          ');
    console.log('========================================================================\n');

  } finally {
    if (nextProcess) nextProcess.kill();
    if (proxyProcess) proxyProcess.kill();
  }
}

main().catch((err) => {
  console.error('Visual QA run failed:', err);
  process.exit(1);
});
