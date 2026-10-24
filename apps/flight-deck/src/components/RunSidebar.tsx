'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Layers,
  GitFork,
  Search,
  RefreshCw,
  Scale,
  RotateCcw,
  AlertTriangle,
  X,
  Play,
  Pause,
  Clock
} from 'lucide-react';
import type { TraceRun } from '@/lib/api';
import {
  Badge,
  StatusIndicator,
  Input,
  IconButton,
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
  width?: number;
  activeRunSpansCount?: number;
  activeRunDurationMs?: number;
  activeRunErrorCount?: number;
}

type FilterStatus = 'all' | 'running' | 'completed' | 'errors' | 'forks' | 'replays';

function formatRelativeTime(epochMs: number): { section: 'Today' | 'Yesterday' | 'Earlier'; relative: string } {
  const date = new Date(epochMs);
  const now = new Date();

  // Normalize to local midnight for sectioning
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  let section: 'Today' | 'Yesterday' | 'Earlier' = 'Earlier';
  if (epochMs >= startOfToday) {
    section = 'Today';
  } else if (epochMs >= startOfYesterday) {
    section = 'Yesterday';
  }

  const diffSec = Math.floor((now.getTime() - epochMs) / 1000);
  let relative = '';
  if (diffSec < 45) {
    relative = 'Just now';
  } else if (diffSec < 3600) {
    relative = `${Math.floor(diffSec / 60)}m ago`;
  } else if (diffSec < 86400) {
    relative = `${Math.floor(diffSec / 3600)}h ago`;
  } else if (diffSec < 86400 * 7) {
    relative = `${Math.floor(diffSec / 86400)}d ago`;
  } else {
    relative = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return { section, relative };
}

export const RunSidebar: React.FC<RunSidebarProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  onRefreshRuns,
  isLoading,
  onCompareRuns,
  onPauseRun,
  onResumeRun,
  width = 240,
  activeRunSpansCount,
  activeRunDurationMs,
  activeRunErrorCount
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Filter runs based on query and status category
  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const isReplay = run.name.toLowerCase().includes('replay') || run.id.includes('replay');
      const isFork = Boolean(run.parent_run_id) && !isReplay;
      const isError = run.status === 'failed' || run.status === 'breaker_tripped' || run.name.toLowerCase().includes('error');

      // Status chip filter
      if (statusFilter === 'running' && run.status !== 'running' && run.status !== 'paused') return false;
      if (statusFilter === 'completed' && run.status !== 'completed') return false;
      if (statusFilter === 'errors' && !isError) return false;
      if (statusFilter === 'forks' && !isFork) return false;
      if (statusFilter === 'replays' && !isReplay) return false;

      // Text and token search
      const raw = filterQuery.trim();
      if (!raw) return true;

      const tokens = raw.toLowerCase().split(/\s+/);
      for (const token of tokens) {
        if (token.startsWith('status:')) {
          const val = token.slice(7);
          if (val === 'error' || val === 'failed') {
            if (!isError) return false;
          } else if (run.status !== val) {
            return false;
          }
        } else if (token.startsWith('cost:>')) {
          const threshold = parseFloat(token.slice(6));
          if (isNaN(threshold) || run.total_cost_usd <= threshold) return false;
        } else if (token.startsWith('cost:<')) {
          const threshold = parseFloat(token.slice(6));
          if (isNaN(threshold) || run.total_cost_usd >= threshold) return false;
        } else if (token.startsWith('tokens:>')) {
          const threshold = parseInt(token.slice(8), 10);
          if (isNaN(threshold) || run.total_tokens <= threshold) return false;
        } else if (token.startsWith('branch:')) {
          const val = token.slice(7);
          if (!run.provenance || !run.provenance.toLowerCase().includes(val)) return false;
        } else {
          const textMatch =
            run.name.toLowerCase().includes(token) ||
            run.id.toLowerCase().includes(token) ||
            (run.provenance && run.provenance.toLowerCase().includes(token));
          if (!textMatch) return false;
        }
      }

      return true;
    });
  }, [runs, filterQuery, statusFilter]);

  // Group filtered runs by chronological sections
  const groupedSections = useMemo(() => {
    const sections: Record<'Today' | 'Yesterday' | 'Earlier', TraceRun[]> = {
      Today: [],
      Yesterday: [],
      Earlier: []
    };

    for (const run of filteredRuns) {
      const { section } = formatRelativeTime(run.created_at);
      sections[section].push(run);
    }

    return (['Today', 'Yesterday', 'Earlier'] as const).filter(
      (sec) => sections[sec].length > 0
    ).map((sec) => ({
      title: sec,
      runs: sections[sec]
    }));
  }, [filteredRuns]);

  // Flat list for keyboard indexing
  const flatRuns = useMemo(() => {
    return filteredRuns;
  }, [filteredRuns]);

  // Keep focusedIndex in sync with selectedRunId
  useEffect(() => {
    if (selectedRunId) {
      const idx = flatRuns.findIndex((r) => r.id === selectedRunId);
      if (idx !== -1) setFocusedIndex(idx);
    }
  }, [selectedRunId, flatRuns]);

  // Keyboard navigation within the RunSidebar
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatRuns.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < flatRuns.length - 1 ? prev + 1 : 0;
          onSelectRun(flatRuns[next].id);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : flatRuns.length - 1;
          onSelectRun(flatRuns[next].id);
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < flatRuns.length) {
          onSelectRun(flatRuns[focusedIndex].id);
        }
      }
    },
    [flatRuns, focusedIndex, onSelectRun]
  );

  return (
    <aside
      className="h-full border-r border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0 select-none overflow-hidden text-xs"
      style={{ width: `${width}px` }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Runs Navigator"
    >
      {/* 1. Header: Runs Count & Refresh */}
      <div className="p-2 border-b border-[#202024] bg-[#09090b] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#ea580c]" />
            <span className="font-mono font-semibold tracking-wider text-zinc-200 uppercase text-[11px]">
              Runs
            </span>
            <Badge variant="neutral" size="xs">
              {runs.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              label="Refresh runs list"
              size="xs"
              onClick={onRefreshRuns}
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 text-zinc-400 ${isLoading ? 'animate-spin text-white' : ''}`} />
            </IconButton>
          </div>
        </div>

        {/* 2. Compact Search Input */}
        <div className="relative">
          <Input
            ref={searchInputRef}
            placeholder="Search runs... (⌘F or /)"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            inputSize="sm"
            icon={<Search className="w-3 h-3 text-zinc-400" />}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilterQuery('');
                searchInputRef.current?.blur();
                listContainerRef.current?.focus();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                listContainerRef.current?.focus();
                if (flatRuns.length > 0) {
                  setFocusedIndex(0);
                  onSelectRun(flatRuns[0].id);
                }
              }
            }}
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 3. Filter Chips Strip */}
        <div className="flex items-center gap-1 text-[10px] font-mono overflow-x-auto pb-0.5 no-scrollbar">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'running', label: 'Live' },
              { id: 'completed', label: 'Done' },
              { id: 'errors', label: 'Errors' },
              { id: 'forks', label: 'Forks' },
              { id: 'replays', label: 'Replays' }
            ] as const
          ).map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors shrink-0 ${
                  isActive
                    ? 'bg-zinc-200 text-black font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181c]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Scrollable High-Density List */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto outline-none focus:outline-none divide-y divide-[#18181c]"
        tabIndex={-1}
      >
        {isLoading && runs.length === 0 ? (
          <div className="py-12">
            <LoadingState message="Loading trace runs..." />
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={runs.length === 0 ? 'No traces yet' : 'No matching runs'}
              description={
                runs.length === 0
                  ? 'Start your agent or import a trace bundle to inspect execution graphs.'
                  : 'Adjust your search terms or filter chips to view runs.'
              }
              className="py-8"
            />
          </div>
        ) : (
          groupedSections.map((section) => (
            <div key={section.title} className="space-y-0">
              {/* Section Header */}
              <div className="sticky top-0 z-10 px-2.5 py-1 bg-[#09090b] border-b border-[#202024]/80 text-[10px] font-mono font-semibold tracking-wider text-zinc-400 uppercase flex items-center justify-between">
                <span>{section.title}</span>
                <span className="text-[9px] text-zinc-400">{section.runs.length}</span>
              </div>

              {/* Rows */}
              {section.runs.map((run) => {
                const isSelected = run.id === selectedRunId;
                const isReplay = run.name.toLowerCase().includes('replay') || run.id.includes('replay');
                const isForked = Boolean(run.parent_run_id) && !isReplay;
                const isFailed = run.status === 'failed' || run.status === 'breaker_tripped' || run.name.toLowerCase().includes('error');
                const { relative } = formatRelativeTime(run.created_at);

                return (
                  <div
                    key={run.id}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    aria-label={`Run ${run.name}, status ${run.status}`}
                    onClick={() => onSelectRun(run.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectRun(run.id);
                      }
                    }}
                    className={`group px-2.5 py-2 cursor-pointer transition-colors relative border-l-2 select-none font-mono ${
                      isSelected
                        ? 'bg-[#18181c] border-l-[#ea580c] text-white shadow-xs'
                        : 'bg-transparent hover:bg-[#131317] border-l-transparent text-zinc-300'
                    }`}
                  >
                    {/* Line 1: Status Dot + Run Name + Relative Time */}
                    <div className="flex items-center justify-between gap-1.5 leading-tight mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <StatusIndicator status={run.status} size="xs" showLabel={false} />
                        <h4
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-zinc-100' : 'text-zinc-300 group-hover:text-zinc-100'
                          }`}
                          title={run.name}
                        >
                          {run.name}
                        </h4>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                        {relative}
                      </span>
                    </div>

                    {/* Line 2: Run ID + Lineage Badges + Error Pill + Diff Trigger */}
                    <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                      <span
                        className="text-[10px] text-zinc-400 font-mono truncate max-w-[85px]"
                        title={run.id}
                      >
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

                      {isFailed && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50 font-mono font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Fail
                        </span>
                      )}

                      {run.parent_run_id && onCompareRuns && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCompareRuns(run.parent_run_id!, run.id);
                          }}
                          className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e24] text-zinc-400 hover:text-white border border-[#2c2c34] font-mono ml-auto opacity-80 group-hover:opacity-100 transition-opacity"
                          title="Compare with Parent Run in Diff Arena"
                        >
                          <Scale className="w-2.5 h-2.5" />
                          Diff
                        </button>
                      )}

                      {run.status === 'running' && onPauseRun && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPauseRun(run.id);
                          }}
                          className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40 font-mono ml-auto"
                          title="Pause Execution"
                        >
                          <Pause className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {run.status === 'paused' && onResumeRun && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onResumeRun(run.id);
                          }}
                          className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-mono ml-auto"
                          title="Resume Execution"
                        >
                          <Play className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    {/* Line 3: Monospace Metrics (Tokens, Spend, Duration) */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-[#1c1c20] font-mono">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span>{run.total_tokens.toLocaleString()} tok</span>
                        {isSelected && activeRunSpansCount !== undefined && (
                          <>
                            <span>·</span>
                            <span className="text-zinc-300">{activeRunSpansCount} spans</span>
                          </>
                        )}
                        {isSelected && activeRunDurationMs !== undefined && activeRunDurationMs > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-zinc-300 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5 text-zinc-400" />
                              {activeRunDurationMs}ms
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-zinc-300 font-medium">
                        ${run.total_cost_usd > 0 ? run.total_cost_usd.toFixed(4) : '0.0000'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* 5. Monospace Footer Status */}
      <div className="px-2.5 py-1.5 border-t border-[#202024] bg-[#09090b] flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span>
          {filteredRuns.length} of {runs.length} runs
        </span>
        <span className="text-zinc-400">
          <kbd className="px-1 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">↑</kbd>
          <kbd className="px-1 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32] ml-0.5">↓</kbd> navigate
        </span>
      </div>
    </aside>
  );
};
