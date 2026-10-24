'use client';

import React from 'react';
import {
  Activity,
  Scale,
  FlaskConical,
  Target,
  Flame,
  PauseCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  Radio
} from 'lucide-react';
import { Tooltip, StatusIndicator, Badge } from '@/design-system';

export type WorkspaceView = 'debugger' | 'diff' | 'experiments' | 'evaluations';

interface AppSidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenChaos: () => void;
  onOpenBreakpoints: () => void;
  onOpenCommandPalette: () => void;
  wsConnected: boolean;
  pendingBreakpointsCount?: number;
  chaosEnabled?: boolean;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeView,
  onSelectView,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenChaos,
  onOpenBreakpoints,
  onOpenCommandPalette,
  wsConnected,
  pendingBreakpointsCount = 0,
  chaosEnabled = false
}) => {
  const navItems = [
    {
      id: 'debugger' as WorkspaceView,
      label: 'Debugger',
      icon: Activity,
      shortcut: '1'
    },
    {
      id: 'diff' as WorkspaceView,
      label: 'Diff Arena',
      icon: Scale,
      shortcut: '2 / D'
    },
    {
      id: 'experiments' as WorkspaceView,
      label: 'Experiments',
      icon: FlaskConical,
      shortcut: '3 / X'
    },
    {
      id: 'evaluations' as WorkspaceView,
      label: 'Evaluations',
      icon: Target,
      shortcut: '4 / E'
    }
  ];

  return (
    <aside
      aria-label="Application Rail"
      className="w-12 h-full border-r border-[#202024] bg-[#09090b] flex flex-col justify-between items-center py-2 shrink-0 select-none z-30"
    >
      {/* Top Section: Sidebar Toggle & Navigation */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Toggle secondary sidebar */}
        <Tooltip content={isSidebarCollapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'} side="right">
          <button
            onClick={onToggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#18181c] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <div className="w-6 h-[1px] bg-[#202024]" />

        {/* Primary Workspace Views */}
        <nav className="flex flex-col items-center gap-1 w-full px-1.5" aria-label="Workspaces">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Tooltip
                key={item.id}
                content={`${item.label} (${item.shortcut})`}
                side="right"
              >
                <button
                  onClick={() => onSelectView(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-8 h-8 rounded flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c] ${
                    isActive
                      ? 'bg-[#18181c] text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141418]'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[#ea580c]" />
                  )}
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#ea580c]' : ''}`} />
                </button>
              </Tooltip>
            );
          })}
        </nav>

        <div className="w-6 h-[1px] bg-[#202024]" />

        {/* System Tools */}
        <div className="flex flex-col items-center gap-1 w-full px-1.5" aria-label="Tools">
          {/* Breakpoints */}
          <Tooltip content={`Breakpoints (B)${pendingBreakpointsCount > 0 ? ` · ${pendingBreakpointsCount} pending` : ''}`} side="right">
            <button
              onClick={onOpenBreakpoints}
              aria-label="Breakpoints configuration"
              className="relative w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
            >
              <PauseCircle className="w-4 h-4" />
              {pendingBreakpointsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
          </Tooltip>

          {/* Chaos Engine */}
          <Tooltip content={`Chaos Engine (C)${chaosEnabled ? ' · Active' : ''}`} side="right">
            <button
              onClick={onOpenChaos}
              aria-label="Chaos engine configuration"
              className="relative w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-[#141418] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
            >
              <Flame className={`w-4 h-4 ${chaosEnabled ? 'text-amber-500' : ''}`} />
              {chaosEnabled && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Bottom Section: Command Palette & Connection Status */}
      <div className="flex flex-col items-center gap-2 w-full px-1.5">
        <Tooltip content="Command Palette (⌘K)" side="right">
          <button
            onClick={onOpenCommandPalette}
            aria-label="Open command palette"
            className="w-8 h-8 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#18181c] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c]"
          >
            <Command className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content={wsConnected ? 'Telemetry Proxy: Connected' : 'Telemetry Proxy: Disconnected'} side="right">
          <div className="w-8 h-8 flex items-center justify-center" aria-label="Connection Status">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
          </div>
        </Tooltip>
      </div>
    </aside>
  );
};
