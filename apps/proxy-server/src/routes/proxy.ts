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
import { checkCircuitBreakers } from '../services/breaker.js';
import { lookupReplayCache, createReplayStreamChunks } from '../services/cache.js';
import { broadcastEvent } from '../broadcaster.js';

export const proxyRouter = new Hono();

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
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

  // Extract metadata and tracing headers
  const runId = c.req.header('x-run-id') || `run_${randomUUID()}`;
  const runName = c.req.header('x-run-name') || 'default-session';
  const parentSpanId = c.req.header('x-parent-span-id') || null;
  const maxBudgetHeader = c.req.header('x-max-budget-usd');
  const maxBudgetUsd = maxBudgetHeader ? Number.parseFloat(maxBudgetHeader) : undefined;
  const bypassCache = c.req.header('x-replay-cache') === 'false';
  const isMock = c.req.header('x-mock-response') === 'true' || process.env.AETHERTRACE_MOCK === 'true';

  const { db } = getDatabase();

  // 1. Ensure Trace Run exists
  const existingRuns = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
  if (existingRuns.length === 0) {
    const newRun: TraceRun = {
      id: runId,
      name: runName,
      status: 'running',
      started_at: startTime,
      ended_at: null,
      total_cost: 0.0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      metadata: JSON.stringify({
        userAgent: c.req.header('user-agent'),
        clientIp: c.req.header('x-forwarded-for') || 'local'
      }),
      created_at: startTime
    };
    db.insert(trace_runs).values(newRun).run();

    broadcastEvent({
      type: 'run:created',
      timestamp: startTime,
      runId,
      data: newRun
    });
  }

  // 2. Circuit Breaker Check
  const breakerResult = await checkCircuitBreakers({
    runId,
    requestHash,
    maxBudgetUsd,
    loopThreshold: 3
  });

  if (!breakerResult.allowed) {
    const eventType = breakerResult.type === 'budget_exceeded' ? 'breaker:budget_exceeded' : 'breaker:loop_detected';
    broadcastEvent({
      type: eventType,
      timestamp: Date.now(),
      runId,
      data: breakerResult
    });

    return c.json({
      error: {
        message: breakerResult.message,
        type: 'circuit_breaker_error',
        code: breakerResult.type,
        details: breakerResult.details
      }
    }, 429);
  }

  // 3. Time-Travel Replay Cache Lookup
  if (!bypassCache) {
    const cachedSpan = lookupReplayCache(requestHash);
    if (cachedSpan && cachedSpan.response_payload) {
      let cachedResponse: any;
      try {
        cachedResponse = JSON.parse(cachedSpan.response_payload);
      } catch {
        cachedResponse = null;
      }

      if (cachedResponse) {
        const replaySpanId = `span_replay_${randomUUID()}`;
        const now = Date.now();

        // Record zero-cost cached span in trace history
        const replaySpan: TraceSpan = {
          id: replaySpanId,
          run_id: runId,
          parent_span_id: parentSpanId,
          name: 'chat_completion',
          span_type: 'replay',
          status: 'success',
          request_hash: requestHash,
          model: reqBody.model,
          prompt_tokens: cachedSpan.prompt_tokens || 0,
          completion_tokens: cachedSpan.completion_tokens || 0,
          cost: 0.0,
          request_payload: JSON.stringify(rawBody),
          response_payload: cachedSpan.response_payload,
          latency_ms: 0,
          is_cached: 1,
          error_message: null,
          created_at: now,
          started_at: now,
          ended_at: now
        };

        db.insert(trace_spans).values(replaySpan).run();

        broadcastEvent({
          type: 'cache:hit',
          timestamp: now,
          runId,
          spanId: replaySpanId,
          data: { requestHash, originalSpanId: cachedSpan.id }
        });

        broadcastEvent({
          type: 'span:created',
          timestamp: now,
          runId,
          spanId: replaySpanId,
          data: replaySpan
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

  // 4. Live Execution (Forward to Upstream or Mock Engine)
  const spanId = `span_${randomUUID()}`;
  const initialSpan: TraceSpan = {
    id: spanId,
    run_id: runId,
    parent_span_id: parentSpanId,
    name: 'chat_completion',
    span_type: 'llm',
    status: 'running',
    request_hash: requestHash,
    model: reqBody.model,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost: 0.0,
    request_payload: JSON.stringify(rawBody),
    response_payload: null,
    latency_ms: 0,
    is_cached: 0,
    error_message: null,
    created_at: startTime,
    started_at: startTime,
    ended_at: null
  };

  db.insert(trace_spans).values(initialSpan).run();

  broadcastEvent({
    type: 'span:created',
    timestamp: startTime,
    runId,
    spanId,
    data: initialSpan
  });

  const upstreamBaseUrl = c.req.header('x-target-base-url') || process.env.UPSTREAM_BASE_URL;

  // Handle Mock Execution when requested or if no upstream is configured
  if (isMock || !upstreamBaseUrl) {
    const mockResponse = generateMockResponse(rawBody, spanId);
    const latencyMs = Math.max(1, Date.now() - startTime);
    const costResult = calculateCost(
      reqBody.model,
      mockResponse.usage.prompt_tokens,
      mockResponse.usage.completion_tokens
    );

    if (isStreaming) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-AetherTrace-Cache', 'MISS');

      return streamText(c, async (stream) => {
        for (const chunk of createReplayStreamChunks(mockResponse, reqBody.model)) {
          await stream.write(chunk);
        }

        // Persist completed span
        const endedAt = Date.now();
        db.update(trace_spans)
          .set({
            status: 'success',
            prompt_tokens: mockResponse.usage.prompt_tokens,
            completion_tokens: mockResponse.usage.completion_tokens,
            cost: costResult.totalCost,
            response_payload: JSON.stringify(mockResponse),
            latency_ms: Math.max(1, endedAt - startTime),
            ended_at: endedAt
          })
          .where(eq(trace_spans.id, spanId))
          .run();

        // Update run aggregates
        const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
        if (runs.length > 0) {
          const run = runs[0];
          db.update(trace_runs)
            .set({
              total_cost: run.total_cost + costResult.totalCost,
              total_prompt_tokens: run.total_prompt_tokens + mockResponse.usage.prompt_tokens,
              total_completion_tokens: run.total_completion_tokens + mockResponse.usage.completion_tokens
            })
            .where(eq(trace_runs.id, runId))
            .run();
        }

        broadcastEvent({
          type: 'span:completed',
          timestamp: endedAt,
          runId,
          spanId,
          data: {
            id: spanId,
            status: 'success',
            cost: costResult.totalCost,
            tokens: mockResponse.usage
          }
        });
      });
    }

    // Non-Streaming Mock
    const endedAt = Date.now();
    db.update(trace_spans)
      .set({
        status: 'success',
        prompt_tokens: mockResponse.usage.prompt_tokens,
        completion_tokens: mockResponse.usage.completion_tokens,
        cost: costResult.totalCost,
        response_payload: JSON.stringify(mockResponse),
        latency_ms: latencyMs,
        ended_at: endedAt
      })
      .where(eq(trace_spans.id, spanId))
      .run();

    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      db.update(trace_runs)
        .set({
          total_cost: run.total_cost + costResult.totalCost,
          total_prompt_tokens: run.total_prompt_tokens + mockResponse.usage.prompt_tokens,
          total_completion_tokens: run.total_completion_tokens + mockResponse.usage.completion_tokens
        })
        .where(eq(trace_runs.id, runId))
        .run();
    }

    broadcastEvent({
      type: 'span:completed',
      timestamp: endedAt,
      runId,
      spanId,
      data: {
        id: spanId,
        status: 'success',
        cost: costResult.totalCost,
        tokens: mockResponse.usage
      }
    });

    return c.json(mockResponse, 200, {
      'X-AetherTrace-Cache': 'MISS',
      'X-AetherTrace-Cost': `$${costResult.totalCost.toFixed(6)}`,
      'X-AetherTrace-Latency': `${latencyMs}ms`
    });
  }

  // 5. Upstream Real Provider Forwarding
  const targetUrl = `${upstreamBaseUrl.replace(/\/$/, '')}/chat/completions`;
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
      const endedAt = Date.now();
      db.update(trace_spans)
        .set({
          status: 'error',
          error_message: errorText,
          latency_ms: Math.max(1, endedAt - startTime),
          ended_at: endedAt
        })
        .where(eq(trace_spans.id, spanId))
        .run();

      broadcastEvent({
        type: 'proxy:error',
        timestamp: endedAt,
        runId,
        spanId,
        data: { error: errorText, statusCode: upstreamRes.status }
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

            // Parse SSE data to aggregate tokens & text
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
        const endedAt = Date.now();

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
            total_tokens: promptTokens + completionTokens
          }
        };

        db.update(trace_spans)
          .set({
            status: 'success',
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            cost: costResult.totalCost,
            response_payload: JSON.stringify(synthesizedResponse),
            latency_ms: Math.max(1, endedAt - startTime),
            ended_at: endedAt
          })
          .where(eq(trace_spans.id, spanId))
          .run();

        const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
        if (runs.length > 0) {
          const run = runs[0];
          db.update(trace_runs)
            .set({
              total_cost: run.total_cost + costResult.totalCost,
              total_prompt_tokens: run.total_prompt_tokens + promptTokens,
              total_completion_tokens: run.total_completion_tokens + completionTokens
            })
            .where(eq(trace_runs.id, runId))
            .run();
        }

        broadcastEvent({
          type: 'span:completed',
          timestamp: endedAt,
          runId,
          spanId,
          data: {
            id: spanId,
            status: 'success',
            cost: costResult.totalCost,
            tokens: { prompt_tokens: promptTokens, completion_tokens: completionTokens }
          }
        });
      });
    }

    // Non-streaming upstream response
    const upstreamJson: any = await upstreamRes.json();
    const endedAt = Date.now();
    const latencyMs = Math.max(1, endedAt - startTime);

    const promptTokens = upstreamJson.usage?.prompt_tokens ?? estimateTokens(JSON.stringify(rawBody.messages || []));
    const completionTokens = upstreamJson.usage?.completion_tokens ?? estimateTokens(upstreamJson.choices?.[0]?.message?.content || '');
    const costResult = calculateCost(reqBody.model, promptTokens, completionTokens);

    db.update(trace_spans)
      .set({
        status: 'success',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost: costResult.totalCost,
        response_payload: JSON.stringify(upstreamJson),
        latency_ms: latencyMs,
        ended_at: endedAt
      })
      .where(eq(trace_spans.id, spanId))
      .run();

    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, runId)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      db.update(trace_runs)
        .set({
          total_cost: run.total_cost + costResult.totalCost,
          total_prompt_tokens: run.total_prompt_tokens + promptTokens,
          total_completion_tokens: run.total_completion_tokens + completionTokens
        })
        .where(eq(trace_runs.id, runId))
        .run();
    }

    broadcastEvent({
      type: 'span:completed',
      timestamp: endedAt,
      runId,
      spanId,
      data: {
        id: spanId,
        status: 'success',
        cost: costResult.totalCost,
        tokens: upstreamJson.usage
      }
    });

    return c.json(upstreamJson, 200, {
      'X-AetherTrace-Cache': 'MISS',
      'X-AetherTrace-Cost': `$${costResult.totalCost.toFixed(6)}`,
      'X-AetherTrace-Latency': `${latencyMs}ms`
    });
  } catch (err: any) {
    const endedAt = Date.now();
    db.update(trace_spans)
      .set({
        status: 'error',
        error_message: err.message,
        latency_ms: Math.max(1, endedAt - startTime),
        ended_at: endedAt
      })
      .where(eq(trace_spans.id, spanId))
      .run();

    broadcastEvent({
      type: 'proxy:error',
      timestamp: endedAt,
      runId,
      spanId,
      data: { error: err.message }
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
