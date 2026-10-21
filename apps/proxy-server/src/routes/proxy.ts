import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  getDatabase,
  trace_runs,
  trace_spans,
  computeRequestHash,
  ChatCompletionRequestSchema,
  type TraceRun,
  type TraceSpan
} from '@aethertrace/core-schema';
import { calculateCost } from '@aethertrace/pricing-engine';
import { checkCircuitBreakers, tripCircuitBreaker } from '../services/breaker.js';
import { lookupReplayCache, createReplayStreamChunks } from '../services/cache.js';
import { broadcastEvent } from '../broadcaster.js';

export const proxyRouter = new Hono();

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateMockResponse(body: any, id: string) {
  const model = body.model || 'gpt-4o';
  const lastUserMessage = [...(body.messages || [])].reverse().find((m: any) => m.role === 'user');
  const userPrompt = lastUserMessage?.content || 'Hello';
  const replyContent = `[AetherTrace Mock Engine] Processed prompt: "${typeof userPrompt === 'string' ? userPrompt.slice(0, 50) : 'input'}"`;

  const promptTokens = estimateTokens(JSON.stringify(body.messages || []));
  const completionTokens = estimateTokens(replyContent);

  return {
    id: `chatcmpl-${id}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: replyContent
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  };
}

async function handleChatCompletions(c: any) {
  const startTime = Date.now();
  let rawBody: any;
  try {
    rawBody = await c.req.json();
  } catch (err) {
    return c.json({ error: { message: 'Invalid JSON payload in request body' } }, 400);
  }

  const parseResult = ChatCompletionRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return c.json({
      error: {
        message: 'Invalid chat completion schema',
        details: parseResult.error.flatten()
      }
    }, 400);
  }

  const reqBody = parseResult.data;
  const isStreaming = Boolean(reqBody.stream);
  const requestHash = computeRequestHash(reqBody);

  // Extract headers
  const runId = c.req.header('x-run-id') || `run_${randomUUID()}`;
  const parentSpanId = c.req.header('x-parent-span-id') || null;
  const agentName = c.req.header('x-agent-name') || 'default-agent';
  const maxBudgetHeader = c.req.header('x-max-budget-usd');
  const maxBudgetUsd = maxBudgetHeader ? Number.parseFloat(maxBudgetHeader) : undefined;
  const isReplayMode = c.req.header('x-replay-mode') === 'true' || c.req.header('x-replay-cache') === 'true';
  const isMockUpstream = c.req.header('x-mock-upstream') === 'true' || c.req.header('x-mock-response') === 'true' || process.env.AETHERTRACE_MOCK === 'true';

  const { db } = getDatabase();

  // 1. Ensure Trace Run exists in SQLite
  const existingRuns = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
  if (existingRuns.length === 0) {
    const newRun: TraceRun = {
      id: runId,
      name: c.req.header('x-run-name') || `${agentName}-session`,
      status: 'running',
      total_tokens: 0,
      total_cost_usd: 0.0,
      parent_run_id: null,
      forked_at_span_id: null,
      created_at: startTime
    };
    db.insert(trace_runs).values(newRun).run();

    broadcastEvent({
      type: 'RUN_CREATED',
      data: newRun,
      runId
    });
  }

  // 2. Circuit Breaker Check (breaker.ts)
  const breakerResult = await checkCircuitBreakers({
    runId,
    requestHash,
    maxBudgetUsd,
    loopThreshold: 3
  });

  if (!breakerResult.allowed) {
    // Trips breaker: updates trace_runs.status = 'breaker_tripped', inserts 'guardrail_block' span, broadcasts WS alert
    const blockSpan = tripCircuitBreaker({
      runId,
      parentSpanId,
      agentName,
      model: reqBody.model,
      requestPayload: JSON.stringify(rawBody),
      requestHash,
      breakerResult
    });

    return c.json({
      error: {
        message: breakerResult.message,
        type: 'circuit_breaker_tripped',
        code: breakerResult.type,
        details: breakerResult.details
      }
    }, 429);
  }

  // 3. Time-Travel Replay Cache Lookup (X-Replay-Mode: true)
  if (isReplayMode) {
    const cachedSpan = lookupReplayCache(requestHash);
    if (cachedSpan && cachedSpan.response_payload) {
      let cachedResponse: any;
      try {
        cachedResponse = JSON.parse(cachedSpan.response_payload);
      } catch {
        cachedResponse = null;
      }

      if (cachedResponse) {
        const replaySpanId = `span_${randomUUID()}`;
        const now = Date.now();

        // 0ms latency, $0.00 cost, cache_hit = 1
        const replaySpan: TraceSpan = {
          id: replaySpanId,
          run_id: runId,
          parent_span_id: parentSpanId,
          span_type: 'llm_call',
          agent_name: agentName,
          model: reqBody.model,
          request_payload: JSON.stringify(rawBody),
          response_payload: cachedSpan.response_payload,
          prompt_tokens: cachedSpan.prompt_tokens || 0,
          completion_tokens: cachedSpan.completion_tokens || 0,
          cost_usd: 0.0,
          latency_ms: 0,
          cache_hit: 1,
          request_hash: requestHash,
          created_at: now
        };

        db.insert(trace_spans).values(replaySpan).run();

        broadcastEvent({
          type: 'SPAN_CREATED',
          data: replaySpan,
          runId,
          spanId: replaySpanId
        });

        if (isStreaming) {
          c.header('Content-Type', 'text/event-stream');
          c.header('Cache-Control', 'no-cache');
          c.header('Connection', 'keep-alive');
          c.header('X-AetherTrace-Cache', 'HIT');
          c.header('X-AetherTrace-Latency', '0ms');

          return streamText(c, async (stream) => {
            for (const chunk of createReplayStreamChunks(cachedResponse, reqBody.model)) {
              await stream.write(chunk);
            }
          });
        }

        return c.json(cachedResponse, 200, {
          'X-AetherTrace-Cache': 'HIT',
          'X-AetherTrace-Latency': '0ms',
          'X-AetherTrace-Cost': '$0.000000'
        });
      }
    }
  }

  // 4. Upstream Execution (Mock or Real Upstream)
  const spanId = `span_${randomUUID()}`;
  const openaiBaseUrl = c.req.header('x-target-base-url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // Handle Mock Upstream with 150ms delay
  if (isMockUpstream || !process.env.OPENAI_API_KEY && !c.req.header('authorization') && !c.req.header('x-target-base-url')) {
    // Simulate realistic 150ms upstream network latency
    await sleep(150);

    const mockResponse = generateMockResponse(rawBody, spanId);
    const latencyMs = Math.max(150, Date.now() - startTime);
    const costResult = calculateCost(
      reqBody.model,
      mockResponse.usage.prompt_tokens,
      mockResponse.usage.completion_tokens
    );

    const promptTokens = mockResponse.usage.prompt_tokens;
    const completionTokens = mockResponse.usage.completion_tokens;
    const totalTokens = promptTokens + completionTokens;

    if (isStreaming) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-AetherTrace-Cache', 'MISS');

      return streamText(c, async (stream) => {
        for (const chunk of createReplayStreamChunks(mockResponse, reqBody.model)) {
          await stream.write(chunk);
        }

        const now = Date.now();
        const span: TraceSpan = {
          id: spanId,
          run_id: runId,
          parent_span_id: parentSpanId,
          span_type: 'llm_call',
          agent_name: agentName,
          model: reqBody.model,
          request_payload: JSON.stringify(rawBody),
          response_payload: JSON.stringify(mockResponse),
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costResult.totalCost,
          latency_ms: Math.max(150, now - startTime),
          cache_hit: 0,
          request_hash: requestHash,
          created_at: now
        };

        db.insert(trace_spans).values(span).run();

        const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
        if (runs.length > 0) {
          const run = runs[0];
          db.update(trace_runs)
            .set({
              total_tokens: run.total_tokens + totalTokens,
              total_cost_usd: run.total_cost_usd + costResult.totalCost
            })
            .where(eq(trace_runs.id, runId))
            .run();
        }

        broadcastEvent({
          type: 'SPAN_CREATED',
          data: span,
          runId,
          spanId
        });
      });
    }

    // Non-Streaming Mock
    const now = Date.now();
    const span: TraceSpan = {
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'llm_call',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify(mockResponse),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costResult.totalCost,
      latency_ms: latencyMs,
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    db.insert(trace_spans).values(span).run();

    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      db.update(trace_runs)
        .set({
          total_tokens: run.total_tokens + totalTokens,
          total_cost_usd: run.total_cost_usd + costResult.totalCost
        })
        .where(eq(trace_runs.id, runId))
        .run();
    }

    broadcastEvent({
      type: 'SPAN_CREATED',
      data: span,
      runId,
      spanId
    });

    return c.json(mockResponse, 200, {
      'X-AetherTrace-Cache': 'MISS',
      'X-AetherTrace-Cost': `$${costResult.totalCost.toFixed(6)}`,
      'X-AetherTrace-Latency': `${latencyMs}ms`
    });
  }

  // 5. Forward to real upstream OPENAI_BASE_URL
  const targetUrl = `${openaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const authHeader = c.req.header('authorization');
  if (authHeader) {
    forwardHeaders['Authorization'] = authHeader;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(rawBody)
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      const now = Date.now();
      const errSpan: TraceSpan = {
        id: spanId,
        run_id: runId,
        parent_span_id: parentSpanId,
        span_type: 'guardrail_block',
        agent_name: agentName,
        model: reqBody.model,
        request_payload: JSON.stringify(rawBody),
        response_payload: errorText,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0.0,
        latency_ms: Math.max(1, now - startTime),
        cache_hit: 0,
        request_hash: requestHash,
        created_at: now
      };

      db.insert(trace_spans).values(errSpan).run();

      broadcastEvent({
        type: 'SPAN_CREATED',
        data: errSpan,
        runId,
        spanId
      });

      return c.text(errorText, upstreamRes.status as any);
    }

    if (isStreaming) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-AetherTrace-Cache', 'MISS');

      return streamText(c, async (stream) => {
        let accumulatedText = '';
        let promptTokens = estimateTokens(JSON.stringify(rawBody.messages || []));
        let completionTokens = 0;

        const reader = upstreamRes.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const textChunk = decoder.decode(value, { stream: true });
            await stream.write(textChunk);

            const lines = textChunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.choices?.[0]?.delta?.content) {
                    accumulatedText += parsed.choices[0].delta.content;
                  }
                  if (parsed.usage) {
                    promptTokens = parsed.usage.prompt_tokens || promptTokens;
                    completionTokens = parsed.usage.completion_tokens || completionTokens;
                  }
                } catch {}
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (completionTokens === 0) {
          completionTokens = estimateTokens(accumulatedText);
        }

        const costResult = calculateCost(reqBody.model, promptTokens, completionTokens);
        const totalTokens = promptTokens + completionTokens;
        const now = Date.now();

        const synthesizedResponse = {
          id: `chatcmpl-${spanId}`,
          object: 'chat.completion',
          created: Math.floor(startTime / 1000),
          model: reqBody.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: accumulatedText },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens
          }
        };

        const span: TraceSpan = {
          id: spanId,
          run_id: runId,
          parent_span_id: parentSpanId,
          span_type: 'llm_call',
          agent_name: agentName,
          model: reqBody.model,
          request_payload: JSON.stringify(rawBody),
          response_payload: JSON.stringify(synthesizedResponse),
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: costResult.totalCost,
          latency_ms: Math.max(1, now - startTime),
          cache_hit: 0,
          request_hash: requestHash,
          created_at: now
        };

        db.insert(trace_spans).values(span).run();

        const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
        if (runs.length > 0) {
          const run = runs[0];
          db.update(trace_runs)
            .set({
              total_tokens: run.total_tokens + totalTokens,
              total_cost_usd: run.total_cost_usd + costResult.totalCost
            })
            .where(eq(trace_runs.id, runId))
            .run();
        }

        broadcastEvent({
          type: 'SPAN_CREATED',
          data: span,
          runId,
          spanId
        });
      });
    }

    // Non-streaming upstream response
    const upstreamJson: any = await upstreamRes.json();
    const now = Date.now();
    const latencyMs = Math.max(1, now - startTime);

    const promptTokens = upstreamJson.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(rawBody.messages || []));
    const completionTokens = upstreamJson.usage?.completion_tokens ?? estimateTokens(upstreamJson.choices?.[0]?.message?.content || '');
    const totalTokens = promptTokens + completionTokens;
    const costResult = calculateCost(reqBody.model, promptTokens, completionTokens);

    const span: TraceSpan = {
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'llm_call',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify(upstreamJson),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costResult.totalCost,
      latency_ms: latencyMs,
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    db.insert(trace_spans).values(span).run();

    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      db.update(trace_runs)
        .set({
          total_tokens: run.total_tokens + totalTokens,
          total_cost_usd: run.total_cost_usd + costResult.totalCost
        })
        .where(eq(trace_runs.id, runId))
        .run();
    }

    broadcastEvent({
      type: 'SPAN_CREATED',
      data: span,
      runId,
      spanId
    });

    return c.json(upstreamJson, 200, {
      'X-AetherTrace-Cache': 'MISS',
      'X-AetherTrace-Cost': `$${costResult.totalCost.toFixed(6)}`,
      'X-AetherTrace-Latency': `${latencyMs}ms`
    });
  } catch (err: any) {
    const now = Date.now();
    const errSpan: TraceSpan = {
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'guardrail_block',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify({ error: err.message }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: Math.max(1, now - startTime),
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    db.insert(trace_spans).values(errSpan).run();

    broadcastEvent({
      type: 'SPAN_CREATED',
      data: errSpan,
      runId,
      spanId
    });

    return c.json({
      error: {
        message: `Upstream communication failure: ${err.message}`,
        type: 'proxy_error'
      }
    }, 502);
  }
}

proxyRouter.post('/v1/chat/completions', handleChatCompletions);
proxyRouter.post('/chat/completions', handleChatCompletions);
