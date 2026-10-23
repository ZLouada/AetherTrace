# AetherTrace Integration: LangChain & LangGraph

This example demonstrates how to integrate AetherTrace into LangChain or LangGraph agent pipelines using the duck-typed `AetherTraceCallbackHandler`.

## What It Demonstrates
1. Attaching `AetherTraceCallbackHandler` to model/chain invocations.
2. Intercepting LLM generations, tool executions, and state transitions without modifying core agent logic.
3. Propagating token counts, models, and error states automatically to AetherTrace.
4. Visualizing the execution DAG and tool chains inside **Flight Deck** (`http://localhost:3000`).

## How to Run

1. Start AetherTrace in a separate terminal:
   ```bash
   pnpm aethertrace start
   ```

2. Run this example:
   ```bash
   pnpm tsx examples/integrations/langchain/index.ts
   ```

3. Open Flight Deck:
   ```text
   http://localhost:3000
   ```
