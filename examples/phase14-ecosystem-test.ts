/**
 * AetherTrace Phase 14: Ecosystem & Integrations Verification Suite
 *
 * Verifies:
 * 1. OpenTelemetry OTLP JSON Ingestion & Semantic Mapping
 * 2. Deterministic Pricing Engine Token Cost Derivation
 * 3. Security Redaction & Payload Sanitization on OTel Telemetry
 * 4. OpenTelemetry OTLP Export & aethertrace.* Namespace Extensions
 * 5. OpenTelemetry Round-Trip Topology & Token Fidelity
 * 6. LangChain CallbackHandler Framework Adapter
 * 7. OpenAI Client Wrapping & Function Decorators (wrapTool / wrapAgent)
 * 8. Deduplication & Idempotency Guard Verification
 * 9. Proxy Server REST APIs (POST /v1/traces, POST /import/otel, GET /export/otel)
 * 10. Downstream Interoperability (Agent Intelligence & Evaluation over OTel Trace)
 */

import {
  getDatabase,
  trace_runs,
  trace_spans,
  mapOtlpToAetherTrace,
  mapAetherTraceToOtlp,
  parseAndImportOtlpJson,
  importOtlpTrace,
  otlpTraceIdToRunId,
  otlpSpanIdToSpanId,
  otlpNanoToMs,
  classifyOtlpSpanType,
  analyzeExecutionIntelligence,
  runEvaluation,
  type TraceRun,
  type TraceSpan
} from '@aethertrace/core-schema';
import {
  traceRun,
  traceAgent,
  wrapTool,
  wrapAgent,
  AetherTraceCallbackHandler,
  registerOperation,
  isOperationTracked,
  unregisterOperation,
  getDeduplicationHeaders
} from '@aethertrace/sdk';
import { startServer } from '@aethertrace/proxy-server';
import { eq, asc } from 'drizzle-orm';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✔ ${message}`);
}

async function runPhase14Verification() {
  console.log('\n======================================================');
  console.log('  AetherTrace Phase 14: Ecosystem & Integrations      ');
  console.log('======================================================\n');

  const { db, sqlite } = getDatabase();

  // --------------------------------------------------------------------------
  // 1. OpenTelemetry OTLP JSON Ingestion & Semantic Mapping
  // --------------------------------------------------------------------------
  console.log('1. OpenTelemetry OTLP JSON Parsing & Semantic Mapping');

  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const sampleTraceId = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';
  const sampleRootSpanId = '1122334455667788';
  const sampleToolSpanId = '9988776655443322';

  const otlpSampleRequest = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'sample-incident-agent' } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: 'agent-scope', version: '1.0.0' },
            spans: [
              {
                traceId: sampleTraceId,
                spanId: sampleRootSpanId,
                name: 'investigate_outage',
                kind: 1,
                startTimeUnixNano: nowNs.toString(),
                endTimeUnixNano: (nowNs + 400_000_000n).toString(),
                attributes: [
                  { key: 'gen_ai.system', value: { stringValue: 'openai' } },
                  { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '500' } },
                  { key: 'gen_ai.usage.output_tokens', value: { intValue: '150' } },
                  { key: 'gen_ai.prompt', value: { stringValue: 'Investigate DB timeout' } },
                  { key: 'gen_ai.completion', value: { stringValue: 'Executing diagnostics' } }
                ],
                status: { code: 1 }
              },
              {
                traceId: sampleTraceId,
                spanId: sampleToolSpanId,
                parentSpanId: sampleRootSpanId,
                name: 'tool:database_metrics',
                kind: 1,
                startTimeUnixNano: (nowNs + 50_000_000n).toString(),
                endTimeUnixNano: (nowNs + 250_000_000n).toString(),
                attributes: [
                  { key: 'gen_ai.tool.name', value: { stringValue: 'database_metrics' } },
                  { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{"cluster":"prod-db-1"}' } },
                  { key: 'gen_ai.tool.call.result', value: { stringValue: '{"cpu_utilization":94.2}' } }
                ],
                status: { code: 1 }
              }
            ]
          }
        ]
      }
    ]
  };

  const mapped = mapOtlpToAetherTrace(otlpSampleRequest);
  assert(mapped.run.id === `run_otel_${sampleTraceId}`, `Trace ID normalized: ${mapped.run.id}`);
  assert(mapped.spans.length === 2, `Mapped ${mapped.spans.length} spans`);
  assert(mapped.spans[0].span_type === 'llm_call', 'Root span classified as llm_call');
  assert(mapped.spans[1].span_type === 'tool_call', 'Child span classified as tool_call');
  assert(mapped.spans[1].parent_span_id === `span_otel_${sampleRootSpanId}`, 'Parent-child link preserved');
  assert(mapped.spans[0].prompt_tokens === 500, 'Prompt tokens extracted');
  assert(mapped.spans[0].completion_tokens === 150, 'Completion tokens extracted');

  // --------------------------------------------------------------------------
  // 2. Deterministic Pricing Engine Token Cost Derivation
  // --------------------------------------------------------------------------
  console.log('\n2. Deterministic Token Cost Pricing Derivation');

  assert(mapped.spans[0].cost_usd! > 0, `Derived positive cost for gpt-4o: $${mapped.spans[0].cost_usd}`);
  assert(mapped.spans[0].usage_status === 'estimated', `Usage status marked estimated for pricing derivation`);
  assert(mapped.run.total_cost_usd > 0, `Run total spend aggregated: $${mapped.run.total_cost_usd}`);

  // Test custom reported cost override
  const customCostRequest = {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId: '12345678901234567890123456789012',
                spanId: '1234567890123456',
                name: 'custom_cost_span',
                startTimeUnixNano: nowNs.toString(),
                endTimeUnixNano: (nowNs + 100_000_000n).toString(),
                attributes: [
                  { key: 'model', value: { stringValue: 'gpt-4o' } },
                  { key: 'aethertrace.cost_usd', value: { doubleValue: 0.0425 } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '100' } }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const mappedCustom = mapOtlpToAetherTrace(customCostRequest);
  assert(mappedCustom.spans[0].cost_usd === 0.0425, 'Reported cost honored');
  assert(mappedCustom.spans[0].usage_status === 'reported', 'Usage status marked reported');

  // --------------------------------------------------------------------------
  // 3. Security Redaction & Payload Sanitization on OTel Telemetry
  // --------------------------------------------------------------------------
  console.log('\n3. Security Redaction & Payload Sanitization on OTel Telemetry');

  const leakedSecretRequest = {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'secretstrace000000000000000000000',
                spanId: 'secretspan000000',
                name: 'secret_leak_span',
                startTimeUnixNano: nowNs.toString(),
                endTimeUnixNano: (nowNs + 100_000_000n).toString(),
                attributes: [
                  { key: 'gen_ai.prompt', value: { stringValue: 'Bearer sk-proj-1234567890abcdef1234567890abcdef authorization header' } },
                  { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{"apiKey":"ghp_abcdefghijklmnopqrstuvwxyz0123456789"}' } }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const mappedSecrets = mapOtlpToAetherTrace(leakedSecretRequest);
  const reqPayloadStr = mappedSecrets.spans[0].request_payload || '';
  assert(!reqPayloadStr.includes('sk-proj-1234567890abcdef'), 'OpenAI secret redacted in OTel prompt');
  assert(!reqPayloadStr.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), 'GitHub token redacted in OTel tool arguments');
  assert(reqPayloadStr.includes('[REDACTED:OPENAI_KEY]') || reqPayloadStr.includes('[REDACTED'), 'Redaction placeholder inserted');

  // --------------------------------------------------------------------------
  // 4. OpenTelemetry OTLP Export & aethertrace.* Extensions
  // --------------------------------------------------------------------------
  console.log('\n4. OpenTelemetry OTLP Export & aethertrace.* Namespace Extensions');

  // Insert test run into SQLite
  const importResult = importOtlpTrace(db, sqlite, otlpSampleRequest);
  assert(importResult.success, `Imported trace into SQLite (Run ID: ${importResult.runId})`);

  const savedRun = db.select().from(trace_runs).where(eq(trace_runs.id, importResult.runId)).limit(1).all()[0];
  const savedSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, importResult.runId)).orderBy(asc(trace_spans.created_at)).all();

  const exportedOtlp = mapAetherTraceToOtlp(savedRun, savedSpans);
  assert(Boolean(exportedOtlp.resourceSpans?.[0]), 'Export generated resourceSpans');
  const exportedSpans = exportedOtlp.resourceSpans![0].scopeSpans![0].spans!;
  assert(exportedSpans.length === 2, `Exported ${exportedSpans.length} spans`);

  // Verify attributes
  const span0Attrs = exportedSpans[0].attributes!;
  const hasAetherTraceCost = span0Attrs.some((a) => a.key === 'aethertrace.cost_usd');
  const hasAetherTraceSpanType = span0Attrs.some((a) => a.key === 'aethertrace.span_type');
  const hasGenAiModel = span0Attrs.some((a) => a.key === 'gen_ai.request.model');

  assert(hasAetherTraceCost, 'Attribute aethertrace.cost_usd exported');
  assert(hasAetherTraceSpanType, 'Attribute aethertrace.span_type exported');
  assert(hasGenAiModel, 'Standard OTel gen_ai.request.model exported');

  // --------------------------------------------------------------------------
  // 5. OpenTelemetry Round-Trip Topology & Token Fidelity
  // --------------------------------------------------------------------------
  console.log('\n5. OpenTelemetry Round-Trip Topology & Token Fidelity');

  const reimported = mapOtlpToAetherTrace(exportedOtlp);
  assert(reimported.spans.length === savedSpans.length, `Round-trip preserved span count (${reimported.spans.length})`);
  assert(reimported.spans[0].model === savedSpans[0].model, `Round-trip preserved model (${reimported.spans[0].model})`);
  assert(reimported.spans[0].prompt_tokens === savedSpans[0].prompt_tokens, `Round-trip preserved prompt tokens`);
  assert(reimported.spans[0].completion_tokens === savedSpans[0].completion_tokens, `Round-trip preserved completion tokens`);
  assert(reimported.spans[1].parent_span_id === reimported.spans[0].id, `Round-trip preserved DAG parent link`);

  // --------------------------------------------------------------------------
  // 6. LangChain CallbackHandler Framework Adapter
  // --------------------------------------------------------------------------
  console.log('\n6. LangChain CallbackHandler Framework Adapter');

  let emittedSpans: any[] = [];
  const testHandler = new AetherTraceCallbackHandler({
    agentName: 'TestLangChainAgent'
  });

  // Verify method interface
  assert(typeof testHandler.handleLLMStart === 'function', 'handleLLMStart interface implemented');
  assert(typeof testHandler.handleLLMEnd === 'function', 'handleLLMEnd interface implemented');
  assert(typeof testHandler.handleToolStart === 'function', 'handleToolStart interface implemented');
  assert(typeof testHandler.handleToolEnd === 'function', 'handleToolEnd interface implemented');
  assert(typeof testHandler.handleChainStart === 'function', 'handleChainStart interface implemented');
  assert(typeof testHandler.handleChainEnd === 'function', 'handleChainEnd interface implemented');

  // --------------------------------------------------------------------------
  // 7. OpenAI Client Wrapping & Function Decorators (wrapTool / wrapAgent)
  // --------------------------------------------------------------------------
  console.log('\n7. Function Decorators (wrapTool / wrapAgent)');

  let toolExecuted = false;
  const wrappedAdd = wrapTool(
    async (a: number, b: number) => {
      toolExecuted = true;
      return a + b;
    },
    { name: 'calculator_add' }
  );

  const calcResult = await wrappedAdd(21, 21);
  assert(toolExecuted, 'Wrapped tool function executed');
  assert(calcResult === 42, 'Wrapped tool returned expected calculation (42)');

  let agentRan = false;
  const wrappedRoutine = wrapAgent(
    async (task: string) => {
      agentRan = true;
      return `Done with ${task}`;
    },
    { name: 'TriageAgent' }
  );

  const agentResult = await wrappedRoutine('classify');
  assert(agentRan, 'Wrapped agent routine executed');
  assert(agentResult === 'Done with classify', 'Wrapped agent returned expected result');

  // --------------------------------------------------------------------------
  // 8. Deduplication & Idempotency Guard Verification
  // --------------------------------------------------------------------------
  console.log('\n8. Deduplication & Idempotency Guard Verification');

  const testSpanId = 'span_dedup_test_123';
  assert(!isOperationTracked(testSpanId), 'Initially operation is untracked');

  const marker = registerOperation(testSpanId, 'langchain');
  assert(marker.spanId === testSpanId, 'Marker generated with target span ID');
  assert(isOperationTracked(testSpanId), 'Operation marked as active in-flight');

  const headers = getDeduplicationHeaders(testSpanId);
  assert(headers['X-AetherTrace-Span-Id'] === testSpanId, 'Deduplication header X-AetherTrace-Span-Id set');
  assert(headers['X-AetherTrace-Instrumented'] === 'client', 'Instrumented client flag set');

  unregisterOperation(testSpanId);
  assert(!isOperationTracked(testSpanId), 'Operation cleared from active map');

  // --------------------------------------------------------------------------
  // 9. Proxy Server REST APIs (POST /v1/traces, POST /import/otel, GET /export/otel)
  // --------------------------------------------------------------------------
  console.log('\n9. Proxy Server Endpoints (POST /v1/traces, POST /import/otel, GET /export/otel)');

  const testPort = 4144;
  const { server } = startServer(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}`;

    // Test 1: POST /v1/traces (Standard OTLP HTTP ingestion)
    const otlpPostRes = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otlpSampleRequest)
    });
    assert(otlpPostRes.status === 200, `POST /v1/traces responded HTTP 200`);
    const otlpPostJson = await otlpPostRes.json();
    assert(otlpPostJson.partialSuccess !== undefined, 'Standard OTLP partialSuccess response returned');

    // Test 2: POST /api/runs/import/otel (REST import)
    const restImportRes = await fetch(`${baseUrl}/api/runs/import/otel?run_name=imported-via-rest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otlpSampleRequest)
    });
    assert(restImportRes.status === 201, `POST /api/runs/import/otel responded HTTP 201`);
    const restImportJson = await restImportRes.json();
    assert(restImportJson.success === true, 'Import confirmed success');
    assert(restImportJson.spanCount === 2, `Imported ${restImportJson.spanCount} spans`);

    // Test 3: GET /api/runs/:id/export/otel
    const otlpExportRes = await fetch(`${baseUrl}/api/runs/${restImportJson.runId}/export/otel`);
    assert(otlpExportRes.status === 200, `GET /api/runs/:id/export/otel responded HTTP 200`);
    const otlpExportJson = await otlpExportRes.json();
    assert(Boolean(otlpExportJson.resourceSpans), 'Export returned OTLP resourceSpans');
  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // 10. Downstream Interoperability (Agent Intelligence & Evaluation over OTel Trace)
  // --------------------------------------------------------------------------
  console.log('\n10. Downstream Interoperability (Intelligence & Evaluation over OTel Trace)');

  // Run Phase 11 Intelligence over the imported OTel run
  const intelSpans = db.select().from(trace_spans).where(eq(trace_spans.run_id, importResult.runId)).orderBy(asc(trace_spans.created_at)).all();
  const intelRun = db.select().from(trace_runs).where(eq(trace_runs.id, importResult.runId)).limit(1).all()[0];

  const intelligence = analyzeExecutionIntelligence(intelSpans, intelRun);
  assert(intelligence.toolChains.length === 1, `Intelligence extracted ${intelligence.toolChains.length} tool chain from OTel trace`);
  assert(intelligence.toolChains[0].toolName === 'database_metrics', 'Tool name correctly identified in chain');
  assert(intelligence.criticalPath.durationMs > 0, `Critical path derived: ${intelligence.criticalPath.durationMs}ms`);

  // Run Phase 13 Evaluation over the imported OTel run
  const evalReport = await runEvaluation(
    db,
    {
      targetType: 'run',
      targetId: importResult.runId,
      rules: [
        { expression: 'reliability.errorCount == 0', severity: 'critical' },
        { expression: 'cost.totalCostUsd <= 0.05', severity: 'warning' },
        { expression: 'tool "database_metrics" must exist', severity: 'critical' }
      ]
    }
  );

  assert(evalReport.status === 'passed', `Evaluation passed on imported OTel run (Score: ${evalReport.score.passPercentage}%)`);
  assert(evalReport.assertions.length === 3, 'All 3 assertions evaluated on OTel trace');
  assert(evalReport.assertions[2].status === 'passed', 'Tool existence assertion passed on OTel tool span');

  console.log('\n======================================================');
  console.log('  ✔ Phase 14 Ecosystem Suite: ALL TESTS PASSED        ');
  console.log('======================================================\n');
}

runPhase14Verification().catch((err) => {
  console.error('Phase 14 Verification Error:', err);
  process.exit(1);
});
