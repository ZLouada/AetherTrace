'use client';

import React from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Wrench,
  Bot,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Ban
} from 'lucide-react';
import type { PendingBreakpoint, TraceSpan } from '@/lib/api';
import { Badge, Button } from '@/design-system';

export interface BreakpointHUDProps {
  isPaused: boolean;
  pendingBreakpoint: PendingBreakpoint | null;
  interceptedSpan: TraceSpan | null;
  onContinue: () => void | Promise<void>;
  onMock: () => void | Promise<void>;
  onAbort: () => void | Promise<void>;
  onInspectSpan?: (spanId: string) => void;
}

export const BreakpointHUD: React.FC<BreakpointHUDProps> = ({
  isPaused,
  pendingBreakpoint,
  interceptedSpan,
  onContinue,
  onMock,
  onAbort,
  onInspectSpan
}) => {
  if (!isPaused && !pendingBreakpoint && !interceptedSpan) {
    return null;
  }

  // Determine span context
  const targetSpanId = pendingBreakpoint?.spanId || interceptedSpan?.id;
  const agentName = pendingBreakpoint?.agentName || interceptedSpan?.agent_name || 'Agent';
  const spanType = pendingBreakpoint?.spanType || interceptedSpan?.span_type || 'llm_call';
  const modelOrTool = pendingBreakpoint?.model || interceptedSpan?.model || interceptedSpan?.span_type || 'invocation';

  let CategoryIcon = Bot;
  if (spanType === 'tool_call') CategoryIcon = Wrench;
  else if (spanType === 'guardrail_block') CategoryIcon = ShieldAlert;

  const isPendingRule = Boolean(pendingBreakpoint);
  const statusTitle = isPendingRule
    ? 'BREAKPOINT HIT — INTERCEPTION ACTIVE'
    : 'EXECUTION PAUSED';

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="shrink-0 bg-[#17140e] border-b border-amber-500/50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-md text-xs font-mono select-none z-20 animate-in fade-in duration-150"
    >
      {/* Left: Status Indicator & Context */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>

        <span className="font-bold tracking-wider text-amber-300 text-[11px] flex items-center gap-1.5">
          <Pause className="w-3 h-3 fill-amber-400 text-amber-400 inline" />
          {statusTitle}
        </span>

        <span className="h-3 w-px bg-amber-500/30 hidden sm:block" />

        {/* Target Span Context Chip */}
        <div className="flex items-center gap-1.5 text-zinc-300 text-[11px] truncate">
          <span className="text-zinc-400">Span:</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#201c13] border border-amber-500/30 text-amber-200">
            <CategoryIcon className="w-3 h-3 text-amber-400" />
            <span className="font-semibold text-zinc-100">{agentName}</span>
            <span className="text-zinc-400">•</span>
            <span className="text-zinc-300 truncate max-w-[130px]">{modelOrTool}</span>
          </span>

          {targetSpanId && onInspectSpan && (
            <button
              onClick={() => onInspectSpan(targetSpanId)}
              className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 ml-1 cursor-pointer font-sans"
              title="Inspect intercepted span in Inspector Drawer"
            >
              [Inspect Span]
            </button>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onContinue}
          className="px-2.5 py-1 text-xs font-sans font-medium text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/60 rounded flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors active:scale-95"
          title="Resume execution (Space or F5)"
        >
          <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
          <span>Continue</span>
          <kbd className="px-1 py-0.5 rounded bg-emerald-900/60 text-[9px] font-mono text-emerald-200">Space</kbd>
        </button>

        <button
          onClick={onMock}
          className="px-2.5 py-1 text-xs font-sans font-medium text-amber-200 bg-amber-950/70 hover:bg-amber-900 border border-amber-500/60 rounded flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors active:scale-95"
          title="Inject synthetic mock response ($0 cost) (M)"
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Mock Response</span>
          <kbd className="px-1 py-0.5 rounded bg-amber-900/60 text-[9px] font-mono text-amber-200">M</kbd>
        </button>

        <button
          onClick={onAbort}
          className="px-2.5 py-1 text-xs font-sans font-medium text-rose-300 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/60 rounded flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors active:scale-95"
          title="Abort execution (Esc)"
        >
          <Ban className="w-3 h-3 text-rose-400" />
          <span>Abort</span>
          <kbd className="px-1 py-0.5 rounded bg-rose-900/60 text-[9px] font-mono text-rose-200">Esc</kbd>
        </button>
      </div>
    </aside>
  );
};
