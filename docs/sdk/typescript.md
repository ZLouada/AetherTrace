# TypeScript / Node.js SDK Reference

The `@aethertrace/sdk` package provides zero-dependency, thread-safe, and asynchronous context propagation using Node.js `AsyncLocalStorage`.

---

## 1. Installation

```bash
pnpm add @aethertrace/sdk
# or:
npm install @aethertrace/sdk
```

---

## 2. Core API Reference

### `traceRun(name, options?, fn)`
Wraps an execution block in a top-level Trace Run. Automatically generates a unique `runId` and propagates context through all asynchronous operations.

```typescript
import { traceRun } from '@aethertrace/sdk';

await traceRun('Incident-Triage', { mockUpstream: false }, async () => {
  // All child calls inherit this run context
  await executeWorkflow();
});
```

### `traceAgent(agentName, options?, fn)`
Sets the active agent identity within the current run and establishes a parent link to the upstream span.

```typescript
import { traceAgent } from '@aethertrace/sdk';

const plannerSpan = await traceAgent('Planner', async () => {
  return await callModel('Deconstruct incident symptoms');
});

// Chain downstream researcher to planner
await traceAgent('Researcher', { parentSpanId: plannerSpan.id }, async () => {
  return await callModel('Search logs for error signature');
});
```

### `traceTool(toolName, args, fn)`
Wraps an external tool or database query as a structured `TOOL` event.

```typescript
import { traceTool } from '@aethertrace/sdk';

const result = await traceTool('query_postgres', { sql: 'SELECT * FROM users' }, async () => {
  return await db.query('SELECT * FROM users');
});
```

### `traceRetry(failedSpanId, attemptNumber, reason, fn)`
Records an explicit structured retry linked back to the failed attempt.

```typescript
import { traceRetry } from '@aethertrace/sdk';

await traceRetry(failedSpanId, 1, 'HTTP 429 RateLimit', async () => {
  return await callModelWithBackoff();
});
```

### `getTraceHeaders()`
Generates an HTTP headers dictionary with the active trace context:
- `X-Run-Id`
- `X-Run-Name`
- `X-Agent-Name`
- `X-Parent-Span-Id`
- `X-Max-Budget-USD`
- `X-Mock-Upstream`
- `X-Replay-Mode`

---

## 3. OpenAI Client Integration Example

```typescript
import OpenAI from 'openai';
import { traceRun, traceAgent, getTraceHeaders } from '@aethertrace/sdk';

const openai = new OpenAI({
  baseURL: 'http://localhost:4000/v1'
});

await traceRun('Customer-Support-Bot', async () => {
  await traceAgent('Classifier', async () => {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Customer asks for refund' }]
    }, {
      headers: getTraceHeaders()
    });
    console.log(res.choices[0].message.content);
  });
});
```
