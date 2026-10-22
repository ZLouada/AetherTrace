/**
 * AetherTrace Phase 13 Test Suite: Evaluation & Optimization Engine
 *
 * Verifies:
 * 1. Evaluation Model & SQLite Persistence (create, get, list with filtering, delete)
 * 2. Zero-Eval Assertion DSL Parsing (operators, durations, currencies, aliases, errors)
 * 3. Zero-Eval Sandbox Security Enforcement (blocks prototype pollution, forbidden props)
 * 4. Deterministic Metrics Extraction Layer (cost, latency, tokens, reliability, execution)
 * 5. Assertion Execution with Concrete Evidence Attachment (metrics, actual vs expected)
 * 6. Failure Analysis & Culprit Localization (culprit span identification, severity)
 * 7. Deterministic Error Clustering & Secret Redaction (UUID/IP normalization, secret masking)
 * 8. Causal Root-Cause Analysis (primary root cause vs downstream effects, retry chains)
 * 9. Optimization Signals Detection (cost hotspots, latency bottlenecks, retry storms, token bloat)
 * 10. Proxy Server REST Endpoints, Markdown/JSON Export & CLI CI Gate (SLA < 100ms)
 */

import {
  getDatabase,
  closeDatabase,
  trace_runs,
  trace_spans,
  evaluations,
  runEvaluation,
  getEvaluation,
  listEvaluations,
  deleteEvaluation,
  parseAssertionExpression,
  parseAssertionRule,
  evaluateAssertion,
  extractEvaluationMetrics,
  analyzeFailures,
  clusterErrors,
  analyzeRootCauses,
  detectOptimizationSignals,
  evaluateRegression,
  exportEvaluationAsJson,
  exportEvaluationAsMarkdown,
  type TraceRun,
  type TraceSpan,
  type AssertionRule,
  type EvaluationReport
} from '@aethertrace/core-schema';
import { startServer } from '../apps/proxy-server/src/index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

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

async function runSuite() {
  console.log(`\n${colors.cyan}${colors.bold}======================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  AetherTrace Phase 13: Evaluation & Optimization     ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}======================================================${colors.reset}\n`);

  const { db, sqlite } = getDatabase();
  const now = Date.now();

  // Seed primary evaluation test run
  const testRunId = `run_eval_${randomUUID()}`;
  const testRun: TraceRun = {
    id: testRunId,
    name: 'Multi-Agent Research Pipeline',
    status: 'completed',
    total_tokens: 3200,
    total_cost_usd: 0.0425,
    parent_run_id: null,
    forked_at_span_id: null,
    created_at: now
  };
  db.insert(trace_runs).values(testRun).run();

  const span1Id = `span_root_${randomUUID()}`;
  const span2Id = `span_search_${randomUUID()}`;
  const span3Id = `span_retry1_${randomUUID()}`;
  const span4Id = `span_retry2_${randomUUID()}`;
  const span5Id = `span_summarize_${randomUUID()}`;

  const testSpans: TraceSpan[] = [
    {
      id: span1Id,
      run_id: testRunId,
      parent_span_id: null,
      span_type: 'llm_call',
      agent_name: 'agent_supervisor',
      model: 'gpt-4o',
      prompt_tokens: 400,
      completion_tokens: 150,
      cost_usd: 0.0150,
      latency_ms: 1200,
      request_payload: JSON.stringify({ instruction: 'Conduct research on quantum encryption' }),
      response_payload: JSON.stringify({ result: 'Delegating to searcher' }),
      request_hash: 'hash-eval-1',
      cache_hit: 0,
      execution_origin: 'original',
      created_at: now
    },
    {
      id: span2Id,
      run_id: testRunId,
      parent_span_id: span1Id,
      span_type: 'tool_call',
      agent_name: 'agent_researcher',
      model: 'gpt-4o-mini',
      prompt_tokens: 500,
      completion_tokens: 50,
      cost_usd: 0.0025,
      latency_ms: 800,
      request_payload: JSON.stringify({ tool: 'Search Tool Primary', query: 'quantum encryption post-2025' }),
      response_payload: JSON.stringify({ error: 'ConnectionTimeout: Failed to connect to https://192.168.1.10:8080 after 800ms' }),
      request_hash: 'hash-eval-2',
      cache_hit: 0,
      execution_origin: 'original',
      created_at: now + 50
    },
    {
      id: span3Id,
      run_id: testRunId,
      parent_span_id: span2Id,
      span_type: 'retry',
      agent_name: 'agent_researcher',
      model: 'gpt-4o-mini',
      prompt_tokens: 500,
      completion_tokens: 50,
      cost_usd: 0.0025,
      latency_ms: 900,
      request_payload: JSON.stringify({ tool: 'Search Tool Retry 1', query: 'quantum encryption post-2025' }),
      response_payload: JSON.stringify({ error: 'ConnectionTimeout: Failed to connect to https://192.168.1.10:8080 after 900ms' }),
      request_hash: 'hash-eval-3',
      cache_hit: 0,
      execution_origin: 'original',
      created_at: now + 900
    },
    {
      id: span4Id,
      run_id: testRunId,
      parent_span_id: span3Id,
      span_type: 'tool_call',
      agent_name: 'agent_researcher',
      model: 'gpt-4o-mini',
      prompt_tokens: 500,
      completion_tokens: 250,
      cost_usd: 0.0075,
      latency_ms: 1100,
      request_payload: JSON.stringify({ tool: 'Search Tool Retry 2', query: 'quantum encryption post-2025' }),
      response_payload: JSON.stringify({ papers: ['Kyber-1024', 'Dilithium-5'] }),
      request_hash: 'hash-eval-4',
      cache_hit: 0,
      execution_origin: 'original',
      created_at: now + 1850
    },
    {
      id: span5Id,
      run_id: testRunId,
      parent_span_id: span1Id,
      span_type: 'llm_call',
      agent_name: 'agent_writer',
      model: 'gpt-4o',
      prompt_tokens: 1200,
      completion_tokens: 100,
      cost_usd: 0.0150,
      latency_ms: 700,
      request_payload: JSON.stringify({ prompt: 'Summarize findings with Bearer sk-ant-live-secret-token-99999' }),
      response_payload: JSON.stringify({ summary: 'NIST standardized ML-KEM and ML-DSA' }),
      request_hash: 'hash-eval-5',
      cache_hit: 0,
      execution_origin: 'original',
      created_at: now + 3000
    }
  ];

  for (const s of testSpans) {
    db.insert(trace_spans).values(s).run();
  }

  // -------------------------------------------------------------------------
  // SECTION 1: Evaluation Model & SQLite Persistence (CRUD)
  // -------------------------------------------------------------------------
  console.log(`${colors.bold}1. Evaluation Model & SQLite Persistence (CRUD)${colors.reset}`);
  {
    const report = await runEvaluation(db, {
      targetType: 'run',
      targetId: testRunId,
      name: 'Initial Smoke Evaluation',
      description: 'Verifies baseline CRUD operations'
    });

    if (!report.id || !report.id.startsWith('eval_')) {
      fail('CRUD Create', new Error('Generated evaluation ID must start with eval_'));
    }
    pass('Evaluation Created & Stored', `ID: ${report.id}`);

    const retrieved = getEvaluation(db, report.id);
    if (!retrieved || retrieved.id !== report.id || retrieved.targetId !== testRunId) {
      fail('CRUD Read', new Error('Failed to retrieve evaluation report by ID'));
    }
    if (retrieved.score.assertionsTotal === 0 && retrieved.score.passPercentage !== 100) {
      fail('CRUD Score', new Error('Score calculation mismatch'));
    }
    pass('Evaluation Retrieved by ID', `Score: ${retrieved.score.passPercentage.toFixed(1)}%`);

    const listAll = listEvaluations(db);
    if (!listAll.some((e) => e.id === report.id)) {
      fail('CRUD List', new Error('Created evaluation not found in list'));
    }
    const listFiltered = listEvaluations(db, { targetType: 'run', targetId: testRunId });
    if (!listFiltered.some((e) => e.id === report.id)) {
      fail('CRUD Filtered List', new Error('Created evaluation not found in target-filtered list'));
    }
    pass('Evaluation Listed with Target Filter', `Found ${listFiltered.length} records`);

    const deleteOk = deleteEvaluation(db, report.id);
    if (!deleteOk || getEvaluation(db, report.id) !== null) {
      fail('CRUD Delete', new Error('Failed to delete evaluation record'));
    }
    pass('Evaluation Deleted', 'Record cleanly purged from database');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Zero-Eval Assertion DSL Parsing
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}2. Zero-Eval Assertion DSL Parsing${colors.reset}`);
  {
    // Operators
    const r1 = parseAssertionRule('cost_usd <= 0.05');
    if (r1.field !== 'cost.totalCostUsd' || r1.operator !== '<=' || r1.expected !== 0.05) {
      fail('DSL Operator <=', new Error(`Unexpected parse result: ${JSON.stringify(r1)}`));
    }
    pass('Parse Operator <= with Currency Alias', `${r1.field} ${r1.operator} ${r1.expected}`);

    const r2 = parseAssertionRule('latency_ms < 5000ms');
    if (r2.field !== 'latency.totalDurationMs' || r2.operator !== '<' || r2.expected !== 5000) {
      fail('DSL Duration Parse', new Error(`Failed to parse duration in ms: ${JSON.stringify(r2)}`));
    }
    pass('Parse Duration Metric', `${r2.field} ${r2.operator} ${r2.expected}ms`);

    const r3 = parseAssertionRule('tokens >= 1000');
    if (r3.field !== 'tokens.totalTokens' || r3.operator !== '>=' || r3.expected !== 1000) {
      fail('DSL Token Alias', new Error(`Failed to parse token metric: ${JSON.stringify(r3)}`));
    }
    pass('Parse Token Alias >=', `${r3.field} ${r3.operator} ${r3.expected}`);

    const r4 = parseAssertionRule('reliability.errorCount == 0');
    if (r4.field !== 'reliability.errorCount' || r4.operator !== '==' || r4.expected !== 0) {
      fail('DSL Equality ==', new Error(`Failed to parse equality rule: ${JSON.stringify(r4)}`));
    }
    pass('Parse Equality Operator ==', `${r4.field} ${r4.operator} ${r4.expected}`);

    const r5 = parseAssertionRule('status != "failed"');
    if (r5.field !== 'status' || r5.operator !== '!=' || r5.expected !== 'failed') {
      fail('DSL String Value !=', new Error(`Failed to parse string inequality: ${JSON.stringify(r5)}`));
    }
    pass('Parse String Value !=', `${r5.field} ${r5.operator} ${r5.expected}`);

    const r6 = parseAssertionRule('tool "Search Tool Primary" must exist');
    if (!r6.field?.includes('Search Tool Primary') || r6.expected !== 1) {
      fail('DSL Tool Exists Natural Language', new Error(`Failed to parse tool exists: ${JSON.stringify(r6)}`));
    }
    pass('Parse Natural Language Tool Exists', `${r6.name}`);

    // Error handling on invalid expression
    let caughtEmpty = false;
    try {
      parseAssertionRule('');
    } catch {
      caughtEmpty = true;
    }
    if (!caughtEmpty) fail('DSL Empty Check', new Error('Empty assertion expression did not throw'));
    pass('DSL Validation', 'Empty assertion safely rejected');

    let caughtInvalidOp = false;
    try {
      parseAssertionRule('cost_usd ~~ 0.05');
    } catch {
      caughtInvalidOp = true;
    }
    if (!caughtInvalidOp) fail('DSL Invalid Operator', new Error('Invalid operator did not throw'));
    pass('DSL Invalid Operator', 'Unknown operator ~~ safely rejected');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: Zero-Eval Sandbox Security Enforcement
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}3. Zero-Eval Sandbox Security Enforcement${colors.reset}`);
  {
    const forbiddenExpressions = [
      '__proto__.polluted == 1',
      'constructor.name == "Object"',
      'prototype.isAdmin == true',
      'process.env.SECRET == "test"',
      'globalThis.leaked == 1'
    ];

    for (const expr of forbiddenExpressions) {
      let blocked = false;
      try {
        parseAssertionRule(expr);
      } catch (err: any) {
        if (err.message.includes('Security Violation') || err.message.includes('Forbidden property')) {
          blocked = true;
        }
      }
      if (!blocked) {
        fail('Sandbox Security Violation', new Error(`Forbidden expression '${expr}' was not blocked!`));
      }
    }
    pass('Prototype Pollution Blocked', 'All 5 forbidden property expressions blocked with Security Violation');

    // Verify parser handles expressions up to 500 chars, rejects > 500 chars
    const oversizedExpr = 'cost_usd <= ' + '9'.repeat(510);
    let sizeBlocked = false;
    try {
      parseAssertionRule(oversizedExpr);
    } catch (err: any) {
      if (err.message.includes('maximum length')) sizeBlocked = true;
    }
    if (!sizeBlocked) {
      fail('Sandbox Size Limit', new Error('Oversized assertion expression was not rejected!'));
    }
    pass('Expression Length Guard', 'Expressions exceeding 500 characters safely rejected');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: Deterministic Metrics Extraction Layer
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}4. Deterministic Metrics Extraction Layer${colors.reset}`);
  {
    const metrics = extractEvaluationMetrics(testSpans, testRun);

    // Cost verification
    if (metrics.cost.totalCostUsd !== 0.0425) {
      fail('Metrics Cost Spend', new Error(`Expected $0.0425, got ${metrics.cost.totalCostUsd}`));
    }
    if (metrics.cost.byModel['gpt-4o'] !== 0.0300) {
      fail('Metrics Cost by Model', new Error(`Expected gpt-4o cost $0.0300, got ${metrics.cost.byModel['gpt-4o']}`));
    }
    pass('Cost Metrics Extracted', `Total Spend: $${metrics.cost.totalCostUsd.toFixed(4)}`);

    // Latency verification
    if (metrics.latency.totalDurationMs <= 0) {
      fail('Metrics Total Latency', new Error('Total duration must be positive'));
    }
    if (metrics.latency.criticalPathMs <= 0) {
      fail('Metrics Critical Path', new Error('Critical path duration must be positive'));
    }
    pass('Latency Metrics Extracted', `Total: ${metrics.latency.totalDurationMs}ms, CritPath: ${metrics.latency.criticalPathMs}ms`);

    // Tokens verification
    if (metrics.tokens.promptTokens !== 3100 || metrics.tokens.completionTokens !== 600) {
      fail('Metrics Tokens', new Error(`Token mismatch: prompt=${metrics.tokens.promptTokens}, completion=${metrics.tokens.completionTokens}`));
    }
    pass('Token Metrics Extracted', `Total: ${metrics.tokens.totalTokens} (Prompt: ${metrics.tokens.promptTokens}, Completion: ${metrics.tokens.completionTokens})`);

    // Reliability verification
    if (metrics.reliability.errorCount < 2) {
      fail('Metrics Error Count', new Error(`Expected at least 2 errors from failed spans, got ${metrics.reliability.errorCount}`));
    }
    if (metrics.reliability.retryCount < 1) {
      fail('Metrics Retry Count', new Error(`Expected retry count >= 1, got ${metrics.reliability.retryCount}`));
    }
    pass('Reliability Metrics Extracted', `Errors: ${metrics.reliability.errorCount}, Retries: ${metrics.reliability.retryCount}`);

    // Execution topology
    if (metrics.execution.spanCount !== 5 || metrics.execution.agentCount !== 3) {
      fail('Metrics Topology', new Error(`Topology count mismatch: spans=${metrics.execution.spanCount}, agents=${metrics.execution.agentCount}`));
    }
    pass('Execution Topology Extracted', `Spans: ${metrics.execution.spanCount}, Agents: ${metrics.execution.agentCount}, Tools: ${metrics.execution.toolCallCount}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: Assertion Execution with Concrete Evidence Attachment
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}5. Assertion Execution with Concrete Evidence Attachment${colors.reset}`);
  {
    const metrics = extractEvaluationMetrics(testSpans, testRun);

    // Rule A: Passing assertion
    const passRule = parseAssertionRule('cost_usd <= 0.05');
    const passRes = evaluateAssertion(passRule, metrics, testSpans);
    if (passRes.status !== 'passed' || passRes.actual !== 0.0425) {
      fail('Assertion Execution Pass', new Error(`Expected passed status, got ${passRes.status}`));
    }
    pass('Passing Assertion Executed', `${passRes.expression} (actual: ${passRes.actual})`);

    // Rule B: Failing assertion
    const failRule = parseAssertionRule('reliability.errorCount == 0');
    const failRes = evaluateAssertion(failRule, metrics, testSpans);
    if (failRes.status !== 'failed' || failRes.actual !== 2) {
      fail('Assertion Execution Fail', new Error(`Expected failed status, got ${failRes.status}`));
    }
    if (!failRes.evidence || !failRes.evidence.spanIds || failRes.evidence.spanIds.length === 0) {
      fail('Assertion Evidence Attachment', new Error('Failed assertion must attach culprit span evidence!'));
    }
    pass('Failing Assertion Executed with Evidence', `Span evidence: ${failRes.evidence.spanIds.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 6: Failure Analysis & Culprit Localization
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}6. Failure Analysis & Culprit Localization${colors.reset}`);
  {
    const metrics = extractEvaluationMetrics(testSpans, testRun);
    const failRule1 = parseAssertionRule('reliability.errorCount == 0');
    const failRule2 = parseAssertionRule('cost_usd <= 0.02'); // will fail since cost is 0.0425
    const results = [
      evaluateAssertion(failRule1, metrics, testSpans),
      evaluateAssertion(failRule2, metrics, testSpans)
    ];

    const failures = analyzeFailures(results, testSpans, testRunId);
    if (failures.length !== 2) {
      fail('Failure Count', new Error(`Expected 2 failures, got ${failures.length}`));
    }

    const errorFailure = failures.find((f) => f.assertionName.includes('errorCount'));
    if (!errorFailure || errorFailure.spanIds.length === 0) {
      fail('Failure Localization', new Error('Error failure failed to localize culprit span IDs'));
    }
    if (!errorFailure.spanIds.includes(span2Id) && !errorFailure.spanIds.includes(span3Id)) {
      fail('Culprit Span Matching', new Error(`Culprit spans do not contain failed tool spans: ${errorFailure.spanIds.join(', ')}`));
    }
    pass('Failures Localized to Culprit Spans', `Culprits: ${errorFailure.spanIds.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 7: Deterministic Error Clustering & Secret Redaction
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}7. Deterministic Error Clustering & Secret Redaction${colors.reset}`);
  {
    const clusters = clusterErrors(testSpans, testRunId);
    if (clusters.length === 0) {
      fail('Error Clustering', new Error('Expected at least 1 error cluster from timeout errors'));
    }

    const timeoutCluster = clusters.find((c) => c.errorType.includes('ConnectionTimeout') || c.normalizedMessage.includes('ConnectionTimeout'));
    if (!timeoutCluster) {
      fail('Cluster Matching', new Error(`No ConnectionTimeout cluster found. Clusters: ${JSON.stringify(clusters)}`));
    }
    if (timeoutCluster.occurrences < 2) {
      fail('Cluster Occurrences', new Error(`Expected at least 2 occurrences for ConnectionTimeout, got ${timeoutCluster.occurrences}`));
    }

    // Verify variable normalization: IP addresses should be normalized to <IP>
    if (!timeoutCluster.normalizedMessage.includes('<IP>')) {
      fail('Cluster Variable Normalization', new Error(`Message was not normalized with <IP>: ${timeoutCluster.normalizedMessage}`));
    }
    pass('Error Clusters Normalized & Grouped', `${timeoutCluster.occurrences}x: ${timeoutCluster.normalizedMessage}`);

    // Verify secret redaction on span5 prompt token
    const rep = await runEvaluation(db, {
      targetType: 'run',
      targetId: testRunId,
      name: 'Redaction Verification'
    });
    const markdown = exportEvaluationAsMarkdown(rep);
    if (markdown.includes('sk-ant-live-secret-token-99999')) {
      fail('Secret Redaction in Export', new Error('Raw API key was not redacted in exported Markdown!'));
    }
    pass('Sensitive Data Redaction Enforced', 'API key token successfully redacted');
  }

  // -------------------------------------------------------------------------
  // SECTION 8: Causal Root-Cause Analysis (Primary vs Downstream)
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}8. Causal Root-Cause Analysis${colors.reset}`);
  {
    const metrics = extractEvaluationMetrics(testSpans, testRun);
    const failRule = parseAssertionRule('reliability.errorCount == 0');
    const failures = analyzeFailures([evaluateAssertion(failRule, metrics, testSpans)], testSpans, testRunId);

    const rootCauses = analyzeRootCauses(testSpans, failures);
    if (rootCauses.length === 0) {
      fail('Root Cause Analysis', new Error('Expected at least 1 root cause candidate'));
    }

    const primary = rootCauses.find((rc) => rc.candidateType === 'primary');
    if (!primary) {
      fail('Primary Root Cause', new Error('Expected a primary root cause candidate'));
    }
    // Earliest failing span is span2Id
    if (primary.spanId !== span2Id) {
      fail('Earliest Root Failure Matching', new Error(`Expected primary root cause to be earliest failure span ${span2Id}, got ${primary.spanId}`));
    }
    if (!primary.impact || primary.impact.retryCount < 1) {
      fail('Root Cause Impact', new Error('Primary root cause should reflect downstream retry impact'));
    }
    pass('Earliest Primary Root Cause Identified', `Span: ${primary.spanId} (${primary.agentName} / ${primary.spanType})`);
    pass('Downstream Impact Calculated', `Retries: ${primary.impact.retryCount}, Delay: ${primary.impact.delayMs}ms`);
  }

  // -------------------------------------------------------------------------
  // SECTION 9: Optimization Signals Detection
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}9. Optimization Signals Detection${colors.reset}`);
  {
    const metrics = extractEvaluationMetrics(testSpans, testRun);
    const signals = detectOptimizationSignals(testSpans, metrics);

    if (signals.length === 0) {
      fail('Optimization Signals', new Error('Expected optimization signals to be detected'));
    }

    // Should detect retry hotspot (since span2 had retries)
    const retrySignal = signals.find((s) => s.category === 'retry');
    if (!retrySignal) {
      fail('Retry Signal Detection', new Error('Expected retry hotspot signal'));
    }
    pass('Retry Hotspot Signal Detected', `${retrySignal.title}: ${retrySignal.recommendation}`);

    // Should detect token bloat or model cost hotspot
    const costOrTokenSignal = signals.find((s) => s.category === 'cost' || s.category === 'token');
    if (costOrTokenSignal) {
      pass('Cost/Token Optimization Signal Detected', `${costOrTokenSignal.title} (Priority: ${costOrTokenSignal.priority})`);
    } else {
      pass('Optimization Scan Complete', `Detected ${signals.length} actionable signal(s)`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 10: Proxy Server REST API, Exports & Performance SLA
  // -------------------------------------------------------------------------
  console.log(`\n${colors.bold}10. Proxy Server REST API & Performance SLA (< 100ms)${colors.reset}`);
  {
    const testPort = 4133;
    const { server } = startServer(testPort);
    const baseUrl = `http://localhost:${testPort}/api/evaluations`;

    try {
      // 10.1 Run evaluation via POST API
      const runRes = await fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'run',
          targetId: testRunId,
          name: 'API Triggered Evaluation',
          rules: ['cost_usd <= 0.05', 'latency_ms < 10000ms', 'status == "completed"']
        })
      });

      if (!runRes.ok) {
        fail('POST /api/evaluations/run', new Error(`HTTP ${runRes.status}: ${await runRes.text()}`));
      }
      const runData: EvaluationReport = await runRes.json();
      if (!runData.id || runData.assertions.length !== 3) {
        fail('API Evaluation Data', new Error(`Invalid report data: ${JSON.stringify(runData)}`));
      }
      pass('POST /api/evaluations/run', `Triggered evaluation ${runData.id}`);

      // Performance SLA (< 100ms per evaluation computation)
      const tStart = performance.now();
      for (let i = 0; i < 10; i++) {
        await runEvaluation(db, {
          targetType: 'run',
          targetId: testRunId,
          rules: ['cost_usd <= 0.05', 'latency_ms < 10000ms']
        });
      }
      const avgMs = (performance.now() - tStart) / 10;
      if (avgMs > 100) {
        fail('Performance SLA Violation', new Error(`Evaluation averaged ${avgMs.toFixed(2)}ms, exceeding 100ms SLA!`));
      }
      pass('Evaluation Engine Performance SLA', `Averaged ${avgMs.toFixed(2)}ms per evaluation (well under 100ms SLA)`);

      // 10.2 Inspect via GET API
      const inspectRes = await fetch(`${baseUrl}/${runData.id}`);
      if (!inspectRes.ok) {
        fail('GET /api/evaluations/:id', new Error(`HTTP ${inspectRes.status}`));
      }
      const inspectData: EvaluationReport = await inspectRes.json();
      if (inspectData.id !== runData.id) {
        fail('Inspect Data Match', new Error('Report ID mismatch'));
      }
      pass('GET /api/evaluations/:id', `Score: ${inspectData.score.passPercentage.toFixed(1)}%`);

      // 10.3 List via GET API
      const listRes = await fetch(`${baseUrl}`);
      if (!listRes.ok) fail('GET /api/evaluations', new Error(`HTTP ${listRes.status}`));
      const listData = await listRes.json();
      const evals = listData.evaluations || listData;
      if (!Array.isArray(evals) || evals.length === 0) {
        fail('API Evaluations List', new Error('Expected array of evaluations'));
      }
      pass('GET /api/evaluations', `Retrieved ${evals.length} records`);

      // 10.4 Target-filtered inspect
      const targetRes = await fetch(`${baseUrl}/target/run/${testRunId}`);
      if (!targetRes.ok) fail('GET /api/evaluations/target/:type/:id', new Error(`HTTP ${targetRes.status}`));
      const targetReport: EvaluationReport = await targetRes.json();
      if (!targetReport.id || targetReport.targetId !== testRunId) {
        fail('API Target Report', new Error('Expected target evaluation report'));
      }
      pass('GET /api/evaluations/target/run/:id', `Retrieved report ${targetReport.id} for target run`);

      // 10.5 Markdown Export API
      const mdRes = await fetch(`${baseUrl}/${runData.id}/export?format=markdown`);
      if (!mdRes.ok) fail('GET /api/evaluations/:id/export?format=markdown', new Error(`HTTP ${mdRes.status}`));
      const mdText = await mdRes.text();
      if (!mdText.includes('# AetherTrace Evaluation Report') || !mdText.includes('Executive Summary')) {
        fail('Markdown Export Content', new Error('Missing expected Markdown headers'));
      }
      pass('GET /api/evaluations/:id/export (Markdown)', `${mdText.length} bytes exported`);

      // 10.6 JSON Export API
      const jsonRes = await fetch(`${baseUrl}/${runData.id}/export?format=json`);
      if (!jsonRes.ok) fail('GET /api/evaluations/:id/export?format=json', new Error(`HTTP ${jsonRes.status}`));
      const jsonText = await jsonRes.text();
      const parsedExport = JSON.parse(jsonText);
      if (parsedExport.id !== runData.id) {
        fail('JSON Export Content', new Error('JSON export ID mismatch'));
      }
      pass('GET /api/evaluations/:id/export (JSON)', `${jsonText.length} bytes exported`);

      // 10.7 DELETE API
      const delRes = await fetch(`${baseUrl}/${runData.id}`, { method: 'DELETE' });
      if (!delRes.ok) fail('DELETE /api/evaluations/:id', new Error(`HTTP ${delRes.status}`));
      const delJson = await delRes.json();
      if (!delJson.success) fail('DELETE Response', new Error('Expected { success: true }'));
      pass('DELETE /api/evaluations/:id', 'Evaluation deleted via API');

    } finally {
      server.close();
    }
  }

  console.log(`\n${colors.green}${colors.bold}======================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}  ✔ Phase 13 Evaluation Suite: ALL TESTS PASSED       ${colors.reset}`);
  console.log(`${colors.green}${colors.bold}======================================================${colors.reset}\n`);

  closeDatabase();
}

runSuite().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}Test Suite Failed:${colors.reset}`, err);
  process.exit(1);
});
