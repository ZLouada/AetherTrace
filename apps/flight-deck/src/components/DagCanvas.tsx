'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import { SpanNode } from './nodes/SpanNode';
import { AgentGroupNode } from './nodes/AgentGroupNode';
import { getLayoutedElements } from '@/lib/layout';
import type { TraceSpan, TraceRun, ExecutionIntelligence, AgentSummary } from '@/lib/api';
import {
  Network,
  ArrowDownUp,
  Zap,
  Layers,
  Maximize2,
  Grid,
  LayoutGrid
} from 'lucide-react';
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
  pinnedSpanIds?: Set<string>;
  selectedSpanIds?: Set<string>;
  onMultiSelectSpan?: (span: TraceSpan, isShiftOrCmd: boolean) => void;
  hoveredSpanId?: string | null;
  onHoverSpan?: (spanId: string | null) => void;
  onClearSelection?: () => void;
  pendingBreakpointSpanIds?: Set<string>;
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
  onSelectAgentGroup,
  pinnedSpanIds,
  selectedSpanIds,
  onMultiSelectSpan,
  hoveredSpanId,
  onHoverSpan,
  onClearSelection,
  pendingBreakpointSpanIds
}: DagCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [density, setDensity] = useState<'compact' | 'detailed'>('detailed');
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const baseNodesRef = useRef<any[]>([]);

  // Automatic density adjustment based on graph volume
  useEffect(() => {
    if (spans.length > 20) {
      setDensity('compact');
    } else {
      setDensity('detailed');
    }
  }, [selectedRun?.id, spans.length]);

  // Handle container resizing smoothly
  useEffect(() => {
    if (!containerRef.current) return;
    let animId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, []);

  // 1. Filter spans according to activeFilter
  const filteredSpans = useMemo(() => {
    if (!spans || spans.length === 0) return [];
    if (activeFilter === 'all') return spans;
    if (activeFilter === 'pinned') return spans.filter((s) => pinnedSpanIds && pinnedSpanIds.has(s.id));
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
  }, [spans, activeFilter, intelligence, pinnedSpanIds]);

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

  // 4. Structural Layout calculation (Dagre) - Decoupled from selection/hover
  // ONLY runs when graph structure, collapsed agents, orientation, or density changes!
  useEffect(() => {
    if (!filteredSpans || filteredSpans.length === 0) {
      baseNodesRef.current = [];
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      filteredSpans,
      selectedSpanId,
      {
        direction,
        density,
        criticalPathSpanIds,
        isCriticalPathFocused,
        collapsedAgentNames,
        agentSummaries: agentSummariesMap,
        onExpandAgent: onToggleCollapseAgent,
        pinnedSpanIds,
        selectedSpanIds,
        hoveredSpanId
      }
    );

    baseNodesRef.current = layoutedNodes;
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 40);

    return () => clearTimeout(timer);
  }, [
    filteredSpans,
    direction,
    density,
    collapsedAgentNames,
    agentSummariesMap,
    onToggleCollapseAgent
  ]);

  // 5. Visual State Updates (Selection, Multi-select, Hover, Pinning, Critical Path)
  // Updates node data directly WITHOUT re-running Dagre layout and WITHOUT jumping fitView!
  useEffect(() => {
    if (baseNodesRef.current.length === 0) return;

    setNodes((prevNodes: any[]) => {
      if (!prevNodes || prevNodes.length === 0) return prevNodes;
      return prevNodes.map((node) => {
        if (node.type === 'spanNode') {
          const span = node.data?.span as TraceSpan;
          if (!span) return node;
          const isSelected = span.id === selectedSpanId;
          const isMultiSelected = Boolean(selectedSpanIds && selectedSpanIds.has(span.id));
          const isPinned = Boolean(pinnedSpanIds && pinnedSpanIds.has(span.id));
          const isCriticalPath = Boolean(criticalPathSpanIds?.has(span.id));
          const isSubdued = isCriticalPathFocused && !isCriticalPath;
          const isHovered = Boolean(hoveredSpanId && span.id === hoveredSpanId);
          const isIntercepted = Boolean(
            (pendingBreakpointSpanIds && pendingBreakpointSpanIds.has(span.id)) ||
            span.response_payload?.includes('"status":"intercepted"') ||
            span.response_payload?.includes('"status": "intercepted"') ||
            span.response_payload?.includes('"awaiting_human": true') ||
            span.response_payload?.includes('"awaiting_human":true')
          );

          if (
            node.data.isSelected === isSelected &&
            node.data.isMultiSelected === isMultiSelected &&
            node.data.isPinned === isPinned &&
            node.data.isCriticalPath === isCriticalPath &&
            node.data.isSubdued === isSubdued &&
            node.data.isHovered === isHovered &&
            node.data.isIntercepted === isIntercepted &&
            node.data.density === density
          ) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              isSelected,
              isMultiSelected,
              isPinned,
              isCriticalPath,
              isSubdued,
              isHovered,
              isIntercepted,
              density
            }
          };
        } else if (node.type === 'agentGroupNode') {
          const agent = node.data?.agent as AgentSummary;
          const isSelected = Boolean(agent && selectedSpanId && agent.spanIds?.includes(selectedSpanId));
          const isHovered = Boolean(hoveredSpanId && agent && agent.spanIds?.includes(hoveredSpanId));

          if (node.data.isSelected === isSelected && node.data.isHovered === isHovered) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              isSelected,
              isHovered
            }
          };
        }
        return node;
      });
    });
  }, [
    selectedSpanId,
    hoveredSpanId,
    pinnedSpanIds,
    selectedSpanIds,
    criticalPathSpanIds,
    isCriticalPathFocused,
    pendingBreakpointSpanIds,
    density
  ]);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: any) => {
      if (node.type === 'agentGroupNode') {
        const agent = node.data?.agent as AgentSummary;
        if (agent && onSelectAgentGroup) {
          onSelectAgentGroup(agent);
        }
      } else {
        const span = node.data?.span as TraceSpan;
        if (span) {
          if ((e.shiftKey || e.metaKey || e.ctrlKey) && onMultiSelectSpan) {
            onMultiSelectSpan(span, true);
          } else {
            onSelectSpan(span);
          }
        }
      }
    },
    [onSelectSpan, onSelectAgentGroup, onMultiSelectSpan]
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
    <div
      ref={containerRef}
      role="region"
      aria-label="Execution Graph Canvas"
      className="relative flex-1 h-full bg-canvas overflow-hidden"
    >
      {/* Canvas Top Bar Controls Overlay */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-[#111114] border border-[#27272a] px-2.5 py-1 rounded flex items-center gap-2 text-xs font-mono shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ea580c] animate-pulse" />
          <span className="text-zinc-400">DAG:</span>
          <span className="text-zinc-200 font-semibold truncate max-w-[180px]">{selectedRun.name}</span>
          <Badge variant="neutral" size="xs">
            {filteredSpans.length} {filteredSpans.length === 1 ? 'node' : 'nodes'}
          </Badge>
        </div>

        {/* Filter Bar Chips */}
        {onSelectFilter && (
          <div className="hidden lg:flex items-center bg-[#111114] border border-[#27272a] p-0.5 rounded text-[11px] font-mono">
            {(pinnedSpanIds && pinnedSpanIds.size > 0
              ? (['all', 'pinned', 'agents', 'llms', 'tools', 'retries', 'errors'] as const)
              : (['all', 'agents', 'llms', 'tools', 'retries', 'errors'] as const)
            ).map((f) => (
              <button
                key={f}
                onClick={() => onSelectFilter(f)}
                className={`px-2 py-0.5 rounded uppercase font-medium transition-colors cursor-pointer ${
                  activeFilter === f
                    ? 'bg-[#27272a] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {f === 'pinned' ? `📌 ${f} (${pinnedSpanIds?.size || 0})` : f}
              </button>
            ))}
          </div>
        )}

        {/* Density Toggle (Compact vs Detailed) */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDensity((d) => (d === 'compact' ? 'detailed' : 'compact'))}
          icon={density === 'compact' ? <LayoutGrid className="w-3 h-3 text-zinc-400" /> : <Grid className="w-3 h-3 text-zinc-400" />}
          title={`Switch graph density (currently ${density})`}
        >
          {density === 'compact' ? 'Compact' : 'Detailed'}
        </Button>

        {/* Fit View Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          icon={<Maximize2 className="w-3 h-3 text-zinc-400" />}
          title="Fit View to Screen"
        >
          Fit View
        </Button>

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
        onPaneClick={() => {
          if (onClearSelection) onClearSelection();
        }}
        onNodeMouseEnter={(_, node: any) => {
          if (node.data?.span?.id && onHoverSpan) {
            onHoverSpan(node.data.span.id);
          }
        }}
        onNodeMouseLeave={() => {
          if (onHoverSpan) {
            onHoverSpan(null);
          }
        }}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.type === 'agentGroupNode') return '#06b6d4';
            if (node.data?.span?.span_type === 'guardrail_block') return '#ef4444';
            if (node.data?.span?.span_type === 'tool_call') return '#0284c7';
            if (node.data?.span?.cache_hit === 1) return '#7dd3fc';
            if (node.data?.isCriticalPath) return '#ea580c';
            return '#52525b';
          }}
          maskColor="rgba(9, 9, 11, 0.75)"
          className="!bg-[#111114] !border-[#27272a] !rounded"
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
