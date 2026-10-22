/**
 * AetherTrace Phase 10 Test Suite: Productization & Release Engineering
 *
 * Verifies:
 * 1. CLI binary distribution (--version, -v, version, --help, help) & exit codes
 * 2. Package manifest consistency & packaging hygiene (whitelist files, versions, licenses)
 * 3. Standalone example applications integrity (quickstart, llm-agent, tool-calls, replay, debugging)
 * 4. Docker topology, container healthchecks, graceful entrypoint script, and compose.yaml
 * 5. Environment configuration (.env.example) and documentation architecture integrity
 * 6. Self-observability system status endpoint (GET /api/system/status)
 * 7. Git repository hygiene & distribution artifact exclusions
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { startServer } from '../apps/proxy-server/src/index.js';

const ROOT_DIR = resolve(process.cwd());

async function runPhase10Tests() {
  console.log('\n===================================================================================');
  console.log('   AetherTrace Phase 10 Test: Productization & Release Engineering                 ');
  console.log('===================================================================================\n');

  try {
    // ---------------------------------------------------------------------------------
    // [1/7] Testing CLI Version, Help, & Binary Invocation
    // ---------------------------------------------------------------------------------
    console.log('[1/7] Testing CLI Version, Help, & Binary Invocation...');

    // 1.1 --version flag
    const versionOutput = execSync('npx tsx packages/cli/src/bin.ts --version', {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    }).trim();
    if (versionOutput !== 'aethertrace v0.1.0') {
      throw new Error(`CLI --version mismatch: expected "aethertrace v0.1.0", got "${versionOutput}"`);
    }

    // 1.2 -v shorthand
    const shortVersionOutput = execSync('npx tsx packages/cli/src/bin.ts -v', {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    }).trim();
    if (shortVersionOutput !== 'aethertrace v0.1.0') {
      throw new Error(`CLI -v mismatch: expected "aethertrace v0.1.0", got "${shortVersionOutput}"`);
    }

    // 1.3 version command
    const cmdVersionOutput = execSync('npx tsx packages/cli/src/bin.ts version', {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    }).trim();
    if (cmdVersionOutput !== 'aethertrace v0.1.0') {
      throw new Error(`CLI version command mismatch: expected "aethertrace v0.1.0", got "${cmdVersionOutput}"`);
    }

    // 1.4 --help menu & command registry
    const helpOutput = execSync('npx tsx packages/cli/src/bin.ts --help', {
      cwd: ROOT_DIR,
      encoding: 'utf-8'
    });

    const expectedCommands = [
      'start',
      'sim',
      'diff',
      'assert',
      'export',
      'import',
      'reproduce',
      'provenance',
      'search',
      'status',
      'clean',
      'version',
      'help'
    ];

    for (const cmd of expectedCommands) {
      if (!helpOutput.includes(cmd)) {
        throw new Error(`CLI help missing documented command: ${cmd}`);
      }
    }
    console.log('  ✔ CLI binary supports --version, -v, version, and documents all 13 commands');

    // ---------------------------------------------------------------------------------
    // [2/7] Testing Package Manifests & Distribution Hygiene
    // ---------------------------------------------------------------------------------
    console.log('[2/7] Testing Package Manifests & Distribution Packaging Guardrails...');

    // 2.1 Root package.json
    const rootPkg = JSON.parse(readFileSync(resolve(ROOT_DIR, 'package.json'), 'utf-8'));
    if (rootPkg.version !== '0.1.0') {
      throw new Error(`Root package.json version mismatch: expected 0.1.0, got ${rootPkg.version}`);
    }

    // 2.2 CLI package.json
    const cliPkg = JSON.parse(readFileSync(resolve(ROOT_DIR, 'packages/cli/package.json'), 'utf-8'));
    if (cliPkg.version !== '0.1.0') throw new Error(`CLI package version is not 0.1.0: ${cliPkg.version}`);
    if (cliPkg.license !== 'MIT') throw new Error(`CLI package license is not MIT: ${cliPkg.license}`);
    if (!cliPkg.bin || !cliPkg.bin.aethertrace) throw new Error('CLI package missing bin entry');
    if (!Array.isArray(cliPkg.files) || !cliPkg.files.includes('dist')) {
      throw new Error('CLI package.json missing "files" whitelist including "dist"');
    }

    // 2.3 TS SDK package.json
    const sdkTsPkg = JSON.parse(readFileSync(resolve(ROOT_DIR, 'packages/sdk-ts/package.json'), 'utf-8'));
    if (sdkTsPkg.version !== '0.1.0') throw new Error(`TS SDK package version is not 0.1.0: ${sdkTsPkg.version}`);
    if (sdkTsPkg.license !== 'MIT') throw new Error(`TS SDK package license is not MIT: ${sdkTsPkg.license}`);
    if (!Array.isArray(sdkTsPkg.files) || !sdkTsPkg.files.includes('dist')) {
      throw new Error('TS SDK package.json missing "files" whitelist including "dist"');
    }

    // 2.4 Core Schema & Pricing Engine
    const corePkg = JSON.parse(readFileSync(resolve(ROOT_DIR, 'packages/core-schema/package.json'), 'utf-8'));
    if (corePkg.version !== '0.1.0' || corePkg.license !== 'MIT') throw new Error('Core schema package metadata invalid');
    const pricingPkg = JSON.parse(readFileSync(resolve(ROOT_DIR, 'packages/pricing-engine/package.json'), 'utf-8'));
    if (pricingPkg.version !== '0.1.0' || pricingPkg.license !== 'MIT') throw new Error('Pricing engine package metadata invalid');

    // 2.5 Python SDK pyproject.toml & __version__
    const pyprojectContent = readFileSync(resolve(ROOT_DIR, 'packages/sdk-python/pyproject.toml'), 'utf-8');
    if (!pyprojectContent.includes('version = "0.1.0"')) {
      throw new Error('Python SDK pyproject.toml version is not 0.1.0');
    }
    if (!pyprojectContent.includes('MIT')) {
      throw new Error('Python SDK pyproject.toml missing MIT license');
    }
    const pyInitContent = readFileSync(resolve(ROOT_DIR, 'packages/sdk-python/aethertrace/__init__.py'), 'utf-8');
    if (!pyInitContent.includes('__version__ = "0.1.0"') || !pyInitContent.includes('"__version__"')) {
      throw new Error('Python SDK aethertrace/__init__.py does not export __version__ = "0.1.0"');
    }
    console.log('  ✔ All package manifests aligned on v0.1.0 with MIT license and distribution packaging whitelists');

    // ---------------------------------------------------------------------------------
    // [3/7] Testing Standalone Example Applications
    // ---------------------------------------------------------------------------------
    console.log('[3/7] Testing Standalone Example Applications Integrity...');

    const expectedExamples = [
      { dir: 'quickstart', script: 'index.ts' },
      { dir: 'llm-agent', script: 'agent.ts' },
      { dir: 'tool-calls', script: 'tools.ts' },
      { dir: 'replay', script: 'replay.ts' },
      { dir: 'debugging', script: 'debug-loop.ts' }
    ];

    for (const ex of expectedExamples) {
      const scriptPath = resolve(ROOT_DIR, 'examples', ex.dir, ex.script);
      const readmePath = resolve(ROOT_DIR, 'examples', ex.dir, 'README.md');

      if (!existsSync(scriptPath)) {
        throw new Error(`Example script missing: ${scriptPath}`);
      }
      if (!existsSync(readmePath)) {
        throw new Error(`Example README missing: ${readmePath}`);
      }

      const scriptContent = readFileSync(scriptPath, 'utf-8');
      const readmeContent = readFileSync(readmePath, 'utf-8');

      if (scriptContent.length < 200 || scriptContent.includes('TODO')) {
        throw new Error(`Example ${ex.dir}/${ex.script} has invalid or incomplete implementation`);
      }
      if (readmeContent.length < 100) {
        throw new Error(`Example ${ex.dir}/README.md is too short or empty`);
      }
    }
    console.log('  ✔ All 5 standalone examples (quickstart, llm-agent, tool-calls, replay, debugging) verified');

    // ---------------------------------------------------------------------------------
    // [4/7] Testing Environment Configuration & Docker Topology
    // ---------------------------------------------------------------------------------
    console.log('[4/7] Testing Environment Configuration & Docker Topology...');

    // 4.1 .env.example
    const envExamplePath = resolve(ROOT_DIR, '.env.example');
    if (!existsSync(envExamplePath)) throw new Error('.env.example missing');
    const envContent = readFileSync(envExamplePath, 'utf-8');
    const requiredEnvKeys = [
      'PORT',
      'AETHERTRACE_DB_PATH',
      'OPENAI_API_KEY',
      'OPENAI_BASE_URL',
      'AETHERTRACE_MOCK',
      'AETHERTRACE_AUTH_TOKEN',
      'AETHERTRACE_ALLOWED_ORIGINS',
      'AETHERTRACE_ALLOW_PRIVATE_NETWORK',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_WS_URL'
    ];
    for (const key of requiredEnvKeys) {
      if (!envContent.includes(key)) {
        throw new Error(`.env.example missing expected key: ${key}`);
      }
    }

    // 4.2 Dockerfile
    const dockerfilePath = resolve(ROOT_DIR, 'Dockerfile');
    if (!existsSync(dockerfilePath)) throw new Error('Dockerfile missing');
    const dockerContent = readFileSync(dockerfilePath, 'utf-8');
    if (!dockerContent.includes('HEALTHCHECK') || !dockerContent.includes('docker-entrypoint.sh')) {
      throw new Error('Dockerfile missing HEALTHCHECK or docker-entrypoint.sh');
    }

    // 4.3 compose.yaml
    const composePath = resolve(ROOT_DIR, 'compose.yaml');
    if (!existsSync(composePath)) throw new Error('compose.yaml missing');
    const composeContent = readFileSync(composePath, 'utf-8');
    if (!composeContent.includes('3000:3000') || !composeContent.includes('4000:4000') || !composeContent.includes('/data')) {
      throw new Error('compose.yaml missing port 3000, 4000 or volume mapping');
    }

    // 4.4 docker-entrypoint.sh
    const entrypointPath = resolve(ROOT_DIR, 'scripts/docker-entrypoint.sh');
    if (!existsSync(entrypointPath)) throw new Error('scripts/docker-entrypoint.sh missing');
    const entryContent = readFileSync(entrypointPath, 'utf-8');
    if (!entryContent.includes('trap cleanup') || !entryContent.includes('TERM')) {
      throw new Error('scripts/docker-entrypoint.sh missing signal trap for graceful shutdown');
    }
    console.log('  ✔ .env.example, Dockerfile, compose.yaml, and graceful entrypoint verified');

    // ---------------------------------------------------------------------------------
    // [5/7] Testing Documentation Architecture & Open Source Standards
    // ---------------------------------------------------------------------------------
    console.log('[5/7] Testing Documentation Architecture & Open Source Standards...');

    const requiredDocs = [
      'docs/getting-started/quickstart.md',
      'docs/getting-started/installation.md',
      'docs/getting-started/configuration.md',
      'docs/guides/debugging.md',
      'docs/guides/diffing.md',
      'docs/guides/regression-gates.md',
      'docs/guides/search.md',
      'docs/sdk/typescript.md',
      'docs/sdk/python.md',
      'docs/cli/commands.md',
      'docs/deployment/docker.md',
      'docs/contributing/development.md',
      'docs/contributing/testing.md',
      'docs/contributing/architecture.md',
      'docs/performance/phase10-profile.md',
      'docs/architecture/phase10-readiness-audit.md',
      'docs/architecture/current-state.md',
      'CHANGELOG.md',
      'CODE_OF_CONDUCT.md',
      'CONTRIBUTING.md',
      'LICENSE',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
      '.github/ISSUE_TEMPLATE/documentation.md'
    ];

    for (const doc of requiredDocs) {
      const fullPath = resolve(ROOT_DIR, doc);
      if (!existsSync(fullPath)) {
        throw new Error(`Required documentation or community file missing: ${doc}`);
      }
      const stat = statSync(fullPath);
      if (stat.size < 50) {
        throw new Error(`Documentation file is empty or trivial: ${doc}`);
      }
    }
    console.log(`  ✔ All ${requiredDocs.length} documentation, workflow, and open source files verified`);

    // ---------------------------------------------------------------------------------
    // [6/7] Testing Self-Observability System Status API
    // ---------------------------------------------------------------------------------
    console.log('[6/7] Testing Self-Observability System Status API (GET /api/system/status)...');

    const TEST_STATUS_PORT = 4018;
    const { server, wss } = startServer(TEST_STATUS_PORT);

    try {
      const statusRes = await fetch(`http://localhost:${TEST_STATUS_PORT}/api/system/status`);
      if (!statusRes.ok) {
        throw new Error(`GET /api/system/status returned HTTP ${statusRes.status}`);
      }

      const statusJson = await statusRes.json();
      if (statusJson.status !== 'ok') {
        throw new Error(`System status payload status mismatch: expected "ok", got "${statusJson.status}"`);
      }
      if (statusJson.version !== '0.1.0') {
        throw new Error(`System status version mismatch: expected "0.1.0", got "${statusJson.version}"`);
      }
      if (typeof statusJson.uptime_seconds !== 'number' || statusJson.uptime_seconds < 0) {
        throw new Error('System status uptime_seconds is invalid');
      }
      if (!statusJson.memory || typeof statusJson.memory.rss_mb !== 'number') {
        throw new Error('System status memory metrics invalid');
      }
      if (!statusJson.database || typeof statusJson.database.runs_count !== 'number' || typeof statusJson.database.spans_count !== 'number') {
        throw new Error('System status database metrics invalid');
      }
      if (!statusJson.telemetry || typeof statusJson.telemetry.active_ws_clients !== 'number') {
        throw new Error('System status telemetry metrics invalid');
      }
      console.log(`  ✔ System status API returned healthy diagnostics: Uptime: ${statusJson.uptime_seconds}s | RSS: ${statusJson.memory.rss_mb} MB | Runs: ${statusJson.database.runs_count} | Spans: ${statusJson.database.spans_count}`);
    } finally {
      server.close();
      wss.close();
    }

    // ---------------------------------------------------------------------------------
    // [7/7] Testing Git Hygiene & Packaging Exclusions
    // ---------------------------------------------------------------------------------
    console.log('[7/7] Testing Git Hygiene & Packaging Exclusions...');

    const gitignoreContent = readFileSync(resolve(ROOT_DIR, '.gitignore'), 'utf-8');
    const requiredIgnores = [
      'node_modules',
      'dist',
      '.turbo',
      '*.sqlite',
      '.trace.sqlite*',
      '.env',
      '*.egg-info',
      'build/',
      '__pycache__',
      '*.whl',
      '*.tar.gz'
    ];

    for (const ign of requiredIgnores) {
      if (!gitignoreContent.includes(ign)) {
        throw new Error(`.gitignore missing rule for: ${ign}`);
      }
    }

    console.log('  ✔ .gitignore properly excludes databases, logs, virtualenvs, wheels, and tarballs');

    console.log('\n===================================================================================');
    console.log('   🎉 Phase 10 Open Source Productization & Release Suite: 100% PASSED            ');
    console.log('===================================================================================\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Phase 10 Release Test Failed:\n', error);
    process.exit(1);
  }
}

runPhase10Tests();
