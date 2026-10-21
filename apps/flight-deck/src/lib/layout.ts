import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { TraceSpan } from './api.js';

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 175;

export function getLayoutedElements(
  spans: TraceSpan[],
  selectedSpanId?: string | null,
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  if (!spans || spans.length === 0) {
    return { nodes: [], edges: [] };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 70,
    nodesep: 50,
    marginx: 40,
    marginy: 40
  });

  // Construct edges: if parent_span_id is provided, connect from parent -> span.
  // If parent_span_id is null and this is not the root span (index > 0), fallback to chaining from preceding span.
  const spanIdSet = new Set(spans.map((s) => s.id));
  const rawEdges: { source: string; target: string; isBranch: boolean }[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.parent_span_id && spanIdSet.has(span.parent_span_id)) {
      rawEdges.push({
        source: span.parent_span_id,
        target: span.id,
        isBranch: true
      });
    } else if (i > 0) {
      // Connect to immediate prior span for sequential execution continuity
      rawEdges.push({
        source: spans[i - 1].id,
        target: span.id,
        isBranch: false
      });
    }
  }

  const nodes: Node[] = spans.map((span) => ({
    id: span.id,
    type: 'spanNode',
    data: {
      span,
      isSelected: span.id === selectedSpanId
    },
    position: { x: 0, y: 0 }
  }));

  const edges: Edge[] = rawEdges.map((e, idx) => ({
    id: `e-${e.source}-${e.target}-${idx}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: true,
    style: {
      stroke: e.isBranch ? '#38bdf8' : '#4b5563',
      strokeWidth: 2
    }
  }));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}
