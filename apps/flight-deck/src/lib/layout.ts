import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { TraceSpan, AgentSummary } from '@/lib/api';

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 175;
export const COMPACT_NODE_WIDTH = 220;
export const COMPACT_NODE_HEIGHT = 48;
export const GROUP_NODE_WIDTH = 320;
export const GROUP_NODE_HEIGHT = 150;

export interface LayoutOptions {
  direction?: 'TB' | 'LR';
  density?: 'compact' | 'detailed';
  criticalPathSpanIds?: Set<string>;
  isCriticalPathFocused?: boolean;
  collapsedAgentNames?: Set<string>;
  agentSummaries?: Map<string, AgentSummary>;
  onExpandAgent?: (agentName: string) => void;
  pinnedSpanIds?: Set<string>;
  selectedSpanIds?: Set<string>;
  hoveredSpanId?: string | null;
}

export function getLayoutedElements(
  spans: TraceSpan[],
  selectedSpanId?: string | null,
  options: 'TB' | 'LR' | LayoutOptions = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  if (!spans || spans.length === 0) {
    return { nodes: [], edges: [] };
  }

  const opts: LayoutOptions =
    typeof options === 'string'
      ? { direction: options }
      : options || { direction: 'TB' };

  const direction = opts.direction || 'TB';
  const density = opts.density || 'detailed';
  const isCompact = density === 'compact';
  const criticalPathSpanIds = opts.criticalPathSpanIds;
  const isCriticalPathFocused = Boolean(opts.isCriticalPathFocused);
  const collapsedAgentNames = opts.collapsedAgentNames || new Set<string>();
  const agentSummaries = opts.agentSummaries || new Map<string, AgentSummary>();
  const pinnedSpanIds = opts.pinnedSpanIds;
  const selectedSpanIds = opts.selectedSpanIds;
  const hoveredSpanId = opts.hoveredSpanId;

  const nodeWidth = isCompact ? COMPACT_NODE_WIDTH : NODE_WIDTH;
  const nodeHeight = isCompact ? COMPACT_NODE_HEIGHT : NODE_HEIGHT;

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: isCompact ? 50 : 70,
    nodesep: isCompact ? 30 : 50,
    marginx: 40,
    marginy: 40
  });

  // Map each span ID to its node ID (which might be a group ID if the agent is collapsed)
  const spanToNodeId = new Map<string, string>();
  const renderedNodesMap = new Map<string, Node>();
  const renderedSpans: TraceSpan[] = [];

  for (const s of spans) {
    const agent = s.agent_name || 'default-agent';
    if (collapsedAgentNames.has(agent)) {
      const groupId = `group_${agent}`;
      spanToNodeId.set(s.id, groupId);

      if (!renderedNodesMap.has(groupId)) {
        const summary = agentSummaries.get(agent) || {
          agentName: agent,
          parentAgentName: null,
          depth: 0,
          spanCount: 1,
          durationMs: 0,
          status: 'completed',
          startTime: s.created_at,
          endTime: s.created_at,
          childAgentCount: 0,
          toolCallCount: 0,
          llmCallCount: 0,
          retryCount: 0,
          errorCount: 0,
          totalCostUsd: 0,
          totalTokens: 0,
          spanIds: [s.id]
        };

        renderedNodesMap.set(groupId, {
          id: groupId,
          type: 'agentGroupNode',
          data: {
            agent: summary,
            isSelected: false,
            isHovered: false,
            onExpand: opts.onExpandAgent
          },
          position: { x: 0, y: 0 }
        });
      }
    } else {
      spanToNodeId.set(s.id, s.id);
      renderedSpans.push(s);
      renderedNodesMap.set(s.id, {
        id: s.id,
        type: 'spanNode',
        data: {
          span: s,
          isSelected: s.id === selectedSpanId,
          isMultiSelected: Boolean(selectedSpanIds && selectedSpanIds.has(s.id)),
          isPinned: Boolean(pinnedSpanIds && pinnedSpanIds.has(s.id)),
          isCriticalPath: criticalPathSpanIds?.has(s.id),
          isSubdued: isCriticalPathFocused && !criticalPathSpanIds?.has(s.id),
          isHovered: Boolean(hoveredSpanId && s.id === hoveredSpanId),
          density
        },
        position: { x: 0, y: 0 }
      });
    }
  }

  // Construct raw edges and map to effective node IDs
  const rawEdgesSet = new Set<string>();
  const rawEdges: { source: string; target: string; isBranch: boolean; isCritical: boolean }[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const targetNodeId = spanToNodeId.get(span.id)!;

    let sourceSpanId: string | null = null;
    let isBranch = false;

    if (span.parent_span_id && spanToNodeId.has(span.parent_span_id)) {
      sourceSpanId = span.parent_span_id;
      isBranch = true;
    } else if (i > 0) {
      sourceSpanId = spans[i - 1].id;
      isBranch = false;
    }

    if (sourceSpanId) {
      const sourceNodeId = spanToNodeId.get(sourceSpanId)!;
      // Do not create self-loops inside a collapsed group
      if (sourceNodeId !== targetNodeId) {
        const edgeKey = `${sourceNodeId}->${targetNodeId}`;
        if (!rawEdgesSet.has(edgeKey)) {
          rawEdgesSet.add(edgeKey);
          const isCritical = Boolean(
            criticalPathSpanIds?.has(sourceSpanId) && criticalPathSpanIds?.has(span.id)
          );
          rawEdges.push({
            source: sourceNodeId,
            target: targetNodeId,
            isBranch,
            isCritical
          });
        }
      }
    }
  }

  const nodes = Array.from(renderedNodesMap.values());

  const edges: Edge[] = rawEdges.map((e, idx) => {
    let stroke = e.isBranch ? '#ffffff' : '#52525b';
    let strokeWidth = 2;
    let opacity = 1.0;

    if (e.isCritical) {
      stroke = '#ea580c';
      strokeWidth = 3;
    } else if (isCriticalPathFocused) {
      stroke = '#27272a';
      strokeWidth = 1;
      opacity = 0.25;
    }

    return {
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.isCritical || e.isBranch,
      style: {
        stroke,
        strokeWidth,
        opacity
      }
    };
  });

  nodes.forEach((node) => {
    const isGroup = node.type === 'agentGroupNode';
    const w = isGroup ? GROUP_NODE_WIDTH : nodeWidth;
    const h = isGroup ? GROUP_NODE_HEIGHT : nodeHeight;
    dagreGraph.setNode(node.id, { width: w, height: h });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    const isGroup = node.type === 'agentGroupNode';
    const w = isGroup ? GROUP_NODE_WIDTH : nodeWidth;
    const h = isGroup ? GROUP_NODE_HEIGHT : nodeHeight;
    return {
      ...node,
      position: {
        x: (pos?.x ?? 0) - w / 2,
        y: (pos?.y ?? 0) - h / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}
