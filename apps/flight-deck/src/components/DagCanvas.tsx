'use client';

import React, { useEffect, useCallback } from 'react';
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
import { getLayoutedElements } from '@/lib/layout';
import type { TraceSpan, TraceRun } from '@/lib/api';
import { Network, ArrowDownUp } from 'lucide-react';
import { Button, EmptyState, Badge } from '@/design-system';

interface DagCanvasProps {
  selectedRun: TraceRun | null;
  spans: TraceSpan[];
  selectedSpanId: string | null;
  onSelectSpan: (span: TraceSpan) => void;
  direction?: 'TB' | 'LR';
  onToggleDirection?: () => void;
}

const nodeTypes = {
  spanNode: SpanNode
};

function InnerDagCanvas({
  selectedRun,
  spans,
  selectedSpanId,
  onSelectSpan,
  direction = 'TB',
  onToggleDirection
}: DagCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // Recalculate layout whenever spans, selectedSpanId, or direction changes
  useEffect(() => {
    if (!spans || spans.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      spans,
      selectedSpanId,
      direction
    );

    // @ts-ignore
    setNodes(layoutedNodes);
    // @ts-ignore
    setEdges(layoutedEdges);

    // Smoothly adjust viewport
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 50);

    return () => clearTimeout(timer);
  }, [spans, selectedSpanId, direction, fitView, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      const span = node.data?.span as TraceSpan;
      if (span) {
        onSelectSpan(span);
      }
    },
    [onSelectSpan]
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

  return (
    <div className="relative flex-1 h-full bg-canvas overflow-hidden">
      {/* Canvas Top Bar Overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-auto">
        <div className="bg-[#111114]/90 backdrop-blur-sm border border-[#2c2c32] px-2.5 py-1 rounded flex items-center gap-2 text-xs font-mono shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
          <span className="text-zinc-400">DAG:</span>
          <span className="text-zinc-200 font-semibold truncate max-w-[200px]">{selectedRun.name}</span>
          <Badge variant="neutral" size="xs">
            {spans.length} {spans.length === 1 ? 'node' : 'nodes'}
          </Badge>
        </div>

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
        minZoom={0.2}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.data?.span?.span_type === 'guardrail_block') return '#ef4444';
            if (node.data?.span?.span_type === 'tool_call') return '#0284c7';
            if (node.data?.span?.cache_hit === 1) return '#7dd3fc';
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
