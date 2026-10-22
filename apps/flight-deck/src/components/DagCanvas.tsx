'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant
} from '@xyflow/react';
import { SpanNode } from './nodes/SpanNode';
import { AgentGroupNode } from './nodes/AgentGroupNode';
import { getLayoutedElements } from '@/lib/layout';
import type { TraceSpan, TraceRun, ExecutionIntelligence, AgentSummary } from '@/lib/api';
import { Network, ArrowDownUp, Zap, Layers, Filter, RotateCcw, AlertTriangle, Workflow, Wrench, Bot } from 'lucide-react';
import { Button, EmptyState, Badge } from '@/design-system';

interface DagCanvasProps {
  selectedRun: TraceRun | null;
  spans: TraceSpan[];
  selectedSpanId: string | null;
  onSelectSpan: (span: TraceSpan) => void;
  direction?: 'TB' | 'LR';
  onToggleDirection?: () => void;
  intelligence?: ExecutionIntelligence | null;
  collapsedAgentNames?: Set<string>;
  onToggleCollapseAgent?: (agentName: string) => void;
  onExpandAllAgents?: () => void;
  onCollapseAllAgents?: () => void;
  isCriticalPathFocused?: boolean;
  onToggleCriticalPathFocus?: () => void;
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
  onSelectAgentGroup?: (agent: AgentSummary) => void;
}

const nodeTypes = {
  spanNode: SpanNode,
  agentGroupNode: AgentGroupNode
};

function InnerDagCanvas({
  selectedRun,
  spans,
  selectedSpanId,
  onSelectSpan,
  direction = 'TB',
  onToggleDirection,
  intelligence,
  collapsedAgentNames = new Set(),
  onToggleCollapseAgent,
  onExpandAllAgents,
  onCollapseAllAgents,
  isCriticalPathFocused = false,
  onToggleCriticalPathFocus,
  activeFilter = 'all',
  onSelectFilter,
  onSelectAgentGroup
}: DagCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // 1. Filter spans according to activeFilter
  const filteredSpans = useMemo(() => {
    if (!spans || spans.length === 0) return [];
    if (activeFilter === 'all') return spans;
    if (activeFilter === 'agents') return spans.filter((s) => s.span_type === 'agent_state');
    if (activeFilter === 'llms') return spans.filter((s) => s.span_type === 'llm_call');
    if (activeFilter === 'tools') return spans.filter((s) => s.span_type === 'tool_call');
    if (activeFilter === 'retries') return spans.filter((s) => s.span_type === 'retry');
    if (activeFilter === 'errors') {
      return spans.filter(
        (s) =>
          s.span_type === 'guardrail_block' ||
          (s.response_payload &&
            (s.response_payload.includes('"status":"error"') ||
              s.response_payload.includes('"is_error":true')))
      );
    }
    if (activeFilter === 'critical') {
      const cpSet = new Set(intelligence?.criticalPath.spanIds || []);
      return spans.filter((s) => cpSet.has(s.id));
    }
    return spans;
  }, [spans, activeFilter, intelligence]);

  // 2. Critical path set
  const criticalPathSpanIds = useMemo(() => {
    return new Set(intelligence?.criticalPath.spanIds || []);
  }, [intelligence]);

  // 3. Agent summaries map
  const agentSummariesMap = useMemo(() => {
    const map = new Map<string, AgentSummary>();
    if (intelligence?.agents) {
      for (const a of intelligence.agents) {
        map.set(a.agentName, a);
      }
    }
    return map;
  }, [intelligence]);

  // 4. Layout calculation
  useEffect(() => {
    if (!filteredSpans || filteredSpans.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      filteredSpans,
      selectedSpanId,
      {
        direction,
        criticalPathSpanIds,
        isCriticalPathFocused,
        collapsedAgentNames,
        agentSummaries: agentSummariesMap,
        onExpandAgent: onToggleCollapseAgent
      }
    );

    // @ts-ignore
    setNodes(layoutedNodes);
    // @ts-ignore
    setEdges(layoutedEdges);

    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 50);

    return () => clearTimeout(timer);
  }, [
    filteredSpans,
    selectedSpanId,
    direction,
    criticalPathSpanIds,
    isCriticalPathFocused,
    collapsedAgentNames,
    agentSummariesMap,
    onToggleCollapseAgent,
    fitView,
    setNodes,
    setEdges
  ]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      if (node.type === 'agentGroupNode') {
        const agent = node.data?.agent as AgentSummary;
        if (agent && onSelectAgentGroup) {
          onSelectAgentGroup(agent);
        }
      } else {
        const span = node.data?.span as TraceSpan;
        if (span) {
          onSelectSpan(span);
        }
      }
    },
    [onSelectSpan, onSelectAgentGroup]
  );

  if (!selectedRun) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-canvas select-none">
        <EmptyState
          icon={<Network className="w-8 h-8 text-zinc-500" />}
          title="No Trace Run Selected"
          description="Select an agent trace session from the left sidebar or click 'Simulate Run' to observe real-time execution graphs."
        />
      </div>
    );
  }

  const hasCriticalPath = Boolean(intelligence?.criticalPath && intelligence.criticalPath.spanIds.length > 0);
  const allAgentsCollapsed = Boolean(
    intelligence?.agents &&
    intelligence.agents.length > 0 &&
    intelligence.agents.every((a) => collapsedAgentNames.has(a.agentName))
  );

  return (
    <div className="relative flex-1 h-full bg-canvas overflow-hidden">
      {/* Canvas Top Bar Controls Overlay */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-[#111114]/90 backdrop-blur-sm border border-[#2c2c32] px-2.5 py-1 rounded flex items-center gap-2 text-xs font-mono shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
          <span className="text-zinc-400">DAG:</span>
          <span className="text-zinc-200 font-semibold truncate max-w-[180px]">{selectedRun.name}</span>
          <Badge variant="neutral" size="xs">
            {filteredSpans.length} {filteredSpans.length === 1 ? 'node' : 'nodes'}
          </Badge>
        </div>

        {/* Filter Bar Chips */}
        {onSelectFilter && (
          <div className="hidden lg:flex items-center bg-[#111114]/90 backdrop-blur-sm border border-[#2c2c32] p-0.5 rounded text-[11px] font-mono">
            {(['all', 'agents', 'llms', 'tools', 'retries', 'errors'] as const).map((f) => (
              <button
                key={f}
                onClick={() => onSelectFilter(f)}
                className={`px-2 py-0.5 rounded uppercase font-medium transition-colors ${
                  activeFilter === f
                    ? 'bg-[#27272a] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Critical Path Toggle */}
        {hasCriticalPath && onToggleCriticalPathFocus && (
          <Button
            variant={isCriticalPathFocused ? 'primary' : 'secondary'}
            size="sm"
            onClick={onToggleCriticalPathFocus}
            icon={<Zap className={`w-3 h-3 ${isCriticalPathFocused ? 'text-amber-400 fill-amber-400' : 'text-zinc-400'}`} />}
            title="Focus Critical Path (highlight longest dependency chain)"
          >
            {isCriticalPathFocused ? 'Critical Path (Active)' : 'Critical Path'}
          </Button>
        )}

        {/* Collapse / Expand Agents Toggle */}
        {intelligence && intelligence.agents.length > 1 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={allAgentsCollapsed ? onExpandAllAgents : onCollapseAllAgents}
            icon={<Layers className="w-3 h-3 text-zinc-400" />}
            title={allAgentsCollapsed ? 'Expand all agent groups' : 'Collapse agent spans into group summaries'}
          >
            {allAgentsCollapsed ? 'Expand All' : 'Collapse Agents'}
          </Button>
        )}

        {onToggleDirection && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleDirection}
            icon={<ArrowDownUp className="w-3 h-3 text-zinc-400" />}
            title="Toggle DAG Orientation (Top-to-Bottom / Left-to-Right)"
          >
            {direction === 'TB' ? 'Vertical' : 'Horizontal'}
          </Button>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.type === 'agentGroupNode') return '#06b6d4';
            if (node.data?.span?.span_type === 'guardrail_block') return '#ef4444';
            if (node.data?.span?.span_type === 'tool_call') return '#0284c7';
            if (node.data?.span?.cache_hit === 1) return '#7dd3fc';
            if (node.data?.isCriticalPath) return '#f59e0b';
            return '#52525b';
          }}
          maskColor="rgba(9, 9, 11, 0.75)"
          className="!bg-[#111114] !border-[#2c2c32] !rounded"
        />
      </ReactFlow>
    </div>
  );
}

export function DagCanvas(props: DagCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerDagCanvas {...props} />
    </ReactFlowProvider>
  );
}
