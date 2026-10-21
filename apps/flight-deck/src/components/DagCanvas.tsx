'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
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
import { Network, Sparkles, ArrowDownUp, RefreshCw } from 'lucide-react';

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
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-canvas p-6 select-none">
        <div className="w-14 h-14 rounded-2xl bg-[#111827] border border-gray-800 flex items-center justify-center mb-4 shadow-xl">
          <Network className="w-7 h-7 text-cyan-400 opacity-60" />
        </div>
        <h3 className="text-sm font-bold text-gray-300 mb-1 font-mono">No Trace Run Selected</h3>
        <p className="text-xs text-gray-500 max-w-sm text-center leading-relaxed">
          Select an agent trace session from the left sidebar or click &quot;Simulate Multi-Agent Run&quot; above to watch real-time execution DAGs.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 h-full bg-canvas overflow-hidden">
      {/* Canvas Top Bar Overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-auto">
        <div className="bg-[#111827]/90 backdrop-blur-md border border-gray-800 px-3 py-1.5 rounded-lg flex items-center gap-3 text-xs shadow-lg">
          <span className="font-semibold text-gray-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            DAG View: <span className="text-cyan-300 font-mono">{selectedRun.name}</span>
          </span>
          <span className="text-gray-500 font-mono text-[11px]">
            {spans.length} {spans.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>

        {onToggleDirection && (
          <button
            onClick={onToggleDirection}
            className="bg-[#111827]/90 backdrop-blur-md border border-gray-800 hover:border-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs shadow-lg transition-colors font-mono"
            title="Toggle DAG Orientation (Top-to-Bottom / Left-to-Right)"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-gray-400" />
            <span>{direction === 'TB' ? 'Vertical' : 'Horizontal'}</span>
          </button>
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.data?.span?.span_type === 'guardrail_block') return '#ef4444';
            if (node.data?.span?.cache_hit === 1) return '#10b981';
            return '#06b6d4';
          }}
          maskColor="rgba(9, 13, 22, 0.75)"
          className="!bg-[#111827] !border !border-gray-800 !rounded-lg overflow-hidden !shadow-xl"
          position="bottom-right"
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
