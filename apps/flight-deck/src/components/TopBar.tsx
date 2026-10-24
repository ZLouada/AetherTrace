'use client';

import React, { useRef } from 'react';
import {
  Activity,
  Play,
  Pause,
  Upload,
  Download,
  Clock,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  RotateCcw,
  GitFork
} from 'lucide-react';
import type { GlobalStats, BreakpointConfig, ChaosConfig, TraceRun } from '@/lib/api';
import {
  Button,
  Badge,
  StatusIndicator,
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
  onOpenExperimentStudio?: () => void;
  onOpenEvaluationPanel?: () => void;
  onOpenCommandPalette: () => void;
  onToggleTimeline: () => void;
  isTimelineOpen: boolean;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  // Workspace Shell 2.0 enhancements
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
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
  onOpenExperimentStudio,
  onOpenEvaluationPanel,
  onOpenCommandPalette,
  onToggleTimeline,
  isTimelineOpen,
  onPauseRun,
  onResumeRun,
  isSidebarCollapsed = false,
  onToggleSidebar,
  isInspectorOpen = false,
  onToggleInspector
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isReplay = Boolean(
    selectedRun &&
      (selectedRun.name.toLowerCase().includes('replay') || selectedRun.id.includes('replay'))
  );
  const isForked = Boolean(selectedRun?.parent_run_id) && !isReplay;
  const isOtel = Boolean(
    selectedRun &&
      (selectedRun.id.startsWith('run_otel_') || selectedRun.name.startsWith('otel-'))
  );

  return (
    <header className="h-12 border-b border-[#202024] bg-[#09090b] px-3 flex items-center justify-between shrink-0 select-none z-30">
      {/* Zone 1 — Workspace & Navigation Identity */}
      <div className="flex items-center gap-2.5 shrink-0">
        {onToggleSidebar && (
          <Tooltip content={isSidebarCollapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}>
            <button
              onClick={onToggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#18181c] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        )}

        <div className="flex items-center gap-1.5 font-mono">
          <Activity className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
          <span className="font-bold text-xs tracking-tight text-white">AETHERTRACE</span>
          <Badge variant="neutral" size="xs">
            DEBUGGER
          </Badge>
        </div>
      </div>

      {/* Zone 2 — Context (Breadcrumb & Run Metrics — Centered) */}
      <div className="hidden md:flex flex-1 items-center justify-center gap-2 font-mono text-xs text-zinc-400 min-w-0 px-3">
        <span className="text-zinc-400 shrink-0">Runs</span>
        <span className="text-zinc-500 shrink-0">/</span>

        {selectedRun ? (
          <div className="flex items-center gap-2 min-w-0">
            <StatusIndicator status={selectedRun.status} size="xs" />

            <span
              className="text-zinc-100 font-medium truncate max-w-[140px] lg:max-w-[240px]"
              title={selectedRun.name}
            >
              {selectedRun.name}
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

            {isOtel && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                OTel
              </span>
            )}

            <span className="text-zinc-500 hidden xl:inline">·</span>
            <span className="text-zinc-300 text-[11px] shrink-0 hidden xl:inline">
              {selectedRun.total_tokens.toLocaleString()} tok
            </span>
            <span className="text-zinc-500 hidden xl:inline">·</span>
            <span className="text-zinc-200 font-semibold text-[11px] shrink-0 hidden xl:inline">
              ${selectedRun.total_cost_usd > 0 ? selectedRun.total_cost_usd.toFixed(4) : '0.0000'}
            </span>
          </div>
        ) : (
          <span className="text-zinc-400 italic text-[11px]">No active run</span>
        )}
      </div>

      {/* Zone 3 — Actions & Utilities */}
      <div className="flex items-center gap-2 font-mono shrink-0">
        {/* Pause / Resume Controls if run is active */}
        {selectedRun?.status === 'running' && onPauseRun && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onPauseRun}
            icon={<Pause className="w-3 h-3" />}
            title="Pause run execution (Space)"
          >
            Pause
          </Button>
        )}
        {selectedRun?.status === 'paused' && onResumeRun && (
          <Button
            variant="primary"
            size="sm"
            onClick={onResumeRun}
            icon={<Play className="w-3 h-3 fill-current" />}
            title="Resume run execution (Space)"
          >
            Resume
          </Button>
        )}

        {/* Toggle Timeline */}
        <Button
          variant={isTimelineOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleTimeline}
          icon={<Clock className="w-3.5 h-3.5" />}
          title="Toggle Timeline Tray (T)"
        >
          <span className="hidden xl:inline">Timeline</span>
          <kbd className="hidden sm:inline text-[10px] text-zinc-400 ml-1">T</kbd>
        </Button>

        {/* Toggle Inspector */}
        {onToggleInspector && (
          <Button
            variant={isInspectorOpen ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onToggleInspector}
            icon={<Terminal className="w-3.5 h-3.5" />}
            title="Toggle Inspector Drawer (I)"
          >
            <span className="hidden xl:inline">Inspector</span>
            <kbd className="hidden sm:inline text-[10px] text-zinc-400 ml-1">I</kbd>
          </Button>
        )}

        {/* Simulate Multi-Agent Run CTA */}
        <Button
          variant="primary"
          size="sm"
          disabled={isSimulating}
          isLoading={isSimulating}
          onClick={onRunSimulation}
          icon={<Play className="w-3 h-3 fill-current" />}
        >
          <span className="hidden md:inline">Simulate Run</span>
        </Button>
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

        {/* Import Trace */}
        <Tooltip content="Import portable .trace.json">
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import trace"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#18181c] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c] hidden lg:flex"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {/* Export Trace */}
        <Tooltip content={selectedRun ? 'Export current trace (.trace.json)' : 'Select a run to export'}>
          <button
            onClick={onExportTrace}
            disabled={!selectedRun}
            aria-label="Export trace"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#18181c] disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c] hidden lg:flex"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {/* Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1 rounded text-[11px] font-mono text-zinc-400 bg-[#111114] hover:bg-[#18181c] hover:text-zinc-200 border border-[#2c2c32] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
          title="Open Command Palette (Cmd+K)"
        >
          <Command className="w-3 h-3 text-zinc-400" />
          <span className="hidden lg:inline">Search...</span>
          <kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-[10px] text-zinc-300 border border-[#2c2c32]">
            ⌘K
          </kbd>
        </button>

        {/* Server Connection Status */}
        <Tooltip content={wsConnected ? 'Telemetry Server: Connected (WebSocket)' : 'Telemetry Server: Offline'}>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#111114] border border-[#2c2c32]">
            <StatusIndicator status={wsConnected ? 'completed' : 'failed'} size="xs" />
            <span className="text-[10px] text-zinc-400 hidden xl:inline">
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </Tooltip>
      </div>
    </header>
  );
};
