'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Workflow, ChevronDown, ChevronRight, Layers, Clock, DollarSign, Wrench, RotateCcw, AlertTriangle } from 'lucide-react';
import type { AgentSummary } from '@/lib/api';
import { Badge, Button } from '@/design-system';

export interface AgentGroupNodeData {
  agent: AgentSummary;
  isSelected?: boolean;
  onExpand?: (agentName: string) => void;
}

export const AgentGroupNode = memo(({ data }: { data: AgentGroupNodeData }) => {
  const { agent, isSelected, onExpand } = data;

  const isFailed = agent.status === 'failed' || agent.errorCount > 0;

  return (
    <div
      className={`relative w-[340px] rounded border transition-all duration-150 bg-[#111114] shadow-lg overflow-hidden font-mono ${
        isSelected
          ? 'border-zinc-200 ring-1 ring-zinc-400/50 bg-[#17171b]'
          : isFailed
          ? 'border-red-500/80 hover:border-red-400'
          : 'border-[#3f3f48] hover:border-zinc-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -top-1"
      />

      {/* Header Strip */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#202024] bg-[#18181c]">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="category"
            category="AGENT"
            size="xs"
            icon={<Workflow className="w-3 h-3 text-cyan-400" />}
          >
            AGENT GROUP
          </Badge>
          <span className="text-xs font-semibold text-zinc-100 truncate">{agent.agentName}</span>
        </div>

        <Badge
          variant={isFailed ? 'status' : 'neutral'}
          status={isFailed ? 'failed' : undefined}
          size="xs"
        >
          {agent.spanCount} spans
        </Badge>
      </div>

      {/* Group Summary Body */}
      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-200 font-semibold">{(agent.durationMs / 1000).toFixed(2)}s</span> wall time
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-200">${agent.totalCostUsd.toFixed(5)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="px-1.5 py-0.5 rounded bg-[#18181c] border border-[#2c2c32] text-zinc-300">
            {agent.llmCallCount} LLM
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[#18181c] border border-[#2c2c32] text-zinc-300">
            {agent.toolCallCount} Tools
          </span>
          {agent.retryCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 flex items-center gap-1">
              <RotateCcw className="w-2.5 h-2.5" />
              {agent.retryCount} Retries
            </span>
          )}
          {agent.errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-950/40 border border-red-800/60 text-red-300 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              {agent.errorCount} Errors
            </span>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-1 flex items-center justify-between border-t border-[#202024]">
          <span className="text-[10px] text-zinc-500">Collapsed for clarity</span>
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(agent.agentName);
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 px-2 py-0.5 rounded bg-[#18181c] border border-[#2c2c32] hover:border-cyan-500/50 transition-colors"
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
        className="!w-2.5 !h-2.5 !bg-zinc-400 !border-2 !border-[#111114] !rounded-full -bottom-1"
      />
    </div>
  );
});

AgentGroupNode.displayName = 'AgentGroupNode';
