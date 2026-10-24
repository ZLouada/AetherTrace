'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Workflow,
  ChevronRight,
  Clock,
  DollarSign,
  RotateCcw,
  AlertTriangle,
  Cpu,
  Wrench
} from 'lucide-react';
import type { AgentSummary } from '@/lib/api';
import { Badge } from '@/design-system';

export interface AgentGroupNodeData {
  agent: AgentSummary;
  isSelected?: boolean;
  isHovered?: boolean;
  onExpand?: (agentName: string) => void;
}

export const AgentGroupNode = memo(({ data }: { data: AgentGroupNodeData }) => {
  const { agent, isSelected, isHovered, onExpand } = data;

  const isFailed = agent.status === 'failed' || agent.errorCount > 0;

  const containerClasses = [
    'relative w-[320px] rounded border transition-all duration-150 bg-[#111114] shadow-lg overflow-hidden font-sans select-none',
    isSelected
      ? 'border-[#ea580c] ring-2 ring-[#ea580c] bg-[#18181c] shadow-[0_0_18px_rgba(234,88,12,0.25)]'
      : isHovered
      ? 'border-[#ea580c] ring-1 ring-[#ea580c]/60 bg-[#16161a]'
      : isFailed
      ? 'border-rose-500/80 hover:border-rose-400 bg-[#161012]'
      : 'border-[#27272a] hover:border-zinc-500'
  ].join(' ');

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-label={`Agent Group ${agent.agentName}, ${agent.spanCount} spans, ${(agent.durationMs / 1000).toFixed(2)}s`}
      tabIndex={0}
      className={containerClasses}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -top-1"
      />

      {/* Header Strip */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#202024] bg-[#16161a]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isFailed ? 'bg-rose-500' : 'bg-emerald-400'
            }`}
          />
          <Badge
            variant="category"
            category="AGENT"
            size="xs"
            icon={<Workflow className="w-3 h-3 text-cyan-400" />}
          >
            AGENT
          </Badge>
          <span className="text-xs font-semibold text-zinc-100 truncate">
            {agent.agentName}
          </span>
        </div>

        <Badge
          variant={isFailed ? 'status' : 'neutral'}
          status={isFailed ? 'failed' : undefined}
          size="xs"
        >
          {agent.spanCount} {agent.spanCount === 1 ? 'span' : 'spans'}
        </Badge>
      </div>

      {/* Group Summary Body */}
      <div className="p-3 space-y-2.5 font-mono">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-200 font-semibold">
              {(agent.durationMs / 1000).toFixed(2)}s
            </span>
            <span className="text-zinc-400 text-[10px]">wall</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-200 font-semibold">
              ${agent.totalCostUsd.toFixed(5)}
            </span>
          </div>
        </div>

        {/* Breakdown chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="px-1.5 py-0.5 rounded bg-[#16161a] border border-[#27272a] text-zinc-300 flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5 text-zinc-400" />
            {agent.llmCallCount} LLM
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[#16161a] border border-[#27272a] text-zinc-300 flex items-center gap-1">
            <Wrench className="w-2.5 h-2.5 text-zinc-400" />
            {agent.toolCallCount} Tool
          </span>
          {agent.retryCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 flex items-center gap-1">
              <RotateCcw className="w-2.5 h-2.5" />
              {agent.retryCount} Retries
            </span>
          )}
          {agent.errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              {agent.errorCount} Errors
            </span>
          )}
        </div>

        {/* Action Button: Expand Spans */}
        <div className="pt-1.5 flex items-center justify-between border-t border-[#202024]">
          <span className="text-[10px] text-zinc-400 font-sans">
            Collapsed group
          </span>
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(agent.agentName);
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 px-2 py-0.5 rounded bg-[#18181c] border border-[#27272a] hover:border-cyan-500/50 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3 h-3" />
              Expand Spans
            </button>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -bottom-1"
      />
    </div>
  );
});

AgentGroupNode.displayName = 'AgentGroupNode';
