import React, { useRef } from 'react';
import {
  Activity,
  Play,
  Zap,
  DollarSign,
  Layers,
  Database,
  Radio,
  RefreshCw,
  Loader2,
  Upload,
  Download,
  PauseCircle,
  Flame,
  Scale
} from 'lucide-react';
import type { GlobalStats, BreakpointConfig, ChaosConfig } from '@/lib/api';

interface TopBarProps {
  wsConnected: boolean;
  stats: GlobalStats | null;
  onRefreshStats: () => void;
  onRunSimulation: () => Promise<void>;
  isSimulating: boolean;
  selectedRunId: string | null;
  onExportTrace: () => void;
  onImportTrace: (file: File) => void;
  breakpointConfig: BreakpointConfig | null;
  pendingBreakpointsCount: number;
  onToggleBreakpoints: () => void;
  chaosConfig: ChaosConfig | null;
  onOpenChaosModal: () => void;
  onOpenDiffModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wsConnected,
  stats,
  onRefreshStats,
  onRunSimulation,
  isSimulating,
  selectedRunId,
  onExportTrace,
  onImportTrace,
  breakpointConfig,
  pendingBreakpointsCount,
  onToggleBreakpoints,
  chaosConfig,
  onOpenChaosModal,
  onOpenDiffModal
}) => {

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <header className="h-16 border-b border-gray-800 bg-[#0b0f1a] px-5 flex items-center justify-between shrink-0 select-none">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 p-0.5 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <div className="w-full h-full bg-[#090d16] rounded-[7px] flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              Aether<span className="text-cyan-400">Trace</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 ml-1">
                Flight Deck
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 font-mono">Wireshark for AI Agents</p>
        </div>
      </div>

      {/* Global Telemetry Metrics */}
      <div className="hidden lg:flex items-center gap-6 px-4 py-1.5 rounded-lg bg-[#111827] border border-gray-800/80 font-mono text-xs">
        <div className="flex items-center gap-2" title="Total Trace Runs">
          <Layers className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-400 text-[11px]">Runs:</span>
          <span className="text-gray-200 font-bold">{stats?.runs.total ?? 0}</span>
        </div>

        <div className="w-px h-3.5 bg-gray-800" />

        <div className="flex items-center gap-2" title="Total Captured Execution Spans">
          <Database className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-400 text-[11px]">Spans:</span>
          <span className="text-gray-200 font-bold">{stats?.spans.total ?? 0}</span>
        </div>

        <div className="w-px h-3.5 bg-gray-800" />

        <div className="flex items-center gap-2" title="0ms Replay Cache Hit Rate">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-gray-400 text-[11px]">Cache Hit:</span>
          <span className="text-emerald-400 font-bold">
            {stats?.spans.cacheHitRate !== undefined ? `${stats.spans.cacheHitRate.toFixed(1)}%` : '0%'}
          </span>
        </div>

        <div className="w-px h-3.5 bg-gray-800" />

        <div className="flex items-center gap-2" title="Total Recorded Workflow Spend">
          <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-gray-400 text-[11px]">Spend:</span>
          <span className="text-cyan-400 font-bold">
            ${stats?.runs.totalCostUsd !== undefined ? stats.runs.totalCostUsd.toFixed(4) : '0.0000'}
          </span>
        </div>

        <button
          onClick={onRefreshStats}
          className="text-gray-500 hover:text-gray-300 transition-colors ml-1"
          title="Refresh Global Stats"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Live WS Status & Simulation Action */}
      <div className="flex items-center gap-4">
        {/* WebSocket Connection Pill */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
            wsConnected
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
              : 'bg-red-950/40 text-red-400 border-red-800/60'
          }`}
          title={wsConnected ? 'Connected to ws://localhost:4000/ws' : 'Disconnected from ws://localhost:4000/ws'}
        >
          <Radio className={`w-3.5 h-3.5 ${wsConnected ? 'text-emerald-400 animate-pulse' : 'text-red-500'}`} />
          <span className="text-[11px] font-medium hidden sm:inline">
            {wsConnected ? 'LIVE FEED (4000)' : 'OFFLINE'}
          </span>
        </div>

        {/* Hidden File Input for .trace.json Import */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,.trace.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onImportTrace(file);
              e.target.value = '';
            }
          }}
        />

        {/* Import .trace Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-gray-300 bg-[#111827] hover:bg-gray-800 border border-gray-700/80 transition-all hover:text-white"
          title="Import a portable .trace.json bundle into local SQLite"
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span>Import .trace</span>
        </button>

        {/* Mid-Flight Breakpoints Toggle */}
        <button
          onClick={onToggleBreakpoints}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
            breakpointConfig?.enabled
              ? 'bg-amber-950/60 text-amber-300 border-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
              : 'text-gray-400 bg-[#111827] hover:bg-gray-800 border-gray-700/80 hover:text-white'
          }`}
          title={breakpointConfig?.enabled ? 'Breakpoints Armed: Pausing matching calls mid-flight' : 'Breakpoints Disabled: Click to Arm'}
        >
          <PauseCircle className={`w-3.5 h-3.5 ${breakpointConfig?.enabled ? 'text-amber-400 animate-pulse' : 'text-gray-400'}`} />
          <span>Breakpoints: {breakpointConfig?.enabled ? 'ARMED' : 'OFF'}</span>
          {pendingBreakpointsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-gray-950 animate-bounce">
              {pendingBreakpointsCount} HELD
            </span>
          )}
        </button>

        {/* Chaos Mode Trigger */}
        <button
          onClick={onOpenChaosModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
            chaosConfig?.enabled
              ? 'bg-purple-950/60 text-purple-300 border-purple-600 shadow-[0_0_12px_rgba(168,85,247,0.35)]'
              : 'text-gray-400 bg-[#111827] hover:bg-gray-800 border-gray-700/80 hover:text-white'
          }`}
          title={chaosConfig?.enabled ? 'Chaos Mode ACTIVE: Injecting latency/errors' : 'Open Chaos Engineering Harness'}
        >
          <Flame className={`w-3.5 h-3.5 ${chaosConfig?.enabled ? 'text-purple-400 animate-bounce' : 'text-gray-400'}`} />
          <span>Chaos: {chaosConfig?.enabled ? 'ACTIVE' : 'CONFIG'}</span>
        </button>

        {/* Diff Arena Modal Trigger */}
        <button
          onClick={onOpenDiffModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all text-cyan-300 bg-[#111827] hover:bg-gray-800 border-cyan-800/60 hover:border-cyan-600 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
          title="Open Split-Screen DAG Diff Arena (Compare Runs & Models)"
        >
          <Scale className="w-3.5 h-3.5 text-cyan-400" />
          <span>⚖️ Diff Arena</span>
        </button>


        {/* Export .trace Button */}
        <button
          onClick={onExportTrace}
          disabled={!selectedRunId}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
            selectedRunId
              ? 'text-gray-300 bg-[#111827] hover:bg-gray-800 border-gray-700/80 hover:text-white cursor-pointer'
              : 'text-gray-600 bg-gray-900 border-gray-800 cursor-not-allowed'
          }`}
          title={selectedRunId ? `Export ${selectedRunId} as .trace.json` : 'Select a run to export'}
        >
          <Download className="w-3.5 h-3.5 text-purple-400" />
          <span>Export .trace</span>
        </button>

        {/* Simulate Multi-Agent Run Button */}
        <button
          onClick={onRunSimulation}
          disabled={isSimulating}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-md ${
            isSimulating
              ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60 cursor-not-allowed opacity-80'
              : 'bg-cyan-500 hover:bg-cyan-400 text-gray-950 shadow-[0_0_15px_rgba(6,182,212,0.4)] active:scale-95'
          }`}
        >
          {isSimulating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Simulating...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Simulate Multi-Agent Run</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
