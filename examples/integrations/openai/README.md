# AetherTrace Integration: OpenAI SDK & Wrapped Tools

This example demonstrates how to integrate AetherTrace into an OpenAI-based agent application with zero rewrites.

## What It Demonstrates
1. Wrapping an OpenAI client via `wrapOpenAI` to route completions through the local AetherTrace proxy.
2. Wrapping custom agent tools via `wrapTool` to automatically record inputs, results, and execution latency.
3. Propagating multi-agent context across nested agent routines via `traceRun` and `traceAgent`.
4. Visualizing the resulting DAG, cost accounting, and tool calls inside **Flight Deck** (`http://localhost:3000`).

## How to Run

1. Start the AetherTrace interceptor proxy in a separate terminal:
   ```bash
   pnpm aethertrace start
   ```

2. Run this example:
   ```bash
   pnpm tsx examples/integrations/openai/index.ts
   ```

3. Open Flight Deck to inspect the execution:
   ```text
   http://localhost:3000
   ```
