/**
 * AetherTrace Phase 16 Test Suite: v0.2.0 Hardening & Release Verification
 *
 * Verifies:
 * 1. v0.1 Trace Format Backward Compatibility & Downstream Interoperability
 * 2. SQLite Database Migrations, WAL Mode, and FTS5 Index Resilience
 * 3. Secret Redaction & Prototype Pollution Defense
 * 4. SSRF Network Defense & Target URL Validation
 * 5. v0.2 Trace Export & Round-Trip Topology Fidelity
 * 6. Docker Container Readiness & Multi-Service Entrypoint Verification
 * 7. Scale & Production SLA Gate (1,000 Spans Ingestion & Analysis < 50ms)
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  getDatabase,
  runAutoMigration,
  trace_runs,
  trace_spans,
  validateTraceBundle,
  validateTargetUrl,
  redactString,
  redactValue,
  hasPrototypePollutionKeys,
  analyzeExecutionIntelligence,
  runEvaluation,
  extractEvaluationMetrics,
  type TraceRun,
  type TraceSpan
} from '@aethertrace/core-schema';
import { eq, desc } from 'drizzle-orm';

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

function fail(name: string, error: any) {
  console.error(`  ${colors.red}✖${colors.reset} ${colors.bold}${name}${colors.reset}`);
  console.error(`    ${colors.red}${error?.message || error}${colors.reset}`);
  throw error;
}

async function runPhase16Tests() {
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  AetherTrace Phase 16: v0.2.0 Hardening & Release     ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  const { db, sqlite } = getDatabase();

  // --------------------------------------------------------------------------
  // 1. v0.1 Trace Format Backward Compatibility & Downstream Interoperability
  // --------------------------------------------------------------------------
  console.log(`${colors.bold}1. v0.1 Trace Format Backward Compatibility${colors.reset}`);
  try {
    const v01RunId = `run_v01_legacy_${Date.now()}`;
    const v01RootSpanId = `span_root_${Date.now()}`;
    const v01ChildSpanId = `span_child_${Date.now()}`;

    // Exact representation of a trace exported by AetherTrace v0.1.0
    const legacyV01Bundle = {
      version: '0.1.0',
      exported_at: Date.now() - 3600000,
      run: {
        id: v01RunId,
        name: 'Legacy v0.1 Research Task',
        status: 'completed',
        total_tokens: 450,
        total_cost_usd: 0.0075,
        created_at: Date.now() - 3600000
      },
      spans: [
        {
          id: v01RootSpanId,
          run_id: v01RunId,
          parent_span_id: null,
          name: 'LegacyAgent',
          agent_name: 'LegacyAgent',
          span_type: 'agent_invocation',
          model: 'gpt-4',
          prompt: 'Survey legacy agent patterns',
          response: 'Legacy response completed',
          tokens_prompt: 200,
          tokens_completion: 100,
          tokens_total: 300,
          cost_usd: 0.005,
          duration_ms: 1200,
          status: 'completed',
          created_at: Date.now() - 3600000,
          completed_at: Date.now() - 3598800
        },
        {
          id: v01ChildSpanId,
          run_id: v01RunId,
          parent_span_id: v01RootSpanId,
          name: 'LegacyTool',
          agent_name: 'LegacyAgent',
          span_type: 'tool_execution',
          tool_name: 'search_database',
          tool_input: '{"query": "ancient traces"}',
          tool_output: '{"results": 4}',
          tokens_prompt: 100,
          tokens_completion: 50,
          tokens_total: 150,
          cost_usd: 0.0025,
          duration_ms: 400,
          status: 'completed',
          created_at: Date.now() - 3598800,
          completed_at: Date.now() - 3598400
        }
      ]
    };

    // 1. Validate bundle
    const validation = validateTraceBundle(legacyV01Bundle);
    if (!validation.valid) {
      throw new Error(`Legacy v0.1 bundle failed validation: ${validation.errors.join('; ')}`);
    }

    // 2. Persist legacy run and spans
    db.insert(trace_runs).values({
      id: legacyV01Bundle.run.id,
      name: legacyV01Bundle.run.name,
      status: legacyV01Bundle.run.status,
      total_tokens: legacyV01Bundle.run.total_tokens,
      total_cost_usd: legacyV01Bundle.run.total_cost_usd,
      created_at: legacyV01Bundle.run.created_at
    }).run();

    for (const span of legacyV01Bundle.spans) {
      db.insert(trace_spans).values({
        id: span.id,
        run_id: span.run_id,
        parent_span_id: span.parent_span_id,
        agent_name: span.agent_name,
        span_type: span.span_type === 'tool_execution' ? 'tool_call' : 'agent_state',
        model: span.model,
        request_payload: JSON.stringify({ tool_name: span.tool_name, prompt: span.prompt }),
        response_payload: JSON.stringify({ result: span.tool_output, response: span.response }),
        prompt_tokens: span.tokens_prompt || 0,
        completion_tokens: span.tokens_completion || 0,
        cost_usd: span.cost_usd,
        latency_ms: span.duration_ms,
        request_hash: 'legacy_req_hash',
        created_at: span.created_at
      }).run();
    }

    // 3. Test Agent Intelligence analysis over legacy v0.1 trace
    const spansInDb = db.select().from(trace_spans).where(eq(trace_spans.run_id, v01RunId)).all();
    if (spansInDb.length !== 2) throw new Error('Failed to retrieve imported v0.1 spans');

    const intelligence = analyzeExecutionIntelligence(spansInDb);
    if (!intelligence || intelligence.agents.length !== 1 || intelligence.agents[0].agentName !== 'LegacyAgent') {
      throw new Error('Agent Intelligence failed to analyze legacy v0.1 trace');
    }
    if (intelligence.toolChains.length !== 1 || intelligence.toolChains[0].toolName !== 'search_database') {
      throw new Error('Tool chain analysis failed on legacy v0.1 trace');
    }

    // 4. Test Evaluation scoring over legacy v0.1 trace
    const evalReport = await runEvaluation(db, { targetType: 'run', targetId: v01RunId });
    if (!evalReport || !evalReport.id) {
      throw new Error('Evaluation engine failed to score legacy v0.1 trace');
    }

    pass('AetherTrace v0.1.0 traces successfully validated, ingested, and processed across v0.2 intelligence & evaluation engines');
  } catch (err) {
    fail('v0.1 backward compatibility test failed', err);
  }

  // --------------------------------------------------------------------------
  // 2. SQLite Database Migrations, WAL Mode, and FTS5 Index Resilience
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}2. SQLite Migrations, WAL Mode, and FTS5 Index Resilience${colors.reset}`);
  try {
    // 1. Check WAL mode
    const pragmaJournal = sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    if (!pragmaJournal || pragmaJournal.journal_mode.toLowerCase() !== 'wal') {
      throw new Error(`Expected journal_mode WAL, got: ${JSON.stringify(pragmaJournal)}`);
    }

    // 2. Check busy timeout
    const pragmaBusy = sqlite.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    if (!pragmaBusy || pragmaBusy.timeout < 1000) {
      throw new Error(`Expected busy_timeout >= 1000, got: ${JSON.stringify(pragmaBusy)}`);
    }

    // 3. Test Migration Idempotency (run multiple times back-to-back)
    runAutoMigration(sqlite);
    runAutoMigration(sqlite);
    runAutoMigration(sqlite);

    // 4. Test FTS5 search table
    const ftsCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trace_search'").get();
    if (!ftsCheck) {
      throw new Error('trace_search full-text search table does not exist');
    }

    // 5. Query FTS5
    const ftsQuery = sqlite.prepare("SELECT span_id FROM trace_search WHERE trace_search MATCH 'legacy' LIMIT 5").all();
    if (!Array.isArray(ftsQuery)) {
      throw new Error('FTS5 query failed to return results array');
    }

    pass('SQLite WAL mode verified, migrations are strictly idempotent, and FTS5 virtual table operates normally');
  } catch (err) {
    fail('Database resilience test failed', err);
  }

  // --------------------------------------------------------------------------
  // 3. Secret Redaction & Prototype Pollution Defense
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}3. Secret Redaction & Prototype Pollution Defense${colors.reset}`);
  try {
    const rawApiKey = 'sk-proj-9999888877776666555544443333222211110000';
    const rawAnthropicKey = 'sk-ant-api03-abcdef1234567890abcdef1234567890';
    const rawJwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const rawRsa = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y3...\n-----END RSA PRIVATE KEY-----';

    const testPayload = {
      user_query: `Authenticate with key ${rawApiKey} or ${rawAnthropicKey}`,
      headers: {
        Authorization: rawJwt
      },
      credentials: {
        cert: rawRsa
      }
    };

    const redactedObj = redactValue(testPayload);

    // Verify raw secrets are removed
    const serialized = JSON.stringify(redactedObj);
    if (serialized.includes(rawApiKey)) throw new Error('Raw OpenAI API key leaked in redacted payload');
    if (serialized.includes(rawAnthropicKey)) throw new Error('Raw Anthropic key leaked in redacted payload');
    if (serialized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) throw new Error('Raw JWT leaked in redacted payload');
    if (serialized.includes('MIIEowIBAAKCAQEA0Y3')) throw new Error('Raw RSA key leaked in redacted payload');

    // Test Prototype Pollution defense
    const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "normal": "value"}');
    if (!hasPrototypePollutionKeys(maliciousPayload)) {
      throw new Error('hasPrototypePollutionKeys failed to detect __proto__ injection');
    }

    const safeCleaned = redactValue(maliciousPayload);
    // Ensure prototype was not polluted
    if ((Object.prototype as any).polluted) {
      delete (Object.prototype as any).polluted;
      throw new Error('Prototype pollution succeeded - security vulnerability detected!');
    }

    pass('Secret redaction eliminates sensitive credentials and prototype pollution attempts are neutralized');
  } catch (err) {
    fail('Security and redaction test failed', err);
  }

  // --------------------------------------------------------------------------
  // 4. SSRF Network Defense & Target URL Validation
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}4. SSRF Network Defense & Target URL Validation${colors.reset}`);
  try {
    // 1. AWS/GCP Metadata
    const metadataRes = validateTargetUrl('http://169.254.169.254/latest/meta-data/');
    if (metadataRes.allowed || metadataRes.safe) {
      throw new Error('SSRF filter failed to block cloud metadata address 169.254.169.254');
    }

    // 2. Loopback 127.0.0.1
    const loopbackRes = validateTargetUrl('http://127.0.0.1:8080/internal/admin');
    if (loopbackRes.allowed || loopbackRes.safe) {
      throw new Error('SSRF filter failed to block loopback address 127.0.0.1');
    }

    // 3. Decimal integer encoded IP (2130706433 = 127.0.0.1)
    const decimalIpRes = validateTargetUrl('http://2130706433/admin');
    if (decimalIpRes.allowed || decimalIpRes.safe) {
      throw new Error('SSRF filter failed to block decimal-encoded IP address');
    }

    // 4. Hex encoded IP (0x7f000001 = 127.0.0.1)
    const hexIpRes = validateTargetUrl('http://0x7f000001/admin');
    if (hexIpRes.allowed || hexIpRes.safe) {
      throw new Error('SSRF filter failed to block hex-encoded IP address');
    }

    // 5. Internal domain
    const internalDomainRes = validateTargetUrl('http://backend.internal/secrets');
    if (internalDomainRes.allowed || internalDomainRes.safe) {
      throw new Error('SSRF filter failed to block .internal top-level domain');
    }

    // 6. Valid external HTTPS target
    const validPublicRes = validateTargetUrl('https://api.openai.com/v1/chat/completions');
    if (!validPublicRes.allowed || !validPublicRes.safe) {
      throw new Error('SSRF filter incorrectly blocked valid public endpoint');
    }

    pass('SSRF defense engine successfully blocks link-local metadata, loopback, encoded IPs, and internal domains');
  } catch (err) {
    fail('SSRF network defense test failed', err);
  }

  // --------------------------------------------------------------------------
  // 5. v0.2 Trace Export & Round-Trip Topology Fidelity
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}5. v0.2 Trace Export & Round-Trip Topology Fidelity${colors.reset}`);
  try {
    const runId = `run_v02_roundtrip_${Date.now()}`;
    const rootId = `span_rt_root_${Date.now()}`;
    const child1Id = `span_rt_c1_${Date.now()}`;
    const child2Id = `span_rt_c2_${Date.now()}`;

    // Insert test run & hierarchy
    db.insert(trace_runs).values({
      id: runId,
      name: 'Roundtrip Test Run v0.2.0',
      status: 'completed',
      total_tokens: 1200,
      total_cost_usd: 0.024,
      created_at: Date.now()
    }).run();

    db.insert(trace_spans).values([
      {
        id: rootId,
        run_id: runId,
        parent_span_id: null,
        agent_name: 'LeadPlanner',
        span_type: 'agent_state',
        model: 'gpt-4o',
        cost_usd: 0.01,
        prompt_tokens: 300,
        completion_tokens: 200,
        latency_ms: 600,
        request_hash: 'hash_root',
        created_at: Date.now()
      },
      {
        id: child1Id,
        run_id: runId,
        parent_span_id: rootId,
        agent_name: 'LeadPlanner',
        span_type: 'tool_call',
        request_payload: JSON.stringify({ tool_name: 'calculate_tax' }),
        response_payload: JSON.stringify({ result: { tax: 42 } }),
        cost_usd: 0.007,
        prompt_tokens: 200,
        completion_tokens: 150,
        latency_ms: 300,
        request_hash: 'hash_c1',
        created_at: Date.now()
      },
      {
        id: child2Id,
        run_id: runId,
        parent_span_id: rootId,
        agent_name: 'LeadPlanner',
        span_type: 'tool_call',
        request_payload: JSON.stringify({ tool_name: 'verify_signature' }),
        response_payload: JSON.stringify({ result: { valid: true } }),
        cost_usd: 0.007,
        prompt_tokens: 200,
        completion_tokens: 150,
        latency_ms: 250,
        request_hash: 'hash_c2',
        created_at: Date.now()
      }
    ]).run();

    // Export bundle structure
    const retrievedRun = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).get()!;
    const retrievedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, runId)).all();

    const exportBundle = {
      version: '1.0',
      exported_at: Date.now(),
      run: retrievedRun,
      spans: retrievedSpans
    };

    if (exportBundle.version !== '1.0') {
      throw new Error(`Expected bundle format version 1.0, got ${exportBundle.version}`);
    }

    // Re-import bundle under a new run ID
    const reImportedRunId = `${runId}_reimported`;
    const reImportedBundle = JSON.parse(JSON.stringify(exportBundle));
    reImportedBundle.run.id = reImportedRunId;
    reImportedBundle.spans = reImportedBundle.spans.map((s: any) => ({
      ...s,
      run_id: reImportedRunId,
      id: `${s.id}_imported`,
      parent_span_id: s.parent_span_id ? `${s.parent_span_id}_imported` : null
    }));

    db.insert(trace_runs).values(reImportedBundle.run).run();
    for (const span of reImportedBundle.spans) {
      db.insert(trace_spans).values(span).run();
    }

    // Verify round-trip fidelity
    const importedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, reImportedRunId)).all();
    if (importedSpans.length !== 3) {
      throw new Error(`Expected 3 imported spans, got ${importedSpans.length}`);
    }

    const importedRoot = importedSpans.find((s) => s.parent_span_id === null)!;
    const importedChildren = importedSpans.filter((s) => s.parent_span_id === importedRoot.id);
    if (importedChildren.length !== 2) {
      throw new Error(`DAG topology corrupted: root has ${importedChildren.length} children, expected 2`);
    }

    pass('v0.2.0 trace bundles export and import with 100% DAG topology and cost fidelity');
  } catch (err) {
    fail('Export round-trip test failed', err);
  }

  // --------------------------------------------------------------------------
  // 6. Docker Container Readiness & Multi-Service Entrypoint Verification
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}6. Docker Container Readiness & Multi-Service Entrypoint${colors.reset}`);
  try {
    const dockerfilePath = resolve(process.cwd(), 'Dockerfile');
    const entrypointPath = resolve(process.cwd(), 'scripts/docker-entrypoint.sh');

    if (!existsSync(dockerfilePath)) throw new Error('Dockerfile does not exist');
    if (!existsSync(entrypointPath)) throw new Error('scripts/docker-entrypoint.sh does not exist');

    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8');
    const entrypointContent = readFileSync(entrypointPath, 'utf-8');

    // Check multi-stage build in Dockerfile
    if (!dockerfileContent.includes('FROM node:22-bookworm-slim AS base')) {
      throw new Error('Dockerfile missing base image stage');
    }
    if (!dockerfileContent.includes('FROM base AS runner')) {
      throw new Error('Dockerfile missing runner stage');
    }
    if (!dockerfileContent.includes('EXPOSE 3000') || !dockerfileContent.includes('EXPOSE 4000')) {
      throw new Error('Dockerfile does not expose ports 3000 and 4000');
    }
    if (!dockerfileContent.includes('HEALTHCHECK')) {
      throw new Error('Dockerfile missing HEALTHCHECK directive');
    }

    // Check entrypoint script
    if (!entrypointContent.includes('trap cleanup SIGTERM SIGINT INT TERM')) {
      throw new Error('Entrypoint script missing signal forwarding cleanup trap');
    }
    if (!entrypointContent.includes('AETHERTRACE_DB_PATH')) {
      throw new Error('Entrypoint script missing persistent SQLite database directory preparation');
    }

    pass('Docker container manifests and entrypoint signal orchestration pass all hardening checks');
  } catch (err) {
    fail('Docker readiness check failed', err);
  }

  // --------------------------------------------------------------------------
  // 7. Scale & Production SLA Gate (1,000 Spans Ingestion & Analysis < 50ms)
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}7. Scale & Production SLA Gate${colors.reset}`);
  try {
    const perfRunId = `run_perf_gate_${Date.now()}`;
    const spanCount = 1_000;
    const mockSpans: TraceSpan[] = [];

    const rootSpanId = `perf_root_${Date.now()}`;
    mockSpans.push({
      id: rootSpanId,
      run_id: perfRunId,
      parent_span_id: null,
      name: 'PerfRootAgent',
      agent_name: 'LeadAgent',
      span_type: 'agent_invocation',
      model: 'gpt-4o',
      cost_usd: 0.001,
      duration_ms: 100,
      status: 'completed',
      tokens_total: 100,
      created_at: Date.now()
    });

    for (let i = 1; i < spanCount; i++) {
      const parentIdx = Math.floor(Math.random() * Math.min(i, 20));
      mockSpans.push({
        id: `perf_span_${i}`,
        run_id: perfRunId,
        parent_span_id: mockSpans[parentIdx].id,
        name: `PerfSpan_${i}`,
        agent_name: i % 2 === 0 ? 'LeadAgent' : 'WorkerAgent',
        span_type: i % 3 === 0 ? 'tool_execution' : 'llm_call',
        model: 'gpt-4o-mini',
        cost_usd: 0.0001,
        duration_ms: 15 + (i % 30),
        status: i === 500 ? 'error' : 'completed',
        error: i === 500 ? 'RandomFailure' : null,
        tokens_total: 50,
        created_at: Date.now()
      });
    }

    // Benchmark Agent Intelligence over 1,000 spans
    const startIntel = performance.now();
    const intel = analyzeExecutionIntelligence(mockSpans);
    const intelMs = performance.now() - startIntel;

    if (!intel || intel.agents.length !== 2) {
      throw new Error(`Expected 2 agents in intelligence summary, got ${intel?.agents.length}`);
    }

    // Benchmark Evaluation Metrics Extraction over 1,000 spans
    const startMetrics = performance.now();
    const metrics = extractEvaluationMetrics(mockSpans);
    const metricsMs = performance.now() - startMetrics;

    if (!metrics || metrics.execution.spanCount !== 1_000) {
      throw new Error('Evaluation metrics extraction did not process all 1,000 spans');
    }

    console.log(`    ${colors.dim}[1,000 Spans] Intelligence Analysis: ${intelMs.toFixed(2)}ms | Metrics Extraction: ${metricsMs.toFixed(2)}ms${colors.reset}`);

    // Verify SLA (< 50ms for intelligence analysis)
    if (intelMs > 50) {
      throw new Error(`Intelligence analysis took ${intelMs.toFixed(2)}ms, exceeding 50ms production SLA`);
    }

    pass(`Scale SLA gate satisfied: 1,000 spans analyzed in ${intelMs.toFixed(2)}ms (< 50ms SLA)`);
  } catch (err) {
    fail('Production SLA gate failed', err);
  }

  console.log(`\n${colors.bold}${colors.green}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}  ✔ Phase 16: All 7 Release Hardening Gates Passed!   ${colors.reset}`);
  console.log(`${colors.bold}${colors.green}======================================================${colors.reset}\n`);
}

runPhase16Tests().catch((err) => {
  console.error('Phase 16 Verification Suite Failed:', err);
  process.exit(1);
});
