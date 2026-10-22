/**
 * AetherTrace Phase 8 Test Suite: Search & Developer UX Engine
 *
 * Verifies:
 * 1. Zero-eval query parser (quoted strings, operators, durations, timestamps, negation)
 * 2. SQLite FTS5 search engine & structured predicates (run, span, tool, agent, model, provenance)
 * 3. Deterministic ranking (Exact ID > Exact Name > Prefix > FTS > Time) & pagination
 * 4. Security, SQL injection immunity, prototype pollution defense, and secret redaction preservation
 * 5. Cross-run error discovery & causal chain reconstruction
 * 6. Saved searches CRUD & full index rebuild lifecycle
 * 7. Live proxy server search API endpoints & CLI search command execution
 */

import Database from 'better-sqlite3';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseSearchQuery,
  parseDurationMs,
  parseTimestampMs,
  tokenizeQuery,
  initSearchSchema,
  indexRun,
  indexSpan,
  rebuildSearchIndex,
  executeSearch,
  discoverErrors,
  getErrorCausalChain,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  runAutoMigration
} from '../packages/core-schema/src/index.js';
import { startServer } from '../apps/proxy-server/src/index.js';

const TEST_DB_PATH = resolve(process.cwd(), '.test-search-phase8.sqlite');
const TEST_PORT = 4008;

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const f = `${TEST_DB_PATH}${ext}`;
    if (existsSync(f)) {
      try { unlinkSync(f); } catch {}
    }
  }
}

async function runPhase8Tests() {
  console.log('\n===================================================================================');
  console.log('   AetherTrace Phase 8 Test: Search & Developer UX Engine                          ');
  console.log('===================================================================================\n');

  cleanup();

  const sqlite = new Database(TEST_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runAutoMigration(sqlite);

  try {
    // ---------------------------------------------------------------------------------
    // [1/7] Testing Zero-Eval Search Query Parser
    // ---------------------------------------------------------------------------------
    console.log('[1/7] Testing Zero-Eval Search Query Parser...');

    // 1.1 Duration parser
    if (parseDurationMs('5s') !== 5000) throw new Error('parseDurationMs(5s) failed');
    if (parseDurationMs('500ms') !== 500) throw new Error('parseDurationMs(500ms) failed');
    if (parseDurationMs('1.5s') !== 1500) throw new Error('parseDurationMs(1.5s) failed');
    if (parseDurationMs('2m') !== 120000) throw new Error('parseDurationMs(2m) failed');
    console.log('  ✔ Duration parsing verified (ms, s, m)');

    // 1.2 Timestamp parser
    const ts = parseTimestampMs('2026-10-01');
    if (!ts || isNaN(ts)) throw new Error('parseTimestampMs(2026-10-01) failed');
    console.log('  ✔ Timestamp/date parsing verified');

    // 1.3 Quoted tokenization
    const tokens = tokenizeQuery('agent:research "payment timeout error" status:error');
    if (tokens.length !== 3 || tokens[1] !== 'payment timeout error') {
      throw new Error(`Quoted tokenization failed: ${JSON.stringify(tokens)}`);
    }
    console.log('  ✔ Quoted string tokenizer verified');

    // 1.4 Complex multi-predicate AST parsing
    const parsed = parseSearchQuery('status:error agent:research cost:>0.10 duration:>3s model:gpt-4o -status:completed checkout timeout');
    if (parsed.terms.length !== 2 || !parsed.terms.includes('checkout') || !parsed.terms.includes('timeout')) {
      throw new Error(`Terms parsing failed: ${JSON.stringify(parsed.terms)}`);
    }

    const costFilter = parsed.filters.find((f) => f.field === 'cost_usd');
    if (!costFilter || costFilter.operator !== '>' || costFilter.value !== 0.10) {
      throw new Error(`Cost filter failed: ${JSON.stringify(costFilter)}`);
    }

    const durationFilter = parsed.filters.find((f) => f.field === 'latency_ms');
    if (!durationFilter || durationFilter.operator !== '>' || durationFilter.value !== 3000) {
      throw new Error(`Duration filter failed: ${JSON.stringify(durationFilter)}`);
    }

    const agentFilter = parsed.filters.find((f) => f.field === 'agent_name');
    if (!agentFilter || agentFilter.value !== 'research') {
      throw new Error(`Agent filter failed: ${JSON.stringify(agentFilter)}`);
    }

    const negFilter = parsed.filters.find((f) => f.field === 'status' && f.negated);
    if (!negFilter || negFilter.value !== 'completed') {
      throw new Error(`Negation filter failed: ${JSON.stringify(negFilter)}`);
    }
    console.log('  ✔ Multi-predicate AST parsing verified (status, agent, cost:>, duration:>, negation)');

    // 1.5 Query length boundary truncation (>500 chars)
    const longQuery = 'term '.repeat(200);
    const longParsed = parseSearchQuery(longQuery);
    if (longParsed.rawQuery.length > 500) {
      throw new Error('Query length limit (>500 chars) not enforced');
    }
    console.log('  ✔ Max query length safety constraint verified');

    // ---------------------------------------------------------------------------------
    // [2/7] Testing SQLite Search Engine & Structured Indexing
    // ---------------------------------------------------------------------------------
    console.log('\n[2/7] Testing SQLite Search Engine & Structured Indexing...');

    const now = Date.now();

    // Seed test runs
    const testRuns = [
      {
        id: 'run_checkout_001',
        name: 'Checkout-Agent-Flow',
        status: 'failed',
        total_tokens: 3500,
        total_cost_usd: 0.125,
        parent_run_id: null,
        provenance: JSON.stringify({ git: { branch: 'main', commit_sha: 'a91f23c' } }),
        created_at: now - 10000
      },
      {
        id: 'run_research_002',
        name: 'Market-Research-Flow',
        status: 'completed',
        total_tokens: 1200,
        total_cost_usd: 0.045,
        parent_run_id: null,
        provenance: JSON.stringify({ git: { branch: 'feature/search', commit_sha: 'b72c91a' } }),
        created_at: now - 5000
      }
    ];

    const insertRunStmt = sqlite.prepare(`
      INSERT INTO trace_runs (id, name, status, total_tokens, total_cost_usd, parent_run_id, provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of testRuns) {
      insertRunStmt.run(r.id, r.name, r.status, r.total_tokens, r.total_cost_usd, r.parent_run_id, r.provenance, r.created_at);
      indexRun(sqlite, r);
    }

    // Seed test spans
    const testSpans = [
      {
        id: 'span_root_001',
        run_id: 'run_checkout_001',
        parent_span_id: null,
        span_type: 'agent_state',
        agent_name: 'checkout-orchestrator',
        model: null,
        request_payload: JSON.stringify({ task: 'Process customer refund policy' }),
        response_payload: JSON.stringify({ state: 'started' }),
        prompt_tokens: 100,
        completion_tokens: 50,
        cost_usd: 0.005,
        latency_ms: 120,
        cache_hit: 0,
        created_at: now - 9000
      },
      {
        id: 'span_tool_websearch',
        run_id: 'run_checkout_001',
        parent_span_id: 'span_root_001',
        span_type: 'tool_call',
        agent_name: 'browser.search',
        model: null,
        request_payload: JSON.stringify({ function_call: { name: 'web_search', arguments: { query: 'stripe refund guidelines' } } }),
        response_payload: JSON.stringify({ error: { message: 'HTTP 429: Rate limit exceeded on payment gateway', code: 429 } }),
        prompt_tokens: 200,
        completion_tokens: 100,
        cost_usd: 0.012,
        latency_ms: 3200,
        cache_hit: 0,
        created_at: now - 8000
      },
      {
        id: 'span_llm_claude',
        run_id: 'run_research_002',
        parent_span_id: null,
        span_type: 'llm_call',
        agent_name: 'researcher',
        model: 'claude-3-5-sonnet-20241022',
        request_payload: JSON.stringify({ messages: [{ role: 'user', content: 'Analyze competitor AI models' }] }),
        response_payload: JSON.stringify({ choices: [{ message: { content: 'Market landscape analysis complete' } }] }),
        prompt_tokens: 800,
        completion_tokens: 400,
        cost_usd: 0.045,
        latency_ms: 1800,
        cache_hit: 0,
        created_at: now - 4000
      }
    ];

    const insertSpanStmt = sqlite.prepare(`
      INSERT INTO trace_spans (id, run_id, parent_span_id, span_type, agent_name, model, request_payload, response_payload, prompt_tokens, completion_tokens, cost_usd, latency_ms, cache_hit, request_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hash', ?)
    `);

    for (const s of testSpans) {
      insertSpanStmt.run(s.id, s.run_id, s.parent_span_id, s.span_type, s.agent_name, s.model, s.request_payload, s.response_payload, s.prompt_tokens, s.completion_tokens, s.cost_usd, s.latency_ms, s.cache_hit, s.created_at);
      indexSpan(sqlite, s);
    }

    // 2.1 Free-text search matching tool error
    const searchRes1 = executeSearch(sqlite, 'rate limit exceeded');
    if (searchRes1.total === 0 || !searchRes1.results.some((r) => r.id === 'span_tool_websearch')) {
      throw new Error(`Search 'rate limit exceeded' failed: found ${searchRes1.total}`);
    }
    console.log(`  ✔ Free-text content search verified (Found '${searchRes1.results[0].title}' in ${searchRes1.took_ms}ms)`);

    // 2.2 Model filter
    const searchRes2 = executeSearch(sqlite, 'model:claude-3-5-sonnet-20241022');
    if (searchRes2.total === 0 || !searchRes2.results.some((r) => r.id === 'span_llm_claude')) {
      throw new Error('Search by model failed');
    }
    console.log('  ✔ Structured model filter verified (model:claude-3-5-sonnet)');

    // 2.3 Cost threshold filter
    const searchRes3 = executeSearch(sqlite, 'cost:>0.10');
    if (searchRes3.total === 0 || !searchRes3.results.some((r) => r.id === 'run_checkout_001')) {
      throw new Error('Search by cost threshold failed');
    }
    console.log('  ✔ Numeric cost threshold filter verified (cost:>0.10)');

    // 2.4 Status filter
    const searchRes4 = executeSearch(sqlite, 'status:error');
    if (searchRes4.total === 0) {
      throw new Error('Search by status:error failed');
    }
    console.log('  ✔ Execution status filter verified (status:error)');

    // 2.5 Provenance Git branch filter
    const searchRes5 = executeSearch(sqlite, 'branch:feature/search');
    if (searchRes5.total === 0 || !searchRes5.results.some((r) => r.id === 'run_research_002')) {
      throw new Error('Search by git branch provenance failed');
    }
    console.log('  ✔ Provenance metadata search verified (branch:feature/search)');

    // ---------------------------------------------------------------------------------
    // [3/7] Testing Deterministic Ranking & Pagination
    // ---------------------------------------------------------------------------------
    console.log('\n[3/7] Testing Deterministic Ranking & Pagination...');

    // Exact ID lookup should rank with score = 100
    const exactRes = executeSearch(sqlite, 'run_checkout_001');
    if (exactRes.results.length === 0 || exactRes.results[0].id !== 'run_checkout_001' || exactRes.results[0].score !== 100) {
      throw new Error(`Exact ID ranking failed. Score: ${exactRes.results[0]?.score}`);
    }
    console.log('  ✔ Exact ID match ranks #1 with top deterministic score (100)');

    // Pagination test
    const paged1 = executeSearch(sqlite, '', { limit: 1, offset: 0 });
    const paged2 = executeSearch(sqlite, '', { limit: 1, offset: 1 });
    if (paged1.results.length !== 1 || paged2.results.length !== 1 || paged1.results[0].id === paged2.results[0].id) {
      throw new Error('Pagination offset/limit failed');
    }
    console.log('  ✔ Deterministic pagination limit & offset verified');

    // ---------------------------------------------------------------------------------
    // [4/7] Testing Security & Secret Redaction Preservation
    // ---------------------------------------------------------------------------------
    console.log('\n[4/7] Testing Security & Secret Redaction Preservation...');

    // 4.1 SQL Injection string safety
    const maliciousSql = "'; DROP TABLE trace_runs; SELECT * FROM trace_runs WHERE '1'='1";
    const sqlInjectionRes = executeSearch(sqlite, maliciousSql);
    // Verify trace_runs still exists and was not dropped
    const countCheck = sqlite.prepare('SELECT COUNT(*) as count FROM trace_runs').get() as { count: number };
    if (countCheck.count === 0) {
      throw new Error('SQL Injection vulnerability: trace_runs table altered or dropped');
    }
    console.log('  ✔ SQL injection payload neutralized without execution');

    // 4.2 Prototype pollution string safety
    const protoQuery = '__proto__.polluted = true';
    const protoRes = executeSearch(sqlite, protoQuery);
    if ((Object.prototype as any).polluted !== undefined) {
      throw new Error('Prototype pollution vulnerability detected');
    }
    console.log('  ✔ Prototype pollution string handled safely without code execution');

    // 4.3 Secret Redaction Guarantee: span containing plaintext API key
    const secretSpan = {
      id: 'span_secret_test',
      run_id: 'run_checkout_001',
      parent_span_id: null,
      span_type: 'llm_call',
      agent_name: 'test-agent',
      model: 'gpt-4o',
      request_payload: JSON.stringify({
        messages: [{ role: 'user', content: 'Here is my secret sk-proj-supersecretkey1234567890abcdef' }]
      }),
      response_payload: JSON.stringify({ choices: [{ message: { content: 'Secret received' } }] }),
      prompt_tokens: 10,
      completion_tokens: 10,
      cost_usd: 0.001,
      latency_ms: 100,
      cache_hit: 0,
      created_at: now
    };

    insertSpanStmt.run(secretSpan.id, secretSpan.run_id, secretSpan.parent_span_id, secretSpan.span_type, secretSpan.agent_name, secretSpan.model, secretSpan.request_payload, secretSpan.response_payload, secretSpan.prompt_tokens, secretSpan.completion_tokens, secretSpan.cost_usd, secretSpan.latency_ms, secretSpan.cache_hit, secretSpan.created_at);
    indexSpan(sqlite, secretSpan);

    // Verify plaintext secret NEVER entered trace_search
    const searchRow = sqlite.prepare("SELECT content FROM trace_search WHERE entity_id = 'span_secret_test'").get() as any;
    if (searchRow && searchRow.content.includes('supersecretkey1234567890abcdef')) {
      throw new Error('Secret Redaction Failure: plaintext API key found in search index');
    }
    console.log('  ✔ Secret Redaction Guarantee verified: plaintext credentials NEVER indexed');

    // ---------------------------------------------------------------------------------
    // [5/7] Testing Cross-Run Error Discovery & Causal Chain
    // ---------------------------------------------------------------------------------
    console.log('\n[5/7] Testing Cross-Run Error Discovery & Causal Chain...');

    const discoveredErrors = discoverErrors(sqlite);
    if (discoveredErrors.length === 0) {
      throw new Error('Error discovery failed to aggregate HTTP 429 error');
    }

    const rateLimitError = discoveredErrors.find((e) => e.errorType.includes('429'));
    if (!rateLimitError || rateLimitError.count !== 1 || rateLimitError.sampleSpanId !== 'span_tool_websearch') {
      throw new Error(`Error discovery summary mismatch: ${JSON.stringify(rateLimitError)}`);
    }
    console.log(`  ✔ Discovered ${discoveredErrors.length} error pattern(s) across runs (HTTP 429 correctly aggregated)`);

    // Causal chain inspection
    const causalChain = getErrorCausalChain(sqlite, 'span_tool_websearch');
    if (!causalChain || causalChain.causalPath.length === 0 || causalChain.causalPath[0].id !== 'span_root_001') {
      throw new Error(`Causal chain reconstruction failed: ${JSON.stringify(causalChain)}`);
    }
    console.log(`  ✔ Causal chain reconstructed: Root (${causalChain.causalPath[0].id}) → Error (${causalChain.errorSpan.id})`);

    // ---------------------------------------------------------------------------------
    // [6/7] Testing Saved Searches & Index Rebuild Lifecycle
    // ---------------------------------------------------------------------------------
    console.log('\n[6/7] Testing Saved Searches & Index Rebuild Lifecycle...');

    const initialSaved = getSavedSearches(sqlite);
    if (initialSaved.length === 0) {
      throw new Error('Default saved searches not seeded');
    }
    console.log(`  ✔ Default saved searches initialized (${initialSaved.length} quick views)`);

    // Create custom saved search
    const newSaved = createSavedSearch(sqlite, '⚡ High Latency Calls', 'duration:>2s');
    if (newSaved.name !== '⚡ High Latency Calls') throw new Error('createSavedSearch failed');

    // Delete saved search
    const deleted = deleteSavedSearch(sqlite, newSaved.id);
    if (!deleted) throw new Error('deleteSavedSearch failed');
    console.log('  ✔ Saved search CRUD operations verified');

    // Full index rebuild
    const rebuildRes = rebuildSearchIndex(sqlite);
    if (rebuildRes.runsIndexed !== 2 || rebuildRes.spansIndexed < 3) {
      throw new Error(`rebuildSearchIndex failed: ${JSON.stringify(rebuildRes)}`);
    }
    console.log(`  ✔ Authoritative index rebuild completed (${rebuildRes.runsIndexed} runs, ${rebuildRes.spansIndexed} spans in ${rebuildRes.tookMs}ms)`);

    // ---------------------------------------------------------------------------------
    // [7/7] Testing Live Proxy Server Search Endpoints & CLI Execution
    // ---------------------------------------------------------------------------------
    console.log('\n[7/7] Testing Live Proxy Server Search Endpoints & CLI Execution...');

    sqlite.close(); // Close test SQLite connection before proxy server binds
    process.env.AETHERTRACE_DB_PATH = TEST_DB_PATH;

    const { server, wss } = startServer(TEST_PORT);
    console.log(`  ✔ Live proxy server started on port ${TEST_PORT}`);

    try {
      const BASE = `http://localhost:${TEST_PORT}`;

      // 7.1 GET /api/search
      const apiSearchRes = await fetch(`${BASE}/api/search?q=status:error`);
      if (!apiSearchRes.ok) throw new Error(`GET /api/search failed: HTTP ${apiSearchRes.status}`);
      const apiSearchData = await apiSearchRes.json();
      if (!apiSearchData.results || apiSearchData.results.length === 0) {
        throw new Error('API search returned 0 results for status:error');
      }
      console.log(`  ✔ Live GET /api/search endpoint verified (${apiSearchData.results.length} result(s))`);

      // 7.2 GET /api/search/errors
      const apiErrorsRes = await fetch(`${BASE}/api/search/errors`);
      if (!apiErrorsRes.ok) throw new Error(`GET /api/search/errors failed: HTTP ${apiErrorsRes.status}`);
      const apiErrorsData = await apiErrorsRes.json();
      if (!apiErrorsData.errors || apiErrorsData.errors.length === 0) {
        throw new Error('API errors returned 0 error patterns');
      }
      console.log(`  ✔ Live GET /api/search/errors endpoint verified (${apiErrorsData.count} failure signature(s))`);

      // 7.3 GET /api/search/saved
      const apiSavedRes = await fetch(`${BASE}/api/search/saved`);
      if (!apiSavedRes.ok) throw new Error(`GET /api/search/saved failed: HTTP ${apiSavedRes.status}`);
      const apiSavedData = await apiSavedRes.json();
      if (!apiSavedData.savedSearches || apiSavedData.savedSearches.length === 0) {
        throw new Error('API saved searches returned 0 views');
      }
      console.log(`  ✔ Live GET /api/search/saved endpoint verified`);

      // 7.4 POST /api/search/rebuild
      const apiRebuildRes = await fetch(`${BASE}/api/search/rebuild`, { method: 'POST' });
      if (!apiRebuildRes.ok) throw new Error(`POST /api/search/rebuild failed: HTTP ${apiRebuildRes.status}`);
      const apiRebuildData = await apiRebuildRes.json();
      if (!apiRebuildData.success) throw new Error('API rebuild reported failure');
      console.log(`  ✔ Live POST /api/search/rebuild endpoint verified`);

      // 7.5 CLI Search Execution Test
      const cliSearchOutput = execSync(`node packages/cli/dist/bin.js search "status:error" --db "${TEST_DB_PATH}"`, {
        encoding: 'utf-8'
      });
      if (!cliSearchOutput.includes('AetherTrace Global Search') || !cliSearchOutput.includes('Checkout-Agent-Flow')) {
        throw new Error(`CLI search output verification failed:\n${cliSearchOutput}`);
      }
      console.log('  ✔ CLI search command executed and formatted output verified');

      // 7.6 CLI Errors Execution Test
      const cliErrorsOutput = execSync(`node packages/cli/dist/bin.js errors --db "${TEST_DB_PATH}"`, {
        encoding: 'utf-8'
      });
      if (!cliErrorsOutput.includes('AetherTrace Cross-Run Error Discovery') || !cliErrorsOutput.includes('RateLimit')) {
        throw new Error(`CLI errors command output verification failed:\n${cliErrorsOutput}`);
      }
      console.log('  ✔ CLI errors command executed and formatted summary table verified');

    } finally {
      server.close();
      wss.close();
      console.log('  ✔ Live proxy server stopped cleanly');
    }

    console.log('\n===================================================================================');
    console.log('   ✔ ALL PHASE 8 SEARCH & DEVELOPER UX TESTS PASSED (100% GREEN)                   ');
    console.log('===================================================================================\n');

  } finally {
    cleanup();
  }
}

runPhase8Tests().catch((err) => {
  console.error('\n✖ Phase 8 Test Failure:', err);
  cleanup();
  process.exit(1);
});
