'use client';

import React, { useMemo } from 'react';
import {
  Clock,
  ChevronUp,
  ChevronDown,
  Wrench,
  Globe,
  RotateCcw,
  AlertTriangle,
  User,
  Bot,
  Zap,
  Workflow
} from 'lucide-react';
import type { TraceSpan, TraceRun } from '@/lib/api';
import { Badge, Divider } from '@/design-system';

interface TimelineProps {
  spans: TraceSpan[];
  selectedSpanId: string | null;
  onSelectSpan: (span: TraceSpan) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedRun: TraceRun | null;
}

export const Timeline: React.FC<TimelineProps> = ({
  spans,
  selectedSpanId,
  onSelectSpan,
  isOpen,
  onToggleOpen,
  selectedRun
}) => {
  // Compute time offsets and duration
  const { sortedSpans, minTime, maxTime, totalDurationMs } = useMemo(() => {
    if (!spans || spans.length === 0) {
      return { sortedSpans: [], minTime: 0, maxTime: 0, totalDurationMs: 0 };
    }

    const sorted = [...spans].sort((a, b) => a.created_at - b.created_at);
    const min = sorted[0].created_at;
    let max = min;

    for (const s of sorted) {
      const end = s.created_at + Math.max(10, s.latency_ms || 10);
      if (end > max) max = end;
    }

    const duration = Math.max(100, max - min);
    return { sortedSpans: sorted, minTime: min, maxTime: max, totalDurationMs: duration };
  }, [spans]);

  if (!selectedRun) return null;

  return (
    <div className="border-t border-[#202024] bg-[#09090b] flex flex-col z-20 shrink-0 select-none">
      {/* Timeline Controls & Header Strip */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-[#202024] bg-[#111114] text-xs font-mono">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleOpen}
            className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors py-0.5"
            title="Toggle Timeline Tray (T)"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span className="font-semibold text-zinc-200">Timeline</span>
          </button>

          <Divider orientation="vertical" />

          <span className="text-zinc-400 text-[11px]">
            {spans.length} {spans.length === 1 ? 'event' : 'events'}
          </span>

          <Divider orientation="vertical" />

          <span className="text-zinc-400 text-[11px] flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            {totalDurationMs}ms window
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
          <span className="hidden sm:inline">Press <kbd className="px-1 py-0.2 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">T</kbd> to toggle</span>
        </div>
      </div>

      {/* Expanded Timeline Waterfall Tray */}
      {isOpen && (
        <div className="h-40 overflow-y-auto overflow-x-hidden p-2 space-y-1 bg-[#09090b]/95">
          {sortedSpans.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs font-mono">
              No spans recorded for this execution yet.
            </div>
          ) : (
            sortedSpans.map((span, idx) => {
              const isSelected = span.id === selectedSpanId;
              const startOffset = Math.max(0, span.created_at - minTime);
              const leftPercent = Math.min(92, (startOffset / totalDurationMs) * 100);
              const duration = Math.max(15, span.latency_ms || 15);
              const widthPercent = Math.max(3, Math.min(100 - leftPercent, (duration / totalDurationMs) * 100));

              // Icon & Label
              let Icon = Bot;
              let barColor = 'bg-[#18181c] border-[#3f3f46] text-zinc-200';
              let typeLabel: string = span.span_type;

              if (span.span_type === 'tool_call') {
                Icon = Wrench;
                barColor = 'bg-[#082f49] border-[#0284c7] text-[#bae6fd]';
                typeLabel = 'TOOL';
              } else if (span.span_type === 'http_call') {
                Icon = Globe;
                barColor = 'bg-[#134e4a] border-[#0d9488] text-[#99f6e4]';
                typeLabel = 'HTTP';
              } else if (span.span_type === 'retry') {
                Icon = RotateCcw;
                barColor = 'bg-[#451a03] border-[#d97706] text-[#fde68a]';
                typeLabel = 'RETRY';
              } else if (span.span_type === 'guardrail_block') {
                Icon = AlertTriangle;
                barColor = 'bg-[#4c0519] border-[#e11d48] text-[#fecdd3]';
                typeLabel = 'ERROR';
              } else if (span.span_type === 'user_input') {
                Icon = User;
                barColor = 'bg-[#1e1b4b] border-[#6366f1] text-[#c7d2fe]';
                typeLabel = 'USER';
              } else if (span.span_type === 'llm_call') {
                Icon = Bot;
                barColor = 'bg-[#18181c] border-[#3f3f46] text-zinc-200';
                typeLabel = span.model || 'LLM';
              }

              if (span.execution_origin === 'modified') {
                barColor = 'bg-[#451a03] border-[#b45309] text-[#fcd34d]';
              } else if (span.execution_origin === 'cached_replay' || span.cache_hit === 1) {
                barColor = 'bg-[#082f49] border-[#0369a1] text-[#7dd3fc]';
              } else if (span.execution_origin === 'new_execution') {
                barColor = 'bg-[#064e3b] border-[#059669] text-[#6ee7b7]';
              }

              const originBadge = span.execution_origin === 'modified'
                ? 'MODIFIED'
                : span.execution_origin === 'cached_replay' || span.cache_hit === 1
                ? 'CACHE'
                : span.execution_origin === 'new_execution'
                ? 'NEW'
                : null;

              return (
                <div
                  key={span.id}
                  onClick={() => onSelectSpan(span)}
                  className={`group flex items-center h-6 px-2 rounded cursor-pointer transition-colors text-xs font-mono ${
                    isSelected
                      ? 'bg-[#18181c] text-white border border-zinc-400'
                      : 'hover:bg-[#141418] text-zinc-400 border border-transparent'
                  }`}
                >
                  {/* Left Label: Index & Category */}
                  <div className="w-52 shrink-0 flex items-center gap-1.5 truncate pr-2">
                    <span className="text-[10px] text-zinc-500 w-5 text-right font-mono">
                      #{idx + 1}
                    </span>
                    <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    <span className="font-medium text-zinc-200 truncate">{span.agent_name}</span>
                    {originBadge && (
                      <span className={`text-[9px] px-1 py-0.2 rounded border font-mono font-bold uppercase ${
                        originBadge === 'CACHE'
                          ? 'bg-[#082f49] text-[#7dd3fc] border-[#0369a1]'
                          : originBadge === 'MODIFIED'
                          ? 'bg-[#451a03] text-[#fcd34d] border-[#b45309]'
                          : 'bg-[#064e3b] text-[#6ee7b7] border-[#059669]'
                      }`}>
                        {originBadge}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 truncate">({typeLabel})</span>
                  </div>

                  {/* Waterfall Bar Track */}
                  <div className="flex-1 relative h-3 bg-[#111114] rounded-sm border border-[#202024] overflow-hidden">
                    <div
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`
                      }}
                      className={`absolute top-0 bottom-0 rounded-xs border px-1 flex items-center justify-between text-[9px] font-mono leading-none truncate ${barColor} ${
                        isSelected ? 'border-white' : ''
                      }`}
                      title={`${span.agent_name} (${span.span_type}): +${startOffset}ms, duration ${span.cache_hit === 1 ? '0ms (cached)' : `${span.latency_ms}ms`}`}
                    >
                      <span className="truncate pr-1">
                        {span.cache_hit === 1 ? '0ms (cache)' : `${span.latency_ms}ms`}
                      </span>
                    </div>
                  </div>

                  {/* Right Metric Pill */}
                  <div className="w-28 shrink-0 text-right pl-2 text-[10px] text-zinc-500 font-mono">
                    {span.execution_origin === 'cached_replay' || span.cache_hit === 1 ? (
                      <span className="text-zinc-400 flex items-center justify-end gap-0.5">
                        <Zap className="w-2.5 h-2.5 inline text-sky-400" /> 0ms (cache)
                      </span>
                    ) : span.execution_origin === 'modified' ? (
                      <span className="text-amber-400 flex items-center justify-end gap-0.5">
                        MODIFIED
                      </span>
                    ) : (
                      <span>+{startOffset}ms</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
