'use client';

import React from 'react';
import {
  RotateCcw,
  GitFork,
  ArrowUpRight,
  Scale,
  GitBranch,
  Layers
} from 'lucide-react';
import type { TraceRun } from '@/lib/api';
import { Badge, Button } from '@/design-system';

export interface ReplayContextBannerProps {
  run: TraceRun | null;
  onSelectRun: (runId: string) => void;
  onCompareWithSource: (sourceRunId: string, currentRunId: string) => void;
}

export const ReplayContextBanner: React.FC<ReplayContextBannerProps> = ({
  run,
  onSelectRun,
  onCompareWithSource
}) => {
  if (!run || !run.parent_run_id) {
    return null;
  }

  const isFork = Boolean(run.forked_at_span_id);
  const isReplay = !isFork;

  return (
    <div className="shrink-0 bg-[#0c141d] border-b border-sky-800/40 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none z-10 animate-in fade-in duration-150">
      {/* Left: Origin & Lineage */}
      <div className="flex items-center gap-2 min-w-0">
        {isFork ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-indigo-950/80 border border-indigo-500/50 text-indigo-300">
            <GitFork className="w-3 h-3 text-indigo-400" />
            FORK EXECUTION
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-sky-950/80 border border-sky-500/50 text-sky-300">
            <RotateCcw className="w-3 h-3 text-sky-400" />
            REPLAY EXECUTION
          </span>
        )}

        <span className="h-3 w-px bg-sky-800/30 hidden sm:block" />

        {/* Source Run Link */}
        <div className="flex items-center gap-1 text-[11px] text-zinc-300 truncate">
          <span className="text-zinc-500">Source:</span>
          <button
            onClick={() => onSelectRun(run.parent_run_id!)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#131b26] border border-sky-700/40 text-sky-200 hover:text-sky-100 hover:border-sky-500/60 transition-colors cursor-pointer"
            title={`Navigate to source run ${run.parent_run_id}`}
          >
            <span>{run.parent_run_id.slice(0, 14)}</span>
            <ArrowUpRight className="w-2.5 h-2.5 text-sky-400" />
          </button>
        </div>

        {run.forked_at_span_id && (
          <span className="text-[10px] text-zinc-400 hidden md:inline truncate">
            (branched at span {run.forked_at_span_id.slice(0, 8)})
          </span>
        )}
      </div>

      {/* Right: Compare with Source Action */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onCompareWithSource(run.parent_run_id!, run.id)}
          className="px-2 py-0.5 text-xs font-sans font-medium text-sky-200 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/50 rounded flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95"
          title="Open Diff Arena comparing source run against this execution"
        >
          <Scale className="w-3 h-3 text-sky-400" />
          <span>Compare with Source</span>
        </button>
      </div>
    </div>
  );
};
