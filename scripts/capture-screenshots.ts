import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT_DIR = resolve(process.cwd());
const SCREENSHOTS_DIR = resolve(ROOT_DIR, 'screenshots');

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

async function main() {
  console.log('\n========================================================================');
  console.log('       AetherTrace High-Fidelity UI Feature Screenshot Engine           ');
  console.log('========================================================================\n');

  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

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
    await sleep(1500);

    console.log('[4/4] Capturing UI Feature Screenshots...');

    // ---------------------------------------------------------------------------------
    // Feature 1: Main Flight Deck & Execution DAG Canvas
    // ---------------------------------------------------------------------------------
    console.log('  📸 [1/7] Capturing 01_execution_dag.png...');
    // Ensure DAG node rendered
    try {
      await page.waitForSelector('.react-flow__node', { timeout: 8000 });
      await sleep(1000);
    } catch {
      console.log('    (No nodes rendered, taking full canvas view)');
    }
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '01_execution_dag.png')
    });
    console.log('     ✔ Saved 01_execution_dag.png');

    // ---------------------------------------------------------------------------------
    // Feature 2: Inspector Drawer & Time-Travel Fork IDE
    // ---------------------------------------------------------------------------------
    console.log('  📸 [2/7] Capturing 02_inspector_drawer.png...');
    // Select a node to expand InspectorDrawer
    await page.keyboard.press('j');
    await sleep(600);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '02_inspector_drawer.png')
    });
    console.log('     ✔ Saved 02_inspector_drawer.png');

    // ---------------------------------------------------------------------------------
    // Feature 3: Waterfall Execution Timeline
    // ---------------------------------------------------------------------------------
    console.log('  📸 [3/7] Capturing 03_execution_timeline.png...');
    // Make sure timeline is toggled open
    await sleep(400);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '03_execution_timeline.png')
    });
    console.log('     ✔ Saved 03_execution_timeline.png');

    // ---------------------------------------------------------------------------------
    // Feature 4: Instant ⌘K Command Palette & FTS5 Search
    // ---------------------------------------------------------------------------------
    console.log('  📸 [4/7] Capturing 04_command_palette_search.png...');
    // Close inspector if open
    await page.keyboard.press('Escape');
    await sleep(200);

    // Open Command Palette via button or shortcut
    const searchBtn = await page.$('button[title*="Command Palette"]');
    if (searchBtn) {
      await searchBtn.click();
    } else {
      await page.keyboard.down('Control');
      await page.keyboard.press('k');
      await page.keyboard.up('Control');
    }
    await sleep(500);

    // Type a search query into search input
    const input = await page.$('input[placeholder*="query"]');
    if (input) {
      await input.type('model:gpt-4o', { delay: 40 });
      await sleep(700);
    }
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '04_command_palette_search.png')
    });
    console.log('     ✔ Saved 04_command_palette_search.png');

    // Close palette
    await page.keyboard.press('Escape');
    await sleep(300);

    // ---------------------------------------------------------------------------------
    // Feature 5: Side-by-Side Diff Arena
    // ---------------------------------------------------------------------------------
    console.log('  📸 [5/7] Capturing 05_diff_arena.png...');
    const diffBtn = await page.$('button[title*="Diff Arena"]');
    if (diffBtn) {
      await diffBtn.click();
    } else {
      await page.keyboard.press('d');
    }
    await sleep(1200);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '05_diff_arena.png')
    });
    console.log('     ✔ Saved 05_diff_arena.png');

    // Close diff modal
    await page.keyboard.press('Escape');
    await sleep(300);

    // ---------------------------------------------------------------------------------
    // Feature 6: Live Breakpoint Interceptor & Mutation Controls
    // ---------------------------------------------------------------------------------
    console.log('  📸 [6/7] Capturing 06_breakpoint_interceptor.png...');
    const bpBtn = await page.$('button[title*="Configure Breakpoint"]');
    if (bpBtn) {
      await bpBtn.click();
    } else {
      await page.keyboard.press('b');
    }
    await sleep(600);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '06_breakpoint_interceptor.png')
    });
    console.log('     ✔ Saved 06_breakpoint_interceptor.png');

    // Close breakpoint modal
    await page.keyboard.press('Escape');
    await sleep(300);

    // ---------------------------------------------------------------------------------
    // Feature 7: Chaos Engineering Fault Injection
    // ---------------------------------------------------------------------------------
    console.log('  📸 [7/7] Capturing 07_chaos_engineering.png...');
    const chaosBtn = await page.$('button[title*="Chaos Engineering"]');
    if (chaosBtn) {
      await chaosBtn.click();
    } else {
      await page.keyboard.press('c');
    }
    await sleep(600);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '07_chaos_engineering.png')
    });
    console.log('     ✔ Saved 07_chaos_engineering.png');

    // Close chaos modal
    await page.keyboard.press('Escape');
    await sleep(300);

    await browser.close();
    console.log('\n✨ All 7 UI feature screenshots captured successfully into ./screenshots/!\n');
  } finally {
    if (proxyProcess) proxyProcess.kill('SIGTERM');
    if (nextProcess) nextProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('\n❌ Screenshot capture failed:', err);
  process.exit(1);
});
