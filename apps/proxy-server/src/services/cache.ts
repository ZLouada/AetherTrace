import { eq, and, isNotNull, desc } from 'drizzle-orm';
import { getDatabase, trace_spans, type TraceSpan } from '@aethertrace/core-schema';

/**
 * Looks up the latest successful span with matching deterministic request_hash.
 */
export function lookupReplayCache(requestHash: string): TraceSpan | null {
  if (!requestHash) return null;

  const { db } = getDatabase();

  const spans = db
    .select()
    .from(trace_spans)
    .where(
      and(
        eq(trace_spans.request_hash, requestHash),
        isNotNull(trace_spans.response_payload)
      )
    )
    .orderBy(desc(trace_spans.created_at))
    .limit(1)
    .all();

  return spans.length > 0 ? spans[0] : null;
}

/**
 * Builds OpenAI-compatible SSE chunks from a cached response payload for streaming replay.
 */
export function* createReplayStreamChunks(
  cachedResponse: any,
  model: string = 'gpt-4o'
): Generator<string, void, unknown> {
  const id = `chatcmpl-replay-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  // Extract content or tool calls from cached response
  let content = '';
  let toolCalls: any[] | undefined = undefined;

  if (cachedResponse && typeof cachedResponse === 'object') {
    if (cachedResponse.choices && cachedResponse.choices[0]) {
      const msg = cachedResponse.choices[0].message || cachedResponse.choices[0].delta;
      if (msg) {
        content = typeof msg.content === 'string' ? msg.content : '';
        toolCalls = msg.tool_calls;
      }
    } else if (typeof cachedResponse.content === 'string') {
      content = cachedResponse.content;
    }
  }

  // Initial role chunk
  const roleChunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null
      }
    ]
  };
  yield `data: ${JSON.stringify(roleChunk)}\n\n`;

  // Content chunk (replay simulated in manageable segments or single burst)
  if (content) {
    // Break into words/tokens for a realistic SSE replay stream
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      const piece = (i === 0 ? '' : ' ') + words[i];
      const chunk = {
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { content: piece },
            finish_reason: null
          }
        ]
      };
      yield `data: ${JSON.stringify(chunk)}\n\n`;
    }
  }

  // Tool calls chunk if present
  if (toolCalls && Array.isArray(toolCalls)) {
    const toolChunk = {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { tool_calls: toolCalls },
          finish_reason: null
        }
      ]
    };
    yield `data: ${JSON.stringify(toolChunk)}\n\n`;
  }

  // Final completion chunk
  const finalChunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: toolCalls ? 'tool_calls' : 'stop'
      }
    ],
    usage: cachedResponse?.usage ?? undefined
  };
  yield `data: ${JSON.stringify(finalChunk)}\n\n`;
  yield 'data: [DONE]\n\n';
}
