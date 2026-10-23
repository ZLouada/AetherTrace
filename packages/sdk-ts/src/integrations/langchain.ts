/**
 * AetherTrace CallbackHandler for LangChain and LangGraph
 * Zero-dependency duck-typed callback handler for Node.js and TypeScript agent runtimes.
 */

import { emitSpan, getTraceContext, getDefaultProxyUrl } from '../index.js';
import { registerOperation, unregisterOperation } from '../deduplication.js';

export interface LangChainCallbackOptions {
  proxyBaseUrl?: string;
  agentName?: string;
  runId?: string;
}

interface ActiveCallRecord {
  spanId: string;
  spanType: string;
  name: string;
  startTime: number;
  requestPayload: any;
  parentSpanId?: string | null;
  agentName: string;
}

export class AetherTraceCallbackHandler {
  public name = 'AetherTraceCallbackHandler';
  private proxyBaseUrl: string;
  private defaultAgentName?: string;
  private runIdOverride?: string;
  private activeCalls = new Map<string, ActiveCallRecord>();

  constructor(options: LangChainCallbackOptions = {}) {
    this.proxyBaseUrl = options.proxyBaseUrl || getDefaultProxyUrl();
    this.defaultAgentName = options.agentName;
    this.runIdOverride = options.runId;
  }

  // --- LLM Callbacks ---

  public async handleLLMStart(
    llm: { name?: string },
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, any>
  ): Promise<void> {
    const ctx = getTraceContext();
    const spanId = `span_lc_llm_${runId}`;
    registerOperation(spanId, 'langchain');

    this.activeCalls.set(runId, {
      spanId,
      spanType: 'llm_call',
      name: llm?.name || 'LLM',
      startTime: Date.now(),
      requestPayload: {
        prompts,
        model: extraParams?.invocation_params?.model || extraParams?.invocation_params?.model_name || llm?.name,
        params: extraParams
      },
      parentSpanId: parentRunId ? `span_lc_chain_${parentRunId}` : ctx?.parentSpanId || null,
      agentName: this.defaultAgentName || ctx?.agentName || 'LangChainAgent'
    });
  }

  public async handleLLMEnd(
    output: { generations?: any[][]; llmOutput?: any },
    runId: string
  ): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    const tokenUsage = output?.llmOutput?.tokenUsage || output?.llmOutput?.estimatedTokenUsage;
    const model = output?.llmOutput?.model_name || record.requestPayload?.model || 'gpt-4o';

    const promptTokens = tokenUsage?.promptTokens || tokenUsage?.input_tokens || 0;
    const completionTokens = tokenUsage?.completionTokens || tokenUsage?.output_tokens || 0;

    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'llm_call',
        agentName: record.agentName,
        model,
        requestPayload: record.requestPayload,
        responsePayload: {
          generations: output?.generations,
          llmOutput: output?.llmOutput,
          duration_ms: duration
        },
        promptTokens,
        completionTokens,
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }

  public async handleLLMError(err: any, runId: string): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'llm_call',
        agentName: record.agentName,
        model: record.requestPayload?.model || null,
        requestPayload: record.requestPayload,
        responsePayload: {
          status: 'error',
          error: {
            message: err?.message || String(err),
            name: err?.name || 'LLMError'
          },
          duration_ms: duration
        },
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }

  // --- Tool Callbacks ---

  public async handleToolStart(
    tool: { name?: string },
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const ctx = getTraceContext();
    const spanId = `span_lc_tool_${runId}`;
    registerOperation(spanId, 'langchain');

    this.activeCalls.set(runId, {
      spanId,
      spanType: 'tool_call',
      name: tool?.name || 'tool',
      startTime: Date.now(),
      requestPayload: {
        tool_name: tool?.name,
        input
      },
      parentSpanId: parentRunId ? `span_lc_chain_${parentRunId}` : ctx?.parentSpanId || null,
      agentName: this.defaultAgentName || ctx?.agentName || 'LangChainAgent'
    });
  }

  public async handleToolEnd(output: any, runId: string): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'tool_call',
        agentName: record.agentName,
        requestPayload: record.requestPayload,
        responsePayload: {
          status: 'success',
          result: output,
          duration_ms: duration
        },
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }

  public async handleToolError(err: any, runId: string): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'tool_call',
        agentName: record.agentName,
        requestPayload: record.requestPayload,
        responsePayload: {
          status: 'error',
          error: {
            message: err?.message || String(err),
            name: err?.name || 'ToolError'
          },
          duration_ms: duration
        },
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }

  // --- Chain / Agent Callbacks ---

  public async handleChainStart(
    chain: { name?: string },
    inputs: Record<string, any>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const ctx = getTraceContext();
    const spanId = `span_lc_chain_${runId}`;
    registerOperation(spanId, 'langchain');

    this.activeCalls.set(runId, {
      spanId,
      spanType: 'agent_state',
      name: chain?.name || 'chain',
      startTime: Date.now(),
      requestPayload: { inputs, chain_name: chain?.name },
      parentSpanId: parentRunId ? `span_lc_chain_${parentRunId}` : ctx?.parentSpanId || null,
      agentName: chain?.name || this.defaultAgentName || ctx?.agentName || 'LangChainChain'
    });
  }

  public async handleChainEnd(outputs: Record<string, any>, runId: string): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'agent_state',
        agentName: record.agentName,
        requestPayload: record.requestPayload,
        responsePayload: {
          status: 'completed',
          outputs,
          duration_ms: duration
        },
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }

  public async handleChainError(err: any, runId: string): Promise<void> {
    const record = this.activeCalls.get(runId);
    if (!record) return;
    this.activeCalls.delete(runId);
    unregisterOperation(record.spanId);

    const duration = Date.now() - record.startTime;
    await emitSpan(
      {
        runId: this.runIdOverride,
        parentSpanId: record.parentSpanId,
        spanType: 'agent_state',
        agentName: record.agentName,
        requestPayload: record.requestPayload,
        responsePayload: {
          status: 'error',
          error: {
            message: err?.message || String(err),
            name: err?.name || 'ChainError'
          },
          duration_ms: duration
        },
        latencyMs: duration
      },
      this.proxyBaseUrl
    );
  }
}
