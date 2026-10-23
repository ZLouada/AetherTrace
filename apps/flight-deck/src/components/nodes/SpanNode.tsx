'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Bot,
  Cpu,
  Zap,
  AlertOctagon,
  Clock,
  DollarSign,
  ArrowRight,
  Wrench,
  Globe,
  RotateCcw,
  AlertTriangle,
  User,
  Workflow,
  Pin
} from 'lucide-react';
import type { TraceSpan } from '@/lib/api';
import { Badge, getCategoryStyle } from '@/design-system';

export interface SpanNodeData {
  span: TraceSpan;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isPinned?: boolean;
  isCriticalPath?: boolean;
  isSubdued?: boolean;
}

export const SpanNode = memo(({ data }: { data: SpanNodeData }) => {
  const { span, isSelected, isMultiSelected, isPinned, isCriticalPath, isSubdued } = data;

  const isCacheHit = span.cache_hit === 1;
  const isBreaker = span.span_type === 'guardrail_block';
  const isIntercepted = Boolean(
    span.response_payload?.includes('"status":"intercepted"') ||
    span.response_payload?.includes('"status": "intercepted"') ||
    span.response_payload?.includes('"awaiting_human": true') ||
    span.response_payload?.includes('"awaiting_human":true')
  );
  const isChaos = Boolean(
    span.response_payload?.includes('chaos_injected') ||
    span.response_payload?.includes('Chaos Engine') ||
    span.response_payload?.includes('CHAOS')
  );

  // Semantic category and icons
  let CategoryIcon = Bot;
  let categoryKey: 'LLM' | 'TOOL' | 'HTTP' | 'RETRY' | 'ERROR' | 'USER' | 'AGENT' = 'LLM';
  let typeLabel = span.model || 'model';

  if (span.span_type === 'tool_call') {
    CategoryIcon = Wrench;
    categoryKey = 'TOOL';
    typeLabel = 'TOOL';
  } else if (span.span_type === 'http_call') {
    CategoryIcon = Globe;
    categoryKey = 'HTTP';
    typeLabel = 'HTTP';
  } else if (span.span_type === 'retry') {
    CategoryIcon = RotateCcw;
    categoryKey = 'RETRY';
    typeLabel = 'RETRY';
  } else if (span.span_type === 'guardrail_block') {
    CategoryIcon = AlertTriangle;
    categoryKey = 'ERROR';
    typeLabel = 'ERROR';
  } else if (span.span_type === 'user_input') {
    CategoryIcon = User;
    categoryKey = 'USER';
    typeLabel = 'USER';
  } else if (span.span_type === 'agent_state' || (span.span_type as string) === 'agent_dispatch') {
    CategoryIcon = Workflow;
    categoryKey = 'AGENT';
    typeLabel = 'AGENT';
  }

  const categoryStyle = getCategoryStyle(categoryKey);

  // Extract a readable snippet from request or response
  let previewText = '';
  try {
    if (span.span_type === 'tool_call' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      if (p.tool_name) {
        previewText = `Tool: ${p.tool_name}(${p.arguments ? (typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments)) : ''})`;
      }
    } else if (span.span_type === 'http_call' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      if (p.method && p.url) {
        previewText = `${p.method} ${p.url}`;
      }
    } else if (span.span_type === 'retry' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      previewText = `Retry attempt #${p.attempt || 1}: ${p.reason || 'retry'}`;
    }

    if (!previewText && span.response_payload) {
      const parsedRes = JSON.parse(span.response_payload);
      if (parsedRes.status === 'intercepted') {
        previewText = '⏸️ Intercepted by Breakpoint — awaiting human operator action';
      } else if (parsedRes.choices?.[0]?.message?.content) {
        previewText = parsedRes.choices[0].message.content;
      } else if (parsedRes.error?.message) {
        previewText = `Error: ${parsedRes.error.message}`;
      } else if (parsedRes.result !== undefined) {
        previewText = `Result: ${typeof parsedRes.result === 'string' ? parsedRes.result : JSON.stringify(parsedRes.result)}`;
      }
    }
    if (!previewText && span.request_payload) {
      const parsedReq = JSON.parse(span.request_payload);
      const lastMsg = parsedReq.messages?.[parsedReq.messages.length - 1];
      previewText = lastMsg?.content || `${span.span_type} invocation`;
    }
  } catch {
    previewText = span.model || span.span_type || 'Invocation';
  }

  return (
    <div
      className={`relative w-[320px] rounded border transition-all duration-150 bg-[#111114] shadow-md overflow-hidden font-mono ${
        isSubdued ? 'opacity-30' : 'opacity-100'
      } ${
        isIntercepted
          ? 'border-amber-400 ring-1 ring-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
          : isBreaker
          ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
          : isSelected
          ? 'border-zinc-200 ring-1 ring-zinc-400/50 bg-[#17171b] shadow-lg'
          : isMultiSelected
          ? 'border-indigo-400 ring-2 ring-indigo-500/50 bg-[#16161f] shadow-md'
          : isCriticalPath
          ? 'border-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.15)] bg-[#141310]'
          : 'border-[#2c2c32] hover:border-[#3f3f48]'
      }`}
    >
      {/* React Flow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -top-1"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#202024] bg-[#18181c]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge
            variant="category"
            category={categoryKey}
            size="xs"
            icon={<CategoryIcon className="w-3 h-3 shrink-0" />}
          >
            {span.agent_name}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] text-zinc-300 bg-[#111114] border border-[#2c2c32]">
            <Cpu className="w-3 h-3 text-zinc-500" />
            <span className="truncate max-w-[100px]">{typeLabel}</span>
          </span>
        </div>
      </div>

      {/* Body Preview & Token Usage */}
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-zinc-300 font-sans line-clamp-2 leading-relaxed">
          {previewText}
        </p>

        {/* Token Count Pill */}
        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#202024]">
          <span className="flex items-center gap-1">
            <span className="text-zinc-200 font-semibold">{span.prompt_tokens}</span>
            <span className="text-zinc-500">in</span>
            <ArrowRight className="w-2.5 h-2.5 text-zinc-600 inline" />
            <span className="text-zinc-200 font-semibold">{span.completion_tokens}</span>
            <span className="text-zinc-500">out</span>
          </span>
          <span className="text-zinc-500 text-[10px]" title={span.usage_status === 'estimated' ? 'Estimated usage based on character heuristic' : 'Exact usage reported by provider'}>
            {span.usage_status === 'estimated' ? `~${span.prompt_tokens + span.completion_tokens} tok (est)` : `${span.prompt_tokens + span.completion_tokens} tok`}
          </span>
        </div>
      </div>

      {/* Footer Metrics & Lineage Badges */}
      <div className="px-3 py-1.5 border-t border-[#202024] bg-[#141418] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5 text-zinc-400 text-[10px]">
          <span className="flex items-center gap-1" title="Execution Latency">
            <Clock className="w-3 h-3 text-zinc-500" />
            {isCacheHit ? '0ms' : `${span.latency_ms}ms`}
          </span>
          <span className="flex items-center gap-0.5 text-white font-semibold" title="Total USD Cost">
            <DollarSign className="w-3 h-3 text-zinc-400" />
            {span.cost_usd > 0 ? span.cost_usd.toFixed(5) : '0.00'}
          </span>
        </div>

        {/* Specialized High-Visibility Badges */}
        <div className="flex items-center gap-1">
          {isPinned && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] text-amber-300 bg-amber-950/70 border border-amber-500/60 font-mono shadow-xs"
              title="Pinned Span (P)"
            >
              <Pin className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              Pin
            </span>
          )}

          {isIntercepted && (
            <Badge variant="origin" origin="modified" size="xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block mr-1" />
              Held
            </Badge>
          )}

          {isChaos && (
            <Badge variant="category" category="ERROR" size="xs">
              Chaos
            </Badge>
          )}

          {span.execution_origin === 'modified' && !isIntercepted && (
            <Badge variant="origin" origin="modified" size="xs">
              Modified
            </Badge>
          )}

          {span.execution_origin === 'mocked' && !isIntercepted && (
            <Badge variant="origin" origin="mocked" size="xs">
              Mocked
            </Badge>
          )}

          {span.execution_origin === 'new_execution' && !isIntercepted && (
            <Badge variant="origin" origin="new_execution" size="xs">
              New Exec
            </Badge>
          )}

          {isCacheHit && !isIntercepted && span.execution_origin !== 'modified' && (
            <Badge variant="origin" origin="cached_replay" size="xs">
              <Zap className="w-2.5 h-2.5 text-sky-400 fill-sky-400 mr-0.5" />
              0ms
            </Badge>
          )}

          {isBreaker && !isIntercepted && !isChaos && (
            <Badge variant="category" category="ERROR" size="xs">
              <AlertOctagon className="w-2.5 h-2.5 text-rose-400 mr-0.5" />
              Breaker
            </Badge>
          )}

          {isCriticalPath && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] text-amber-300 bg-amber-950/60 border border-amber-500/50">
              ⚡ Critical
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -bottom-1"
      />
    </div>
  );
});

SpanNode.displayName = 'SpanNode';
