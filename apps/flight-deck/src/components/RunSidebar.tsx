'use client';

import React, { useState } from 'react';
import {
  Layers,
  GitFork,
  Coins,
  Search,
  RefreshCw,
  Scale,
  RotateCcw
} from 'lucide-react';
import type { TraceRun } from '@/lib/api';
import {
  Badge,
  StatusIndicator,
  Input,
  IconButton,
  Button,
  EmptyState,
  LoadingState
} from '@/design-system';

interface RunSidebarProps {
  runs: TraceRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onRefreshRuns: () => void;
  isLoading: boolean;
  onCompareRuns?: (baseRunId: string, targetRunId: string) => void;
  onPauseRun?: (runId: string) => void;
  onResumeRun?: (runId: string) => void;
}

export const RunSidebar: React.FC<RunSidebarProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  onRefreshRuns,
  isLoading,
  onCompareRuns
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRuns = runs.filter((run) => {
    const raw = filterQuery.trim();
    if (!raw) {
      return (
        statusFilter === 'all' ||
        run.status === statusFilter ||
        (statusFilter === 'replay' && (run.name.toLowerCase().includes('replay') || run.id.includes('replay'))) ||
        (statusFilter === 'fork' && run.parent_run_id && !run.name.toLowerCase().includes('replay'))
      );
    }

    // Check for semantic query tokens
    const tokens = raw.toLowerCase().split(/\s+/);
    let matchesAllTokens = true;

    for (const token of tokens) {
      if (token.startsWith('status:')) {
        const val = token.slice(7);
        if (val === 'error' || val === 'failed') {
          if (run.status !== 'failed' && run.status !== 'breaker_tripped') matchesAllTokens = false;
        } else if (run.status !== val) {
          matchesAllTokens = false;
        }
      } else if (token.startsWith('cost:>')) {
        const threshold = parseFloat(token.slice(6));
        if (isNaN(threshold) || run.total_cost_usd <= threshold) matchesAllTokens = false;
      } else if (token.startsWith('cost:<')) {
        const threshold = parseFloat(token.slice(6));
        if (isNaN(threshold) || run.total_cost_usd >= threshold) matchesAllTokens = false;
      } else if (token.startsWith('tokens:>')) {
        const threshold = parseInt(token.slice(8), 10);
        if (isNaN(threshold) || run.total_tokens <= threshold) matchesAllTokens = false;
      } else if (token.startsWith('branch:')) {
        const val = token.slice(7);
        if (!run.provenance || !run.provenance.toLowerCase().includes(val)) matchesAllTokens = false;
      } else {
        const textMatch =
          run.name.toLowerCase().includes(token) ||
          run.id.toLowerCase().includes(token) ||
          (run.provenance && run.provenance.toLowerCase().includes(token));
        if (!textMatch) matchesAllTokens = false;
      }
    }

    const matchesStatus =
      statusFilter === 'all' ||
      run.status === statusFilter ||
      (statusFilter === 'replay' && (run.name.toLowerCase().includes('replay') || run.id.includes('replay'))) ||
      (statusFilter === 'fork' && run.parent_run_id && !run.name.toLowerCase().includes('replay'));

    return matchesAllTokens && matchesStatus;
  });

  return (
    <aside className="w-80 h-full border-r border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0 select-none">
      {/* Sidebar Header & Search Controls */}
      <div className="p-2.5 border-b border-[#202024] space-y-2 bg-[#09090b]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-300" />
            <span className="text-xs font-mono font-semibold tracking-wide text-zinc-200 uppercase">Runs</span>
            <Badge variant="neutral" size="xs">
              {runs.length}
            </Badge>
          </div>
          <IconButton
            label="Refresh runs"
            size="xs"
            onClick={onRefreshRuns}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3 h-3 text-zinc-400 ${isLoading ? 'animate-spin text-white' : ''}`} />
          </IconButton>
        </div>

        {/* Search input */}
        <Input
          placeholder="Filter runs (e.g. status:error, cost:>0.01)..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          inputSize="sm"
          icon={<Search className="w-3 h-3 text-zinc-500" />}
        />

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1 text-[10px] font-mono overflow-x-auto pb-0.5">
          {['all', 'running', 'completed', 'fork', 'replay'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono transition-colors shrink-0 ${
                statusFilter === st
                  ? 'bg-zinc-200 text-black font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181c]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Runs Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && runs.length === 0 ? (
          <LoadingState message="Loading trace runs..." />
        ) : filteredRuns.length === 0 ? (
          <EmptyState
            title="No traces yet"
            description="Start AetherTrace and run your agent to observe execution history here."
            className="py-12"
          />
        ) : (
          filteredRuns.map((run) => {
            const isSelected = run.id === selectedRunId;
            const isReplay = run.name.toLowerCase().includes('replay') || run.id.includes('replay');
            const isForked = Boolean(run.parent_run_id) && !isReplay;

            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className={`p-2.5 rounded border transition-all cursor-pointer font-mono ${
                  isSelected
                    ? 'bg-[#18181c] border-zinc-400 ring-1 ring-zinc-500/40 text-white shadow-sm'
                    : 'bg-[#111114] hover:bg-[#18181c] border-[#2c2c32] text-zinc-300'
                }`}
              >
                {/* Top Row: Name & Status */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <h3 className="text-xs font-semibold text-zinc-100 truncate leading-tight">
                    {run.name}
                  </h3>
                  <StatusIndicator status={run.status} size="xs" showLabel={false} />
                </div>

                {/* Subtitle: Run ID & Lineage Badges */}
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-500 truncate max-w-[100px]" title={run.id}>
                    {run.id}
                  </span>

                  {isReplay && (
                    <Badge variant="origin" origin="cached_replay" size="xs">
                      <RotateCcw className="w-2.5 h-2.5 inline mr-0.5" />
                      Replay
                    </Badge>
                  )}

                  {isForked && (
                    <Badge variant="origin" origin="forked" size="xs">
                      <GitFork className="w-2.5 h-2.5 inline mr-0.5" />
                      Fork
                    </Badge>
                  )}

                  {run.mutations && (
                    <Badge variant="origin" origin="modified" size="xs">
                      Mutated
                    </Badge>
                  )}

                  {run.parent_run_id && onCompareRuns && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompareRuns(run.parent_run_id!, run.id);
                      }}
                      className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-[#1c1c22] text-zinc-300 hover:text-white border border-[#2c2c32] transition-colors ml-auto"
                      title="Compare with Parent Run in Diff Arena"
                    >
                      <Scale className="w-2.5 h-2.5" />
                      Diff
                    </button>
                  )}
                </div>

                {/* Bottom Metrics: Tokens & Cost */}
                <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#202024]">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Coins className="w-3 h-3 text-zinc-500" />
                    {run.total_tokens} tok
                  </span>
                  <span className="text-zinc-200 font-medium">
                    ${run.total_cost_usd > 0 ? run.total_cost_usd.toFixed(6) : '0.000000'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
