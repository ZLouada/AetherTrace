# AetherTrace Integration: OpenTelemetry (OTel) Interoperability

This example demonstrates how to export an OpenTelemetry trace from an external system and import it directly into AetherTrace for local debugging, DAG analysis, and zero-eval regression evaluation.

## What It Demonstrates
1. Generating standard OpenTelemetry OTLP/HTTP JSON (`ExportTraceServiceRequest`).
2. Sending the telemetry to AetherTrace proxy via `POST /v1/traces` (standard OTLP endpoint) or `POST /api/runs/import/otel`.
3. Verifying that the imported trace is fully visualizable in **Flight Deck**, searchable, and evaluatable.
4. Exporting the reconstructed run back into standard OTLP JSON.

## How to Run

1. Start AetherTrace in a separate terminal:
   ```bash
   pnpm aethertrace start
   ```

2. Run this example:
   ```bash
   pnpm tsx examples/integrations/opentelemetry/index.ts
   ```

3. Open Flight Deck to inspect the imported OTel trace:
   ```text
   http://localhost:3000
   ```
