import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import Database from 'better-sqlite3';

const ROOT_DIR = resolve(process.cwd());
const CLEANUP_DIR = resolve(ROOT_DIR, 'screenshots', 'cleanup');
const SCREENSHOTS_DIR = resolve(ROOT_DIR, 'screenshots');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function seedData() {
  console.log('  ▶ Seeding deterministic test traces in SQLite...');
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

  // 3. Replay / Fork Run
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
  console.log('  ✔ Test traces seeded successfully');
}

async function main() {
  console.log('\n========================================================================');
  console.log('    AetherTrace Visual Cleanup: Background Grid & Logo Banner QA        ');
  console.log('========================================================================\n');

  if (!existsSync(CLEANUP_DIR)) {
    mkdirSync(CLEANUP_DIR, { recursive: true });
  }

  seedData();

  let proxyProcess: ChildProcess | null = null;
  let nextProcess: ChildProcess | null = null;

  try {
    // 1. Ensure Proxy is active
    console.log('[1/5] Ensuring AetherTrace Proxy is active on http://localhost:4000...');
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

    // 2. Ensure Flight Deck UI is active
    console.log('[2/5] Ensuring Flight Deck UI is active on http://localhost:3000...');
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

    // 3. Launch Chromium
    console.log('[3/5] Launching Chromium browser (Retina 2x)...');
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--force-device-scale-factor=2'
      ]
    });

    const page = await browser.newPage();

    // 4. Verification Check: No background dots/grid in DOM
    console.log('[4/5] Auditing DOM for background dots/grid and logo banner...');
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    await sleep(2500);

    const auditResults = await page.evaluate(() => {
      const backgroundSvg = document.querySelector('.react-flow__background');
      const backgroundPattern = document.querySelector('pattern');
      const canvasBg = window.getComputedStyle(document.querySelector('.react-flow') || document.body).backgroundColor;

      // Check TopBar branding elements
      const topBarHeader = document.querySelector('header');
      const hasDecorativeBox = topBarHeader ? topBarHeader.querySelector('.w-6.h-6.rounded') !== null : false;
      const topBarText = topBarHeader?.textContent || '';
      const hasAetherTraceText = topBarText.includes('AETHERTRACE');
      const hasDebuggerBadge = topBarText.includes('DEBUGGER');

      return {
        hasBackgroundSvg: Boolean(backgroundSvg),
        hasBackgroundPattern: Boolean(backgroundPattern),
        canvasBg,
        hasDecorativeBox,
        hasAetherTraceText,
        hasDebuggerBadge
      };
    });

    console.log(`  • Background SVG rendered: ${auditResults.hasBackgroundSvg ? '❌ YES (Defect)' : '✔ NONE (Clean solid canvas)'}`);
    console.log(`  • SVG Pattern in DOM: ${auditResults.hasBackgroundPattern ? '❌ YES (Defect)' : '✔ NONE'}`);
    console.log(`  • Canvas Background Color: ${auditResults.canvasBg}`);
    console.log(`  • Decorative Logo Box in TopBar: ${auditResults.hasDecorativeBox ? '❌ YES (Defect)' : '✔ REMOVED (Clean direct icon)'}`);
    console.log(`  • Product Identity Present: ${auditResults.hasAetherTraceText && auditResults.hasDebuggerBadge ? '✔ YES (AETHERTRACE DEBUGGER)' : '❌ MISSING'}`);

    if (auditResults.hasBackgroundSvg) {
      console.warn('⚠️ Warning: .react-flow__background element detected');
    }
    if (auditResults.hasDecorativeBox) {
      console.warn('⚠️ Warning: Decorative logo box detected in TopBar');
    }

    // 5. Capture Responsive Viewports
    console.log('[5/5] Capturing Responsive Viewports (Clean Canvas & TopBar)...');

    const viewports = [
      { name: 'viewport_1920x1080.png', width: 1920, height: 1080 },
      { name: 'viewport_1440x900.png', width: 1440, height: 900 },
      { name: 'viewport_1280x800.png', width: 1280, height: 800 },
      { name: 'viewport_1024x768.png', width: 1024, height: 768 }
    ];

    for (const vp of viewports) {
      console.log(`  📸 Capturing ${vp.name} (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
      await sleep(1200);

      const filePath = resolve(CLEANUP_DIR, vp.name);
      await page.screenshot({ path: filePath as `${string}.png`, fullPage: false });
      console.log(`     ✔ Saved ${vp.name}`);
    }

    // Also update 01_execution_dag.png in screenshots/
    console.log('  📸 Updating 01_execution_dag.png with clean solid background...');
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await sleep(800);
    await page.screenshot({ path: resolve(SCREENSHOTS_DIR, '01_execution_dag.png') as `${string}.png`, fullPage: false });
    console.log('     ✔ Saved 01_execution_dag.png');

    await browser.close();
    console.log('\n✨ Visual cleanup QA & screenshot capture completed successfully!\n');
  } finally {
    if (proxyProcess) proxyProcess.kill();
    if (nextProcess) nextProcess.kill();
  }
}

main().catch((err) => {
  console.error('Fatal error during visual cleanup QA:', err);
  process.exit(1);
});
