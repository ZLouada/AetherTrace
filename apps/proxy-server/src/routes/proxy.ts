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
import { shouldIntercept, holdRequest } from '../services/breakpoints.js';
import { evaluateChaos, broadcastChaosInjected } from '../services/chaos.js';
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

function commitSpanAndRun(
  db: any,
  span: TraceSpan,
  isUpdate: boolean,
  totalTokens: number,
  costUsd: number
) {
  if (isUpdate) {
    db.update(trace_spans)
      .set({
        span_type: span.span_type,
        model: span.model,
        request_payload: span.request_payload,
        response_payload: span.response_payload,
        prompt_tokens: span.prompt_tokens,
        completion_tokens: span.completion_tokens,
        cost_usd: span.cost_usd,
        latency_ms: span.latency_ms,
        cache_hit: span.cache_hit,
        request_hash: span.request_hash
      })
      .where(eq(trace_spans.id, span.id))
      .run();

    broadcastEvent({
      type: 'SPAN_UPDATED',
      data: span,
      runId: span.run_id,
      spanId: span.id
    });
  } else {
    db.insert(trace_spans).values(span).run();

    broadcastEvent({
      type: 'SPAN_CREATED',
      data: span,
      runId: span.run_id,
      spanId: span.id
    });
  }

  if (totalTokens > 0 || costUsd > 0) {
    const runs = db.select().from(trace_runs).where(eq(trace_runs.id, span.run_id)).limit(1).all();
    if (runs.length > 0) {
      const run = runs[0];
      db.update(trace_runs)
        .set({
          total_tokens: run.total_tokens + totalTokens,
          total_cost_usd: run.total_cost_usd + costUsd
        })
        .where(eq(trace_runs.id, span.run_id))
        .run();
    }
  }
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

  let reqBody = parseResult.data;
  const isStreaming = Boolean(reqBody.stream);
  let requestHash = computeRequestHash(reqBody);

  // Extract headers
  const runId = c.req.header('x-run-id') || `run_${randomUUID()}`;
  const parentSpanId = c.req.header('x-parent-span-id') || null;
  const agentName = c.req.header('x-agent-name') || 'default-agent';
  const maxBudgetHeader = c.req.header('x-max-budget-usd');
  const maxBudgetUsd = maxBudgetHeader ? Number.parseFloat(maxBudgetHeader) : undefined;
  const isReplayMode = c.req.header('x-replay-mode') === 'true' || c.req.header('x-replay-cache') === 'true';
  const isMockUpstream = c.req.header('x-mock-upstream') === 'true' || c.req.header('x-mock-response') === 'true' || process.env.AETHERTRACE_MOCK === 'true';

  // Phase 4: Breakpoint & Chaos Headers
  const hasBreakpointHeader = c.req.header('x-breakpoint') === 'true' || c.req.header('x-breakpoint') === '1';
  const chaosHeader = c.req.header('x-chaos-inject');

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

  // 2. Chaos Pre-Request Evaluation (chaos.ts)
  let shouldCorruptJson = false;
  const chaosEval = evaluateChaos(chaosHeader);
  if (chaosEval.fault === 'rate_limit') {
    const chaosSpanId = `span_${randomUUID()}`;
    const now = Date.now();
    const errSpan: TraceSpan = {
      id: chaosSpanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'guardrail_block',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify({
        error: 'Chaos Engine: Injected Rate Limit Error (HTTP 429)',
        chaos_injected: 'rate_limit',
        details: chaosEval.details
      }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: Math.max(1, now - startTime),
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    db.insert(trace_spans).values(errSpan).run();
    broadcastChaosInjected(chaosSpanId, runId, 'rate_limit', chaosEval.details);
    broadcastEvent({
      type: 'SPAN_CREATED',
      data: errSpan,
      runId,
      spanId: chaosSpanId
    });

    return c.json({
      error: {
        message: 'Chaos Engine: Injected Rate Limit Error (HTTP 429)',
        type: 'chaos_rate_limit',
        details: chaosEval.details
      }
    }, 429);
  }

  if (chaosEval.fault === 'upstream_500') {
    const chaosSpanId = `span_${randomUUID()}`;
    const now = Date.now();
    const errSpan: TraceSpan = {
      id: chaosSpanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'guardrail_block',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify({
        error: 'Chaos Engine: Injected Upstream Failure (HTTP 502)',
        chaos_injected: 'upstream_500',
        details: chaosEval.details
      }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: Math.max(1, now - startTime),
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    db.insert(trace_spans).values(errSpan).run();
    broadcastChaosInjected(chaosSpanId, runId, 'upstream_500', chaosEval.details);
    broadcastEvent({
      type: 'SPAN_CREATED',
      data: errSpan,
      runId,
      spanId: chaosSpanId
    });

    return c.json({
      error: {
        message: 'Chaos Engine: Injected Upstream Failure (HTTP 502)',
        type: 'chaos_upstream_failure',
        details: chaosEval.details
      }
    }, 502);
  }

  if (chaosEval.fault === 'latency' && chaosEval.latencyMs) {
    await sleep(chaosEval.latencyMs);
    broadcastChaosInjected(runId, runId, 'latency', chaosEval.details);
  }

  if (chaosEval.fault === 'corrupt_json') {
    shouldCorruptJson = true;
  }

  // 3. Circuit Breaker Check (breaker.ts)
  const breakerResult = await checkCircuitBreakers({
    runId,
    requestHash,
    maxBudgetUsd,
    loopThreshold: 3
  });

  if (!breakerResult.allowed) {
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

  // 4. Live Mid-Flight Breakpoint Interception Check (breakpoints.ts)
  let spanId = `span_${randomUUID()}`;
  let isResumedFromBreakpoint = false;

  if (shouldIntercept(agentName, reqBody.model, hasBreakpointHeader)) {
    const heldSpan: TraceSpan = {
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'llm_call',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: JSON.stringify({ status: 'intercepted', awaiting_human: true }),
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0.0,
      latency_ms: 0,
      cache_hit: 0,
      request_hash: requestHash,
      created_at: Date.now()
    };

    db.insert(trace_spans).values(heldSpan).run();
    db.update(trace_runs).set({ status: 'paused' }).where(eq(trace_runs.id, runId)).run();

    broadcastEvent({
      type: 'SPAN_CREATED',
      data: heldSpan,
      runId,
      spanId
    });

    broadcastEvent({
      type: 'RUN_UPDATED',
      data: { id: runId, status: 'paused' },
      runId
    });

    const resolution = await holdRequest(spanId, {
      runId,
      agentName,
      model: reqBody.model,
      originalPayload: rawBody
    });

    if (resolution.action === 'abort') {
      const abortText = JSON.stringify({ error: resolution.reason || 'Breakpoint Rejected by Operator' });
      db.update(trace_spans)
        .set({
          span_type: 'guardrail_block',
          response_payload: abortText,
          latency_ms: Math.max(1, Date.now() - startTime)
        })
        .where(eq(trace_spans.id, spanId))
        .run();

      db.update(trace_runs).set({ status: 'failed' }).where(eq(trace_runs.id, runId)).run();

      broadcastEvent({
        type: 'SPAN_UPDATED',
        data: { id: spanId, span_type: 'guardrail_block', response_payload: abortText },
        runId,
        spanId
      });

      return c.json({
        error: {
          message: resolution.reason || 'Breakpoint Rejected by Operator',
          type: 'breakpoint_rejected'
        }
      }, 403);
    }

    if (resolution.action === 'mock') {
      const mockedContent = resolution.mockedResponse || '[AetherTrace Operator Mock Response]';
      const mockCompletion = {
        id: `chatcmpl-${spanId}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: reqBody.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: mockedContent },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };

      const now = Date.now();
      db.update(trace_spans)
        .set({
          response_payload: JSON.stringify(mockCompletion),
          cost_usd: 0.0,
          latency_ms: Math.max(1, now - startTime)
        })
        .where(eq(trace_spans.id, spanId))
        .run();

      db.update(trace_runs).set({ status: 'completed' }).where(eq(trace_runs.id, runId)).run();

      broadcastEvent({
        type: 'SPAN_UPDATED',
        data: {
          id: spanId,
          response_payload: JSON.stringify(mockCompletion),
          cost_usd: 0.0,
          latency_ms: Math.max(1, now - startTime)
        },
        runId,
        spanId
      });

      broadcastEvent({
        type: 'RUN_UPDATED',
        data: { id: runId, status: 'completed' },
        runId
      });

      return c.json(mockCompletion, 200, {
        'X-AetherTrace-Breakpoint': 'MOCKED',
        'X-AetherTrace-Cost': '$0.000000',
        'X-AetherTrace-Latency': `${Math.max(1, now - startTime)}ms`
      });
    }

    if (resolution.action === 'resume') {
      isResumedFromBreakpoint = true;
      db.update(trace_runs).set({ status: 'running' }).where(eq(trace_runs.id, runId)).run();
      broadcastEvent({
        type: 'RUN_UPDATED',
        data: { id: runId, status: 'running' },
        runId
      });

      if (resolution.modifiedPayload) {
        rawBody = resolution.modifiedPayload;
        const reparse = ChatCompletionRequestSchema.safeParse(rawBody);
        if (reparse.success) {
          reqBody = reparse.data;
        }
        requestHash = computeRequestHash(reqBody);

        db.update(trace_spans)
          .set({
            request_payload: JSON.stringify(rawBody),
            model: reqBody.model,
            request_hash: requestHash
          })
          .where(eq(trace_spans.id, spanId))
          .run();
      }
    }
  }

  // 5. Time-Travel Replay Cache Lookup (X-Replay-Mode: true)
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
        const replaySpanId = isResumedFromBreakpoint ? spanId : `span_${randomUUID()}`;
        const now = Date.now();

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

        commitSpanAndRun(db, replaySpan, isResumedFromBreakpoint, 0, 0);

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

  // 6. Upstream Execution (Mock or Real Upstream)
  const openaiBaseUrl = c.req.header('x-target-base-url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // Check if we should inject corrupted JSON response
  if (shouldCorruptJson) {
    const corruptSnippet = `{"id":"chatcmpl-${spanId}","object":"chat.completion","choices":[{"index":0,"message":{"content":"[CHAOS_CORRUPT_MALFORMED_JSON]: {"unclosed_syntax": true, "tokens": `;
    const now = Date.now();
    const span: TraceSpan = {
      id: spanId,
      run_id: runId,
      parent_span_id: parentSpanId,
      span_type: 'guardrail_block',
      agent_name: agentName,
      model: reqBody.model,
      request_payload: JSON.stringify(rawBody),
      response_payload: corruptSnippet,
      prompt_tokens: 15,
      completion_tokens: 15,
      cost_usd: 0.0,
      latency_ms: Math.max(1, now - startTime),
      cache_hit: 0,
      request_hash: requestHash,
      created_at: now
    };

    commitSpanAndRun(db, span, isResumedFromBreakpoint, 30, 0.0);
    broadcastChaosInjected(spanId, runId, 'corrupt_json', 'Chaos Engine injected malformed JSON syntax');

    return c.text(corruptSnippet, 200, {
      'Content-Type': 'application/json',
      'X-AetherTrace-Chaos': 'corrupt_json'
    });
  }

  // Handle Mock Upstream with 150ms delay
  if (isMockUpstream || !process.env.OPENAI_API_KEY && !c.req.header('authorization') && !c.req.header('x-target-base-url')) {
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

        commitSpanAndRun(db, span, isResumedFromBreakpoint, totalTokens, costResult.totalCost);
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

    commitSpanAndRun(db, span, isResumedFromBreakpoint, totalTokens, costResult.totalCost);

    return c.json(mockResponse, 200, {
      'X-AetherTrace-Cache': 'MISS',
      'X-AetherTrace-Cost': `$${costResult.totalCost.toFixed(6)}`,
      'X-AetherTrace-Latency': `${latencyMs}ms`
    });
  }

  // 7. Forward to real upstream OPENAI_BASE_URL
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

      commitSpanAndRun(db, errSpan, isResumedFromBreakpoint, 0, 0);
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

        commitSpanAndRun(db, span, isResumedFromBreakpoint, totalTokens, costResult.totalCost);
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

    commitSpanAndRun(db, span, isResumedFromBreakpoint, totalTokens, costResult.totalCost);

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

    commitSpanAndRun(db, errSpan, isResumedFromBreakpoint, 0, 0);

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
