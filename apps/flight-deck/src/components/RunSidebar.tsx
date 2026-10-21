import React, { useState } from 'react';
import {
  Layers,
  GitFork,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Search,
  Filter,
  RefreshCw,
  Cpu
} from 'lucide-react';
import type { TraceRun } from '@/lib/api';

interface RunSidebarProps {
  runs: TraceRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onRefreshRuns: () => void;
  isLoading: boolean;
}

export const RunSidebar: React.FC<RunSidebarProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  onRefreshRuns,
  isLoading
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRuns = runs.filter((run) => {
    const matchesQuery =
      run.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      run.id.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const getStatusBadge = (status: TraceRun['status']) => {
    switch (status) {
      case 'breaker_tripped':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-950 text-red-400 border border-red-800">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            Breaker
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-950 text-cyan-300 border border-cyan-800">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            Live
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Done
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-gray-900 border border-gray-800">
            {status}
          </span>
        );
    }
  };

  return (
    <aside className="w-80 h-full border-r border-gray-800 bg-[#0d1322] flex flex-col shrink-0">
      {/* Sidebar Header & Search Controls */}
      <div className="p-3.5 border-b border-gray-800 space-y-2.5 bg-[#0b0f1a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Trace Runs</h2>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-gray-800 text-gray-300">
              {runs.length}
            </span>
          </div>
          <button
            onClick={onRefreshRuns}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            title="Refresh Runs List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter sessions by name / ID..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-[#111827] border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
          />
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          {['all', 'running', 'completed', 'breaker_tripped'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              {st === 'breaker_tripped' ? 'Breakers' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Runs Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/40 p-2 space-y-1">
        {filteredRuns.length === 0 ? (
          <div className="py-12 text-center text-gray-500 font-mono text-xs">
            {isLoading ? 'Loading trace runs...' : 'No runs found'}
          </div>
        ) : (
          filteredRuns.map((run) => {
            const isSelected = run.id === selectedRunId;
            const isForked = Boolean(run.parent_run_id);

            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className={`p-3 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-[#152037] border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/50'
                    : 'bg-[#111827]/60 hover:bg-[#111827] border-transparent hover:border-gray-800'
                }`}
              >
                {/* Top Row: Name & Status */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-xs font-semibold text-gray-100 truncate leading-snug">
                    {run.name}
                  </h3>
                  {getStatusBadge(run.status)}
                </div>

                {/* Subtitle: Run ID & Fork Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-gray-500 truncate max-w-[130px]">
                    {run.id}
                  </span>
                  {isForked && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800"
                      title={`Forked from ${run.parent_run_id}`}
                    >
                      <GitFork className="w-2.5 h-2.5 text-purple-400" />
                      Forked
                    </span>
                  )}
                </div>

                {/* Bottom Metrics: Tokens & Cost */}
                <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 pt-1.5 border-t border-gray-800/60">
                  <span className="flex items-center gap-1 text-gray-400">
                    <Coins className="w-3 h-3 text-gray-500" />
                    {run.total_tokens} tokens
                  </span>
                  <span className="text-cyan-400 font-semibold">
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
