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
  isHovered?: boolean;
  isIntercepted?: boolean;
  density?: 'compact' | 'detailed';
}

export const SpanNode = memo(({ data }: { data: SpanNodeData }) => {
  const {
    span,
    isSelected,
    isMultiSelected,
    isPinned,
    isCriticalPath,
    isSubdued,
    isHovered,
    isIntercepted: dataIsIntercepted,
    density = 'detailed'
  } = data;

  const isCacheHit = span.cache_hit === 1;
  const isBreaker = span.span_type === 'guardrail_block';
  const isIntercepted = Boolean(
    dataIsIntercepted ||
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

  const isError =
    isBreaker ||
    Boolean(
      span.response_payload?.includes('"status":"error"') ||
      span.response_payload?.includes('"is_error":true') ||
      span.response_payload?.includes('"error"')
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

  // Determine display mode: if density is compact and NOT selected, render compact node
  const isCompact = density === 'compact' && !isSelected;

  // Extract preview snippet
  let previewText = '';
  try {
    if (span.span_type === 'tool_call' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      if (p.tool_name) {
        previewText = `${p.tool_name}(${p.arguments ? (typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments)) : ''})`;
      }
    } else if (span.span_type === 'http_call' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      if (p.method && p.url) {
        previewText = `${p.method} ${p.url}`;
      }
    } else if (span.span_type === 'retry' && span.request_payload) {
      const p = JSON.parse(span.request_payload);
      previewText = `Retry #${p.attempt || 1}: ${p.reason || 'retry'}`;
    }

    if (!previewText && span.response_payload) {
      const parsedRes = JSON.parse(span.response_payload);
      if (parsedRes.status === 'intercepted') {
        previewText = '⏸️ Intercepted by Breakpoint';
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

  // Status dot color
  let statusDotColor = 'bg-emerald-400';
  if (isIntercepted) {
    statusDotColor = 'bg-amber-400 animate-ping';
  } else if (isError) {
    statusDotColor = 'bg-rose-500';
  } else if (categoryKey === 'RETRY') {
    statusDotColor = 'bg-amber-400';
  } else if (isCacheHit) {
    statusDotColor = 'bg-sky-400';
  }

  // Active ring & border classes based on design tokens
  const containerClasses = [
    'relative transition-all duration-150 select-none overflow-hidden rounded font-sans',
    isSubdued ? 'opacity-30' : 'opacity-100',
    isSelected
      ? isIntercepted
        ? 'border-[#ea580c] ring-2 ring-[#ea580c] ring-offset-1 ring-offset-amber-500/70 bg-[#18181c] shadow-[0_0_18px_rgba(234,88,12,0.3)] z-20'
        : 'border-[#ea580c] ring-2 ring-[#ea580c] bg-[#18181c] shadow-[0_0_18px_rgba(234,88,12,0.25)] z-20'
      : isMultiSelected
      ? isIntercepted
        ? 'border-indigo-400 ring-2 ring-indigo-500/60 ring-offset-1 ring-offset-amber-500/70 bg-[#16161f] shadow-md z-10'
        : 'border-indigo-400 ring-2 ring-indigo-500/50 bg-[#16161f] shadow-md z-10'
      : isHovered
      ? 'border-[#ea580c] ring-1 ring-[#ea580c]/60 bg-[#16161a] z-10'
      : isIntercepted
      ? 'border-amber-400 ring-1 ring-amber-500/70 bg-[#17140e] shadow-[0_0_14px_rgba(245,158,11,0.3)]'
      : isError
      ? 'border-rose-500/80 bg-[#161012] shadow-[0_0_12px_rgba(239,68,68,0.2)]'
      : isCriticalPath
      ? 'border-amber-500/80 bg-[#141310] shadow-[0_0_10px_rgba(245,158,11,0.15)]'
      : 'border-[#27272a] hover:border-zinc-500 bg-[#111114]'
  ].join(' ');

  // -------------------------------------------------------------
  // DUAL DENSITY: COMPACT MODE (~220px x 48px)
  // -------------------------------------------------------------
  if (isCompact) {
    return (
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-label={`Span ${span.agent_name}: ${span.model || span.span_type}, ${isError ? 'error' : isIntercepted ? 'paused' : 'ok'}, ${span.latency_ms}ms`}
        tabIndex={0}
        className={`${containerClasses} w-[220px] h-[48px] px-2.5 py-1.5 flex items-center justify-between border`}
        title={`${span.agent_name} | ${span.model || span.span_type} (${span.latency_ms}ms, $${span.cost_usd.toFixed(5)})`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -top-1"
        />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Status Dot */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor}`} />

          {/* Category Icon */}
          <CategoryIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />

          {/* Agent & Type / Model */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-zinc-100 truncate">
                {span.agent_name}
              </span>
              {isPinned && (
                <Pin className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
              )}
              {isIntercepted && (
                <span className="px-1 py-0.5 rounded bg-amber-500 text-black text-[8px] font-mono font-bold shrink-0">
                  PAUSED
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono truncate">
              {span.model || span.span_type}
            </div>
          </div>
        </div>

        {/* Latency & Cost Pill */}
        <div className="text-right shrink-0 pl-1">
          <div className="text-[10px] font-mono text-zinc-300 font-medium">
            {isCacheHit ? '0ms' : `${span.latency_ms}ms`}
          </div>
          {span.cost_usd > 0 && (
            <div className="text-[9px] font-mono text-zinc-400">
              ${span.cost_usd.toFixed(4)}
            </div>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -bottom-1"
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // DUAL DENSITY: DETAILED MODE (~320px x auto)
  // -------------------------------------------------------------
  const hasTokens = span.prompt_tokens > 0 || span.completion_tokens > 0;

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-label={`Span ${span.agent_name}: ${span.model || span.span_type}, ${isError ? 'error' : isIntercepted ? 'paused' : 'ok'}, ${span.latency_ms}ms, cost $${span.cost_usd.toFixed(4)}`}
      tabIndex={0}
      className={`${containerClasses} w-[320px] border shadow-lg`}
    >
      {/* React Flow Target Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -top-1"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#202024] bg-[#16161a]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor}`} />
          <Badge
            variant="category"
            category={categoryKey}
            size="xs"
            icon={<CategoryIcon className="w-3 h-3 shrink-0" />}
          >
            {span.agent_name}
          </Badge>
          {isPinned && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] text-amber-300 bg-amber-950/70 border border-amber-500/60 font-mono"
              title="Pinned Span (P)"
            >
              <Pin className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
            </span>
          )}
          {isIntercepted && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-amber-200 bg-amber-950/80 border border-amber-500/70 font-mono font-bold"
              title="Execution Paused / Breakpoint Held"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block mr-0.5" />
              PAUSED
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 bg-[#111114] border border-[#27272a] font-mono">
            <Cpu className="w-2.5 h-2.5 text-zinc-400" />
            <span className="truncate max-w-[100px]">{typeLabel}</span>
          </span>
        </div>
      </div>

      {/* Body: Snippet Preview */}
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-zinc-300 font-sans line-clamp-2 leading-relaxed">
          {previewText}
        </p>

        {/* Token Count Pill (Only show if tokens exist to avoid fake zeroes) */}
        {hasTokens && (
          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#202024] font-mono">
            <span className="flex items-center gap-1">
              <span className="text-zinc-200 font-semibold">{span.prompt_tokens}</span>
              <span className="text-zinc-400">in</span>
              <ArrowRight className="w-2.5 h-2.5 text-zinc-400 inline" />
              <span className="text-zinc-200 font-semibold">{span.completion_tokens}</span>
              <span className="text-zinc-400">out</span>
            </span>
            <span
              className="text-zinc-400 text-[10px]"
              title={
                span.usage_status === 'estimated'
                  ? 'Estimated usage based on character heuristic'
                  : 'Exact usage reported by provider'
              }
            >
              {span.usage_status === 'estimated'
                ? `~${span.prompt_tokens + span.completion_tokens} tok (est)`
                : `${span.prompt_tokens + span.completion_tokens} tok`}
            </span>
          </div>
        )}
      </div>

      {/* Footer Metrics & Specialized Lineage Badges */}
      <div className="px-3 py-1.5 border-t border-[#202024] bg-[#121215] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2.5 text-zinc-400 text-[10px]">
          <span className="flex items-center gap-1" title="Execution Latency">
            <Clock className="w-3 h-3 text-zinc-400" />
            {isCacheHit ? '0ms' : `${span.latency_ms}ms`}
          </span>
          <span className="flex items-center gap-0.5 text-zinc-200 font-semibold" title="Total USD Cost">
            <DollarSign className="w-2.5 h-2.5 text-zinc-400" />
            {span.cost_usd > 0 ? span.cost_usd.toFixed(5) : '0.00'}
          </span>
        </div>

        {/* High-Visibility Badges */}
        <div className="flex items-center gap-1">
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
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-amber-300 bg-amber-950/60 border border-amber-500/50">
              ⚡ Critical
            </span>
          )}
        </div>
      </div>

      {/* React Flow Source Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -bottom-1"
      />
    </div>
  );
});

SpanNode.displayName = 'SpanNode';
