'use client';

import React, { useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
  Upload,
  Download,
  PauseCircle,
  Flame,
  Scale,
  Clock,
  Command,
  Sliders,
  ShieldCheck,
  RotateCcw,
  GitFork
} from 'lucide-react';
import type { GlobalStats, BreakpointConfig, ChaosConfig, TraceRun } from '@/lib/api';
import {
  Button,
  IconButton,
  Badge,
  StatusIndicator,
  Divider,
  Tooltip
} from '@/design-system';

interface TopBarProps {
  wsConnected: boolean;
  stats: GlobalStats | null;
  onRefreshStats: () => void;
  onRunSimulation: () => Promise<void>;
  isSimulating: boolean;
  selectedRun: TraceRun | null;
  onExportTrace: () => void;
  onImportTrace: (file: File) => void;
  breakpointConfig: BreakpointConfig | null;
  pendingBreakpointsCount: number;
  onToggleBreakpoints: () => void;
  onOpenBreakpointModal?: () => void;
  chaosConfig: ChaosConfig | null;
  onOpenChaosModal: () => void;
  onOpenDiffModal: () => void;
  onOpenCommandPalette: () => void;
  onToggleTimeline: () => void;
  isTimelineOpen: boolean;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wsConnected,
  stats,
  onRefreshStats,
  onRunSimulation,
  isSimulating,
  selectedRun,
  onExportTrace,
  onImportTrace,
  breakpointConfig,
  pendingBreakpointsCount,
  onToggleBreakpoints,
  onOpenBreakpointModal,
  chaosConfig,
  onOpenChaosModal,
  onOpenDiffModal,
  onOpenCommandPalette,
  onToggleTimeline,
  isTimelineOpen,
  onPauseRun,
  onResumeRun
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isReplay = selectedRun?.name.toLowerCase().includes('replay') || selectedRun?.id.includes('replay');
  const isForked = Boolean(selectedRun?.parent_run_id) && !isReplay;

  return (
    <header className="h-12 border-b border-[#202024] bg-[#09090b] px-3 flex items-center justify-between shrink-0 select-none z-30">
      {/* Brand Identity & Command Palette Button */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#18181c] border border-[#2c2c32] flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <span className="font-bold text-xs tracking-tight text-white">AETHERTRACE</span>
            <Badge variant="neutral" size="xs">
              DEBUGGER
            </Badge>
          </div>
        </div>

        {/* Quick Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="ml-2 hidden md:flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono text-zinc-400 bg-[#111114] hover:bg-[#18181c] hover:text-zinc-200 border border-[#2c2c32] transition-colors"
          title="Open Command Palette (Cmd+K)"
        >
          <Command className="w-3 h-3 text-zinc-500" />
          <span>Search or action...</span>
          <kbd className="px-1 py-0.2 rounded bg-[#18181c] text-[10px] text-zinc-400 border border-[#2c2c32]">⌘K</kbd>
        </button>
      </div>

      {/* Selected Run Status Banner */}
      {selectedRun && (
        <div className="hidden xl:flex items-center gap-2.5 px-2.5 py-1 rounded bg-[#111114] border border-[#2c2c32] font-mono text-xs">
          <StatusIndicator status={selectedRun.status} size="xs" />

          <Divider orientation="vertical" />

          <span className="text-zinc-200 font-medium max-w-[160px] truncate" title={selectedRun.name}>
            {selectedRun.name}
          </span>

          {isReplay && (
            <Badge variant="origin" origin="cached_replay" size="xs">
              ↻ Replay
            </Badge>
          )}
          {isForked && (
            <Badge variant="origin" origin="forked" size="xs">
              🔀 Fork
            </Badge>
          )}

          <Divider orientation="vertical" />

          <span className="text-zinc-400 text-[11px]">{selectedRun.total_tokens} tok</span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-200 font-semibold text-[11px]">${selectedRun.total_cost_usd.toFixed(4)}</span>

          {/* Pause / Resume Controls */}
          {selectedRun.status === 'running' && onPauseRun && (
            <Button variant="secondary" size="xs" onClick={onPauseRun} icon={<Pause className="w-2.5 h-2.5" />}>
              Pause
            </Button>
          )}
          {selectedRun.status === 'paused' && onResumeRun && (
            <Button variant="primary" size="xs" onClick={onResumeRun} icon={<Play className="w-2.5 h-2.5 fill-current" />}>
              Resume
            </Button>
          )}
        </div>
      )}

      {/* Action Controls Strip */}
      <div className="flex items-center gap-1.5 font-mono">
        {/* Toggle Timeline */}
        <Button
          variant={isTimelineOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleTimeline}
          icon={<Clock className="w-3.5 h-3.5" />}
          title="Toggle Timeline Tray (T)"
        >
          <span className="hidden lg:inline">Timeline</span>
        </Button>

        {/* Breakpoints Toggle & Rules */}
        <div className={`flex items-center rounded border transition-colors ${
          breakpointConfig?.enabled
            ? 'bg-[#18181c] border-[#3f3f48]'
            : 'bg-[#111114] border-[#2c2c32]'
        }`}>
          <button
            onClick={onToggleBreakpoints}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-mono font-medium transition-colors ${
              breakpointConfig?.enabled ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
            title="Toggle Breakpoint Interception (B)"
          >
            <PauseCircle className={`w-3.5 h-3.5 ${breakpointConfig?.enabled ? 'text-white animate-pulse' : 'text-zinc-500'}`} />
            <span className="hidden sm:inline">Breakpoints</span>
            {pendingBreakpointsCount > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[10px] font-bold bg-white text-black animate-bounce">
                {pendingBreakpointsCount}
              </span>
            )}
          </button>
          {onOpenBreakpointModal && (
            <button
              onClick={onOpenBreakpointModal}
              className={`px-1.5 py-1 border-l text-xs transition-colors ${
                breakpointConfig?.enabled
                  ? 'border-[#2c2c32] text-zinc-300 hover:text-white hover:bg-zinc-800'
                  : 'border-[#2c2c32] text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
              title="Configure Breakpoint Conditions & Rules"
            >
              <Sliders className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Diff Arena */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenDiffModal}
          icon={<Scale className="w-3.5 h-3.5" />}
          title="Open Run Diff Arena (D)"
        >
          <span className="hidden md:inline">Diff</span>
        </Button>

        {/* Chaos Mode */}
        <Button
          variant={chaosConfig?.enabled ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onOpenChaosModal}
          icon={<Flame className={`w-3.5 h-3.5 ${chaosConfig?.enabled ? 'text-white' : 'text-zinc-500'}`} />}
          title="Open Chaos Engineering Harness (C)"
        >
          <span className="hidden md:inline">Chaos</span>
        </Button>

        {/* Security Shield Indicator */}
        <div
          className="hidden xl:flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-zinc-300 bg-[#111114] border border-[#2c2c32]"
          title="Security Engine Active: Credential Redaction, SSRF Guard, Zero-Eval Sandbox, Resource Limits"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-300" />
          <span className="hidden 2xl:inline">Shield</span>
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

        {/* Import .trace */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          icon={<Upload className="w-3.5 h-3.5 text-zinc-400" />}
          className="hidden sm:inline-flex"
          title="Import portable .trace.json"
        >
          <span className="hidden lg:inline">Import</span>
        </Button>

        {/* Export .trace */}
        <Button
          variant="secondary"
          size="sm"
          disabled={!selectedRun}
          onClick={onExportTrace}
          icon={<Download className="w-3.5 h-3.5 text-zinc-400" />}
          className="hidden sm:inline-flex"
          title="Export current trace (.trace.json)"
        >
          <span className="hidden lg:inline">Export</span>
        </Button>

        {/* Simulate Multi-Agent Run */}
        <Button
          variant="primary"
          size="sm"
          disabled={isSimulating}
          isLoading={isSimulating}
          onClick={onRunSimulation}
          icon={<Play className="w-3.5 h-3.5 fill-current" />}
        >
          <span className="hidden md:inline">Simulate Run</span>
        </Button>
      </div>
    </header>
  );
};
