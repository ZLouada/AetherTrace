import puppeteer from 'puppeteer-core';
import { spawn, ChildProcess } from 'node:child_process';
import { startServer } from '../apps/proxy-server/src/index.js';
import { closeDatabase, getDatabase } from '@aethertrace/core-schema';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const SCREENSHOT_DIR = resolve(process.cwd(), 'screenshots');
if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url: string, maxRetries = 40): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function main() {
  console.log('🚀 [1/6] Starting AetherTrace Proxy on port 4000...');
  const { server: proxyServer } = startServer(4000);
  await sleep(400);

  console.log('💻 [2/6] Starting Flight Deck UI on port 3000...');
  let nextProcess: ChildProcess | null = spawn(
    'pnpm',
    ['--filter', '@aethertrace/flight-deck', 'start', '-p', '3000'],
    {
      cwd: process.cwd(),
      stdio: 'pipe',
      detached: false
    }
  );

  const ready = await waitForUrl('http://localhost:3000');
  if (!ready) {
    throw new Error('Flight Deck server failed to become ready on http://localhost:3000');
  }
  console.log('✔ Flight Deck UI is ready at http://localhost:3000');

  console.log('⚡ [3/6] Seeding rich multi-agent trace runs...');
  const seed = Date.now();

  // 1. Simulation Run: 5-Agent DAG with Circuit Breaker Trip
  const simRunId = `run_showcase_sim_${seed}`;
  const simRunName = `Autonomous-Research-Swarm-${seed.toString().slice(-4)}`;

  // Planner
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': simRunId, 'X-Run-Name': simRunName, 'X-Agent-Name': 'Planner', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Design high-throughput distributed memory tier' }] })
  });
  const { sqlite } = getDatabase();
  const pSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC LIMIT 1').get(simRunId) as any;

  // Researcher
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': simRunId, 'X-Parent-Span-Id': pSpan.id, 'X-Agent-Name': 'Researcher', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Evaluate cache coherency protocols' }] })
  });
  const rSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(simRunId) as any;

  // Coder
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': simRunId, 'X-Parent-Span-Id': rSpan.id, 'X-Agent-Name': 'Coder', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'Implement lock-free atomic ring buffer' }] })
  });
  const cSpan = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(simRunId) as any;

  // Reviewer
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': simRunId, 'X-Parent-Span-Id': cSpan.id, 'X-Agent-Name': 'Reviewer', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Verify memory safety & memory bounds' }] })
  });

  // Rogue Loop breaker trip
  for (let i = 0; i < 3; i++) {
    await fetch('http://localhost:4000/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Run-Id': simRunId, 'X-Parent-Span-Id': cSpan.id, 'X-Agent-Name': 'Rogue Loop Agent', 'X-Replay-Mode': 'false', 'X-Mock-Upstream': 'true' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Loop cycle repeat' }] })
    });
  }

  // 2. Intercepted Live Breakpoint Run (Held in memory!)
  const bpRunId = `run_intercepted_${seed}`;
  const bpRunName = `Security-Scan-Interception-${seed.toString().slice(-4)}`;
  // Start an async request that hits a breakpoint and stays suspended
  fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Run-Id': bpRunId,
      'X-Run-Name': bpRunName,
      'X-Agent-Name': 'VulnerabilityScanner',
      'X-Breakpoint': 'true'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Scan production database ingress ports for exposed administrative credentials' }]
    })
  }).catch(() => {});
  await sleep(400);

  // 3. Diff Arena Runs: Base vs Forked Run with savings
  const baseRunId = `run_base_diff_${seed}`;
  const baseRunName = `Incident-Analysis-GPT4o-${seed.toString().slice(-4)}`;
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': baseRunId, 'X-Run-Name': baseRunName, 'X-Agent-Name': 'Architect', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Root cause analysis of gateway latency' }] })
  });
  const bSpan1 = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at ASC LIMIT 1').get(baseRunId) as any;

  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': baseRunId, 'X-Parent-Span-Id': bSpan1.id, 'X-Agent-Name': 'Diagnostician', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Query connection pool statistics' }] })
  });
  const bSpan2 = sqlite.prepare('SELECT id FROM trace_spans WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(baseRunId) as any;

  const forkRes = await fetch(`http://localhost:4000/api/spans/${bSpan2.id}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_run_name: `Incident-Analysis-Mini-${seed.toString().slice(-4)}` })
  });
  const forkData = (await forkRes.json()) as any;
  const forkedRunId = forkData.newRunId;

  // Execute step 2 in forked with gpt-4o-mini
  await fetch('http://localhost:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Run-Id': forkedRunId, 'X-Parent-Span-Id': bSpan1.id, 'X-Agent-Name': 'Diagnostician', 'X-Mock-Upstream': 'true' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Query connection pool statistics (optimized cost)' }] })
  });

  console.log('📸 [4/6] Launching Chromium browser (2x Retina resolution)...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await sleep(1500);

  console.log('📸 [5/6] Capturing high-resolution ad screenshots:');

  // SCREENSHOT 1: Main Flight Deck Workspace with full DAG canvas & metrics
  // Click on the simulation run in the sidebar
  const simRunItem = await page.waitForSelector(`div[title*="Autonomous-Research-Swarm"], h3`);
  // Click on sim run
  await page.evaluate((rName) => {
    const headings = Array.from(document.querySelectorAll('h3'));
    const target = headings.find((h) => h.textContent?.includes(rName));
    if (target) (target.closest('div[class*="cursor-pointer"]') as HTMLElement)?.click();
  }, simRunName);
  await sleep(1000);

  const file1 = resolve(SCREENSHOT_DIR, '01-flight-deck-dag-canvas.png');
  await page.screenshot({ path: file1, fullPage: false });
  console.log('  ✔ Saved:', file1);

  // SCREENSHOT 2: Inspector Drawer with Token Breakdown & Time-Travel Fork IDE
  // Click on a node in the DAG (e.g. Coder)
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    const coderNode = nodes.find((n) => n.textContent?.includes('Coder'));
    if (coderNode) (coderNode as HTMLElement).click();
    else if (nodes.length > 2) (nodes[2] as HTMLElement).click();
  });
  await sleep(1000);

  const file2 = resolve(SCREENSHOT_DIR, '02-inspector-and-fork-replay.png');
  await page.screenshot({ path: file2, fullPage: false });
  console.log('  ✔ Saved:', file2);

  // Close inspector drawer
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[title*="Close"], .fixed.right-0 button');
    if (closeBtn) (closeBtn as HTMLElement).click();
  });
  await sleep(500);

  // SCREENSHOT 3: Live Mid-Flight Breakpoint Interception (Awaiting Human Operator)
  // Select the intercepted run in the sidebar
  await page.evaluate((rName) => {
    const headings = Array.from(document.querySelectorAll('h3'));
    const target = headings.find((h) => h.textContent?.includes(rName));
    if (target) (target.closest('div[class*="cursor-pointer"]') as HTMLElement)?.click();
  }, bpRunName);
  await sleep(1000);

  // Click on the intercepted node to open the Live Action Bar
  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    if (nodes.length > 0) (nodes[0] as HTMLElement).click();
  });
  await sleep(1000);

  const file3 = resolve(SCREENSHOT_DIR, '03-live-breakpoint-interception.png');
  await page.screenshot({ path: file3, fullPage: false });
  console.log('  ✔ Saved:', file3);

  // SCREENSHOT 4: Chaos Engineering Fault Injection Harness Modal
  // Click the Chaos button in the TopBar
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const chaosBtn = buttons.find((b) => b.textContent?.includes('Chaos:'));
    if (chaosBtn) chaosBtn.click();
  });
  await sleep(1000);

  const file4 = resolve(SCREENSHOT_DIR, '04-chaos-engineering-modal.png');
  await page.screenshot({ path: file4, fullPage: false });
  console.log('  ✔ Saved:', file4);

  // Close Chaos modal
  await page.keyboard.press('Escape');
  await sleep(500);

  // SCREENSHOT 5: Side-by-Side DAG Diff Arena Modal (Model & Prompt Comparison)
  // Click "⚖️ Diff Arena" in the TopBar
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const diffBtn = buttons.find((b) => b.textContent?.includes('Diff Arena'));
    if (diffBtn) diffBtn.click();
  });
  await sleep(1500);

  // Select baseRunId and forkedRunId in the selects inside the modal
  await page.evaluate((bId, fId) => {
    const selects = Array.from(document.querySelectorAll('select'));
    if (selects.length >= 2) {
      selects[0].value = bId;
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      selects[1].value = fId;
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, baseRunId, forkedRunId);
  await sleep(1500);

  const file5 = resolve(SCREENSHOT_DIR, '05-diff-arena-model-comparison.png');
  await page.screenshot({ path: file5, fullPage: false });
  console.log('  ✔ Saved:', file5);

  console.log('\n🧹 [6/6] Cleaning up test services...');
  await browser.close();

  if (nextProcess) {
    nextProcess.kill('SIGTERM');
  }
  proxyServer.close();
  closeDatabase();

  console.log('\n✨ All 5 high-resolution ad screenshots captured successfully in screenshots/ !');
}

main().catch((err) => {
  console.error('Fatal error capturing screenshots:', err);
  process.exit(1);
});
