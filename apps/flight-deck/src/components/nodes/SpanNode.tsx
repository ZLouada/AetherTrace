import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Cpu, Zap, AlertOctagon, Clock, DollarSign, ArrowRight } from 'lucide-react';
import type { TraceSpan } from '../../lib/api.js';

export interface SpanNodeData {
  span: TraceSpan;
  isSelected?: boolean;
}

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Planner: { bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-800' },
  Researcher: { bg: 'bg-blue-950/40', text: 'text-blue-300', border: 'border-blue-800' },
  Coder: { bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-800' },
  Reviewer: { bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-800' },
  'Rogue Loop Agent': { bg: 'bg-rose-950/50', text: 'text-rose-300', border: 'border-rose-700' }
};

export const SpanNode = memo(({ data }: { data: SpanNodeData }) => {
  const { span, isSelected } = data;

  const isCacheHit = span.cache_hit === 1;
  const isBreaker = span.span_type === 'guardrail_block';
  const agentTheme = AGENT_COLORS[span.agent_name] || {
    bg: 'bg-gray-800/50',
    text: 'text-gray-200',
    border: 'border-gray-700'
  };

  // Extract a readable snippet from request or response
  let previewText = '';
  try {
    if (span.response_payload) {
      const parsedRes = JSON.parse(span.response_payload);
      if (parsedRes.choices?.[0]?.message?.content) {
        previewText = parsedRes.choices[0].message.content;
      } else if (parsedRes.error?.message) {
        previewText = `Error: ${parsedRes.error.message}`;
      }
    }
    if (!previewText && span.request_payload) {
      const parsedReq = JSON.parse(span.request_payload);
      const lastMsg = parsedReq.messages?.[parsedReq.messages.length - 1];
      previewText = lastMsg?.content || 'LLM Execution';
    }
  } catch {
    previewText = span.model || 'Invocation';
  }

  return (
    <div
      className={`relative w-[320px] rounded-xl border transition-all duration-200 bg-[#111827] shadow-xl overflow-hidden ${
        isBreaker
          ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.35)] animate-pulse'
          : isSelected
          ? 'border-cyan-400 ring-2 ring-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.35)]'
          : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      {/* React Flow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-[#111827] !rounded-full -top-1.5"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-800/80 bg-[#0d1322]/80">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${agentTheme.bg} ${agentTheme.text} ${agentTheme.border}`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[110px]">{span.agent_name}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-gray-400 bg-gray-900 border border-gray-800">
            <Cpu className="w-3 h-3 text-gray-500" />
            <span className="truncate max-w-[100px]">{span.model || 'model'}</span>
          </span>
        </div>
      </div>

      {/* Body Preview & Token Usage */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-xs text-gray-300 font-sans line-clamp-2 leading-relaxed">
          {previewText}
        </p>

        {/* Token Count Pill */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 pt-1 border-t border-gray-800/60">
          <span className="flex items-center gap-1">
            <span className="text-gray-300 font-semibold">{span.prompt_tokens}</span>
            <span className="text-gray-500">in</span>
            <ArrowRight className="w-2.5 h-2.5 text-gray-600 inline" />
            <span className="text-gray-300 font-semibold">{span.completion_tokens}</span>
            <span className="text-gray-500">out</span>
          </span>
          <span className="text-gray-500 text-[10px]">
            {span.prompt_tokens + span.completion_tokens} tokens
          </span>
        </div>
      </div>

      {/* Footer Metrics & High-Visibility Status Badges */}
      <div className="px-3.5 py-2 border-t border-gray-800/80 bg-[#0b0f1a] flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
          <span className="flex items-center gap-1" title="Execution Latency">
            <Clock className="w-3 h-3 text-gray-500" />
            {isCacheHit ? '0ms' : `${span.latency_ms}ms`}
          </span>
          <span className="flex items-center gap-0.5 text-cyan-400 font-semibold" title="Total USD Cost">
            <DollarSign className="w-3 h-3 text-cyan-500" />
            {span.cost_usd > 0 ? span.cost_usd.toFixed(5) : '0.00'}
          </span>
        </div>

        {/* Specialized High-Visibility Badges */}
        {isCacheHit && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
            <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
            0ms Replay
          </span>
        )}

        {isBreaker && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-red-950 text-red-300 border border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]">
            <AlertOctagon className="w-3 h-3 text-red-400 fill-red-400" />
            Breaker Tripped
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-[#111827] !rounded-full -bottom-1.5"
      />
    </div>
  );
});

SpanNode.displayName = 'SpanNode';
