/**
 * AetherTrace Integration Example: OpenTelemetry OTLP Ingestion & Round-Trip
 */

import { getDefaultProxyUrl } from '@aethertrace/sdk';

async function main() {
  const proxyUrl = getDefaultProxyUrl();
  console.log(`🚀 Sending OpenTelemetry OTLP trace to ${proxyUrl}/v1/traces...`);

  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const parentSpanId = '00f067aa0ba902b7';
  const childSpanId = '5fb397be34d23b0f';

  // Standard OpenTelemetry OTLP ExportTraceServiceRequest JSON
  const otlpPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'otel-customer-assistant' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'typescript' } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: 'agent-orchestrator', version: '1.0.0' },
            spans: [
              // Root Agent Span
              {
                traceId,
                spanId: parentSpanId,
                name: 'orchestrator_turn',
                kind: 1, // INTERNAL
                startTimeUnixNano: nowNs.toString(),
                endTimeUnixNano: (nowNs + 250_000_000n).toString(),
                attributes: [
                  { key: 'agent.name', value: { stringValue: 'LeadOrchestrator' } },
                  { key: 'gen_ai.system', value: { stringValue: 'openai' } },
                  { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '480' } },
                  { key: 'gen_ai.usage.output_tokens', value: { intValue: '120' } },
                  { key: 'gen_ai.prompt', value: { stringValue: 'Resolve customer incident ticket' } },
                  { key: 'gen_ai.completion', value: { stringValue: 'Delegating to search tool' } }
                ],
                status: { code: 1 } // OK
              },
              // Child Tool Span
              {
                traceId,
                spanId: childSpanId,
                parentSpanId: parentSpanId,
                name: 'tool:kb_search',
                kind: 1, // INTERNAL
                startTimeUnixNano: (nowNs + 50_000_000n).toString(),
                endTimeUnixNano: (nowNs + 180_000_000n).toString(),
                attributes: [
                  { key: 'gen_ai.tool.name', value: { stringValue: 'kb_search' } },
                  { key: 'gen_ai.tool.call.arguments', value: { stringValue: '{"query":"password_reset"}' } },
                  { key: 'gen_ai.tool.call.result', value: { stringValue: '{"articles":["KB-102","KB-104"]}' } }
                ],
                status: { code: 1 } // OK
              }
            ]
          }
        ]
      }
    ]
  };

  // Send via standard OTLP HTTP endpoint
  const res = await fetch(`${proxyUrl}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(otlpPayload)
  });

  if (!res.ok) {
    throw new Error(`Failed to send OTLP trace: HTTP ${res.status}`);
  }

  console.log('✔ Successfully ingested OTLP trace via POST /v1/traces!');
  console.log(`  Trace ID: ${traceId}`);
  console.log(`  Generated Run ID: run_otel_${traceId}`);

  // Fetch reconstructed run from AetherTrace API
  const runRes = await fetch(`${proxyUrl}/api/runs/run_otel_${traceId}`);
  if (runRes.ok) {
    const runData = await runRes.json();
    console.log(`  Imported Run Name: ${runData.run?.name}`);
    console.log(`  Calculated Cost:   $${runData.run?.total_cost_usd}`);
    console.log(`  Total Tokens:      ${runData.run?.total_tokens}`);
  }

  console.log('✨ OpenTelemetry trace is ready for inspection in Flight Deck at http://localhost:3000');
}

main().catch((err) => {
  console.error('OTel ingestion error:', err);
});
