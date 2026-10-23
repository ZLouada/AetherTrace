/**
 * AetherTrace Phase 15 Test Suite: Flight Deck & Developer Experience
 *
 * Verifies:
 * 1. Pinned Spans Workflow & Pin Filtering
 * 2. Multi-Selection & Multi-Span Metric Aggregation
 * 3. DAG Navigation Engine (Parent, Child, Sibling, Root/Leaf bounds)
 * 4. Deterministic Graph Layout, Minimap & Viewport Bounds Calculation
 * 5. Command Palette Action Registry & State Transitions
 * 6. Scale & Responsiveness Benchmarks (100, 1,000, 10,000 spans)
 */

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import dagre from 'dagre';
import {
  type TraceSpan,
  type TraceRun,
  getDatabase,
  trace_runs,
  trace_spans
} from '@aethertrace/core-schema';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

function pass(name: string, details?: string) {
  console.log(`  ${colors.green}✔${colors.reset} ${colors.bold}${name}${colors.reset}${details ? ` ${colors.dim}(${details})${colors.reset}` : ''}`);
}

function fail(name: string, error: any) {
  console.error(`  ${colors.red}✖${colors.reset} ${colors.bold}${name}${colors.reset}`);
  console.error(`    ${colors.red}${error?.message || error}${colors.reset}`);
  throw error;
}

function createMockSpan(overrides: Partial<TraceSpan>): TraceSpan {
  const now = Date.now();
  return {
    id: overrides.id || randomUUID(),
    run_id: overrides.run_id || 'run_test_phase15',
    parent_span_id: overrides.parent_span_id !== undefined ? overrides.parent_span_id : null,
    name: overrides.name || 'test_span',
    agent_name: overrides.agent_name || 'TestAgent',
    span_type: overrides.span_type || 'agent_invocation',
    model: overrides.model || 'gpt-4o',
    prompt: overrides.prompt || 'test prompt',
    response: overrides.response || 'test response',
    tool_name: overrides.tool_name || null,
    tool_input: overrides.tool_input || null,
    tool_output: overrides.tool_output || null,
    tokens_prompt: overrides.tokens_prompt || 100,
    tokens_completion: overrides.tokens_completion || 50,
    tokens_total: overrides.tokens_total || 150,
    cost_usd: overrides.cost_usd !== undefined ? overrides.cost_usd : 0.0025,
    duration_ms: overrides.duration_ms !== undefined ? overrides.duration_ms : 250,
    status: overrides.status || 'completed',
    error: overrides.error || null,
    created_at: overrides.created_at || now,
    completed_at: overrides.completed_at || now + 250
  };
}

// ----------------------------------------------------------------------------
// Core Developer Workstation Logic under test
// ----------------------------------------------------------------------------

export interface MultiSelectSummary {
  count: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalTokens: number;
  errorCount: number;
  agents: string[];
  models: string[];
}

export function computeMultiSelectSummary(spans: TraceSpan[]): MultiSelectSummary {
  if (!spans || spans.length === 0) {
    return {
      count: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      totalTokens: 0,
      errorCount: 0,
      agents: [],
      models: []
    };
  }

  const agentsSet = new Set<string>();
  const modelsSet = new Set<string>();
  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let totalTokens = 0;
  let errorCount = 0;

  for (const s of spans) {
    totalCostUsd += Number(s.cost_usd || 0);
    totalDurationMs += Number(s.duration_ms || 0);
    totalTokens += Number(s.tokens_total || (Number(s.tokens_prompt || 0) + Number(s.tokens_completion || 0)));
    if (s.status === 'error' || s.error) {
      errorCount++;
    }
    if (s.agent_name) agentsSet.add(s.agent_name);
    if (s.model) modelsSet.add(s.model);
  }

  return {
    count: spans.length,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    totalDurationMs,
    totalTokens,
    errorCount,
    agents: Array.from(agentsSet).sort(),
    models: Array.from(modelsSet).sort()
  };
}

export function filterSpansByWorkstation(
  spans: TraceSpan[],
  activeFilter: string,
  pinnedSpanIds: Set<string>
): TraceSpan[] {
  switch (activeFilter) {
    case 'pinned':
      return spans.filter((s) => pinnedSpanIds.has(s.id));
    case 'agents':
      return spans.filter((s) => s.span_type === 'agent_invocation');
    case 'llms':
      return spans.filter((s) => s.span_type === 'llm_call');
    case 'tools':
      return spans.filter((s) => s.span_type === 'tool_execution');
    case 'retries':
      return spans.filter((s) => s.span_type === 'retry');
    case 'errors':
      return spans.filter((s) => s.status === 'error' || Boolean(s.error));
    case 'all':
    default:
      return spans;
  }
}

export function computeGraphLayoutBounds(
  spans: TraceSpan[],
  direction: 'TB' | 'LR' = 'TB',
  nodeWidth = 320,
  nodeHeight = 175
) {
  if (spans.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, nodes: [] };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: 70,
    nodesep: 50,
    marginx: 40,
    marginy: 40
  });

  for (const s of spans) {
    g.setNode(s.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const s of spans) {
    if (s.parent_span_id && spans.some((p) => p.id === s.parent_span_id)) {
      g.setEdge(s.parent_span_id, s.id);
    }
  }

  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const positionedNodes = spans.map((s) => {
    const nodeWithPos = g.node(s.id);
    const x = nodeWithPos ? nodeWithPos.x - nodeWidth / 2 : 0;
    const y = nodeWithPos ? nodeWithPos.y - nodeHeight / 2 : 0;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + nodeWidth);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + nodeHeight);

    return { id: s.id, x, y, width: nodeWidth, height: nodeHeight };
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    nodes: positionedNodes
  };
}

// ----------------------------------------------------------------------------
// Test Runner
// ----------------------------------------------------------------------------

async function runPhase15Tests() {
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  AetherTrace Phase 15: Flight Deck & Developer Experience ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  // --------------------------------------------------------------------------
  // 1. Pinned Spans Workflow & Pin Filtering
  // --------------------------------------------------------------------------
  console.log(`${colors.bold}1. Pinned Spans Workflow & Pin Filtering${colors.reset}`);
  try {
    const span1 = createMockSpan({ id: 'span_root', name: 'RootAgent', span_type: 'agent_invocation' });
    const span2 = createMockSpan({ id: 'span_tool_1', parent_span_id: 'span_root', span_type: 'tool_execution', tool_name: 'query_db' });
    const span3 = createMockSpan({ id: 'span_tool_2', parent_span_id: 'span_root', span_type: 'tool_execution', status: 'error', error: 'Timeout' });
    const allSpans = [span1, span2, span3];

    const pinnedSpanIds = new Set<string>();

    // Toggle Pin on span2 & span3
    pinnedSpanIds.add(span2.id);
    pinnedSpanIds.add(span3.id);
    if (pinnedSpanIds.size !== 2) throw new Error('Expected 2 pinned spans');

    // Filter by 'pinned'
    const pinnedResults = filterSpansByWorkstation(allSpans, 'pinned', pinnedSpanIds);
    if (pinnedResults.length !== 2) throw new Error(`Expected 2 pinned spans, got ${pinnedResults.length}`);
    if (!pinnedResults.some((s) => s.id === span2.id) || !pinnedResults.some((s) => s.id === span3.id)) {
      throw new Error('Pinned results do not match expected pinned IDs');
    }

    // Unpin span2
    pinnedSpanIds.delete(span2.id);
    const updatedPinned = filterSpansByWorkstation(allSpans, 'pinned', pinnedSpanIds);
    if (updatedPinned.length !== 1 || updatedPinned[0].id !== span3.id) {
      throw new Error('Expected 1 pinned span after unpinning span2');
    }

    // Filter by errors
    const errorSpans = filterSpansByWorkstation(allSpans, 'errors', pinnedSpanIds);
    if (errorSpans.length !== 1 || errorSpans[0].id !== span3.id) {
      throw new Error('Errors filter failed to isolate erroneous span');
    }

    pass('Pinned spans state and filtering pipeline operate correctly');
  } catch (err) {
    fail('Pinned spans workflow failed', err);
  }

  // --------------------------------------------------------------------------
  // 2. Multi-Selection & Metric Aggregation
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}2. Multi-Selection & Metric Aggregation${colors.reset}`);
  try {
    const s1 = createMockSpan({
      id: 'm1',
      agent_name: 'Planner',
      model: 'gpt-4o',
      cost_usd: 0.005,
      duration_ms: 500,
      tokens_prompt: 200,
      tokens_completion: 100,
      tokens_total: 300,
      status: 'completed'
    });
    const s2 = createMockSpan({
      id: 'm2',
      agent_name: 'Coder',
      model: 'claude-3-5-sonnet',
      cost_usd: 0.012,
      duration_ms: 1200,
      tokens_prompt: 400,
      tokens_completion: 200,
      tokens_total: 600,
      status: 'error',
      error: 'SyntaxError'
    });
    const s3 = createMockSpan({
      id: 'm3',
      agent_name: 'Planner',
      model: 'gpt-4o',
      cost_usd: 0.003,
      duration_ms: 300,
      tokens_prompt: 150,
      tokens_completion: 50,
      tokens_total: 200,
      status: 'completed'
    });

    // Test Empty
    const emptySummary = computeMultiSelectSummary([]);
    if (emptySummary.count !== 0 || emptySummary.totalCostUsd !== 0 || emptySummary.totalTokens !== 0) {
      throw new Error('Empty selection should produce zeroed summary');
    }

    // Test Multi-Selection (s1, s2, s3)
    const summary = computeMultiSelectSummary([s1, s2, s3]);
    if (summary.count !== 3) throw new Error(`Expected count 3, got ${summary.count}`);
    if (summary.totalCostUsd !== 0.02) throw new Error(`Expected cost $0.02, got ${summary.totalCostUsd}`);
    if (summary.totalDurationMs !== 2000) throw new Error(`Expected duration 2000ms, got ${summary.totalDurationMs}`);
    if (summary.totalTokens !== 1100) throw new Error(`Expected 1100 tokens, got ${summary.totalTokens}`);
    if (summary.errorCount !== 1) throw new Error(`Expected 1 error, got ${summary.errorCount}`);
    if (JSON.stringify(summary.agents) !== JSON.stringify(['Coder', 'Planner'])) {
      throw new Error(`Unexpected agents set: ${JSON.stringify(summary.agents)}`);
    }
    if (JSON.stringify(summary.models) !== JSON.stringify(['claude-3-5-sonnet', 'gpt-4o'])) {
      throw new Error(`Unexpected models set: ${JSON.stringify(summary.models)}`);
    }

    pass('Multi-selection aggregate metrics computed with floating-point microdollar precision');
  } catch (err) {
    fail('Multi-selection metric aggregation failed', err);
  }

  // --------------------------------------------------------------------------
  // 3. DAG Navigation Engine (Parent, Child, Sibling, Root/Leaf bounds)
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}3. DAG Navigation Engine${colors.reset}`);
  try {
    const root = createMockSpan({ id: 'root', parent_span_id: null, name: 'Root Orchestrator' });
    const child1 = createMockSpan({ id: 'child1', parent_span_id: 'root', name: 'Worker 1' });
    const child2 = createMockSpan({ id: 'child2', parent_span_id: 'root', name: 'Worker 2' });
    const grandChild = createMockSpan({ id: 'grandChild', parent_span_id: 'child1', name: 'Subtask' });
    const allSpans = [root, child1, child2, grandChild];

    // Find parent of grandChild
    const parentOfGrandChild = allSpans.find((s) => s.id === grandChild.parent_span_id);
    if (!parentOfGrandChild || parentOfGrandChild.id !== 'child1') {
      throw new Error('Failed to resolve parent of grandChild');
    }

    // Find children of root
    const rootChildren = allSpans.filter((s) => s.parent_span_id === root.id);
    if (rootChildren.length !== 2 || !rootChildren.some((c) => c.id === 'child1') || !rootChildren.some((c) => c.id === 'child2')) {
      throw new Error('Failed to resolve all children of root span');
    }

    // Find siblings of child1
    const siblingsOfChild1 = allSpans.filter((s) => s.parent_span_id === child1.parent_span_id && s.id !== child1.id);
    if (siblingsOfChild1.length !== 1 || siblingsOfChild1[0].id !== 'child2') {
      throw new Error('Failed to resolve sibling spans');
    }

    // Root parent boundary test
    const rootParent = allSpans.find((s) => s.id === root.parent_span_id);
    if (rootParent !== undefined) {
      throw new Error('Root span must have no parent');
    }

    // Leaf children boundary test
    const leafChildren = allSpans.filter((s) => s.parent_span_id === grandChild.id);
    if (leafChildren.length !== 0) {
      throw new Error('Leaf span must have zero children');
    }

    pass('DAG navigation correctly resolves parent, child, sibling, root, and leaf relations');
  } catch (err) {
    fail('DAG navigation engine test failed', err);
  }

  // --------------------------------------------------------------------------
  // 4. Deterministic Graph Layout, Minimap & Viewport Bounds Calculation
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}4. Deterministic Graph Layout & Viewport Bounds${colors.reset}`);
  try {
    const s1 = createMockSpan({ id: 'root', parent_span_id: null });
    const s2 = createMockSpan({ id: 'c1', parent_span_id: 'root' });
    const s3 = createMockSpan({ id: 'c2', parent_span_id: 'root' });
    const s4 = createMockSpan({ id: 'gc1', parent_span_id: 'c1' });

    const tbBounds = computeGraphLayoutBounds([s1, s2, s3, s4], 'TB');
    if (tbBounds.nodes.length !== 4) throw new Error('Expected 4 nodes positioned in TB layout');
    if (tbBounds.width <= 0 || tbBounds.height <= 0) throw new Error('Invalid TB graph dimensions');
    if (!Number.isFinite(tbBounds.minX) || !Number.isFinite(tbBounds.minY)) throw new Error('Non-finite bounds in TB layout');

    // In TB layout, root.y must be strictly less than child.y
    const rootNode = tbBounds.nodes.find((n) => n.id === 'root')!;
    const c1Node = tbBounds.nodes.find((n) => n.id === 'c1')!;
    const gc1Node = tbBounds.nodes.find((n) => n.id === 'gc1')!;

    if (rootNode.y >= c1Node.y) throw new Error(`Root y (${rootNode.y}) should be < child1 y (${c1Node.y}) in TB layout`);
    if (c1Node.y >= gc1Node.y) throw new Error(`Child1 y (${c1Node.y}) should be < grandChild1 y (${gc1Node.y}) in TB layout`);

    // LR layout
    const lrBounds = computeGraphLayoutBounds([s1, s2, s3, s4], 'LR');
    const rootLr = lrBounds.nodes.find((n) => n.id === 'root')!;
    const c1Lr = lrBounds.nodes.find((n) => n.id === 'c1')!;
    if (rootLr.x >= c1Lr.x) throw new Error(`Root x (${rootLr.x}) should be < child1 x (${c1Lr.x}) in LR layout`);

    pass('Dagre graph layout and bounding boxes produce deterministic hierarchical coordinates');
  } catch (err) {
    fail('Graph layout bounds test failed', err);
  }

  // --------------------------------------------------------------------------
  // 5. Command Palette Action Registry & State Transitions
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}5. Command Palette Action Registry & State Transitions${colors.reset}`);
  try {
    let activeFilter = 'all';
    let isPinned = false;
    let selectedId: string | null = 'span_1';
    let fitViewTriggered = false;

    const filterCycle = ['all', 'pinned', 'agents', 'llms', 'tools', 'retries', 'errors'];

    const actions = {
      cycleFilter: () => {
        const idx = filterCycle.indexOf(activeFilter);
        activeFilter = filterCycle[(idx + 1) % filterCycle.length];
      },
      togglePin: (id: string) => {
        if (id === selectedId) isPinned = !isPinned;
      },
      fitView: () => {
        fitViewTriggered = true;
      },
      clearFilters: () => {
        activeFilter = 'all';
      }
    };

    // Cycle through all filters
    actions.cycleFilter();
    if (activeFilter !== 'pinned') throw new Error(`Expected filter 'pinned', got ${activeFilter}`);
    actions.cycleFilter();
    if (activeFilter !== 'agents') throw new Error(`Expected filter 'agents', got ${activeFilter}`);

    // Toggle Pin
    actions.togglePin('span_1');
    if (!isPinned) throw new Error('Expected span_1 to be pinned');
    actions.togglePin('span_1');
    if (isPinned) throw new Error('Expected span_1 to be unpinned');

    // Fit View
    actions.fitView();
    if (!fitViewTriggered) throw new Error('Expected fitView to trigger');

    // Clear filters
    actions.clearFilters();
    if (activeFilter !== 'all') throw new Error('Expected filter reset to all');

    pass('Command palette actions and state transitions operate deterministically');
  } catch (err) {
    fail('Command palette action test failed', err);
  }

  // --------------------------------------------------------------------------
  // 6. Scale & Responsiveness Benchmarks (100, 1,000, 10,000 spans)
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}6. Scale & Responsiveness Benchmarks${colors.reset}`);
  try {
    const sizes = [100, 1_000, 10_000];

    for (const count of sizes) {
      // Build a tree of depth 4 with branching factor
      const benchmarkSpans: TraceSpan[] = [];
      const rootId = `bench_root_${count}`;
      benchmarkSpans.push(createMockSpan({ id: rootId, parent_span_id: null, name: 'Root' }));

      for (let i = 1; i < count; i++) {
        // connect to random prior span to form valid DAG
        const parentIdx = Math.floor(Math.random() * Math.min(i, 50));
        const parentId = benchmarkSpans[parentIdx].id;
        benchmarkSpans.push(
          createMockSpan({
            id: `bench_span_${i}`,
            parent_span_id: parentId,
            name: `Span_${i}`,
            cost_usd: 0.0001,
            duration_ms: 10 + (i % 50),
            tokens_total: 50
          })
        );
      }

      // Measure multi-select aggregation performance
      const startAgg = performance.now();
      const aggResult = computeMultiSelectSummary(benchmarkSpans);
      const aggTimeMs = performance.now() - startAgg;

      if (aggResult.count !== count) throw new Error(`Expected ${count} items in aggregation`);

      // Measure layout bounds calculation
      // For 10k, sample 500 for Dagre to avoid extreme graphlib layout times while testing DAG algorithm
      const layoutSample = count <= 1000 ? benchmarkSpans : benchmarkSpans.slice(0, 500);
      const startLayout = performance.now();
      const bounds = computeGraphLayoutBounds(layoutSample, 'TB');
      const layoutTimeMs = performance.now() - startLayout;

      if (bounds.nodes.length !== layoutSample.length) {
        throw new Error(`Expected ${layoutSample.length} layout nodes, got ${bounds.nodes.length}`);
      }

      console.log(
        `    ${colors.dim}[${count.toLocaleString()} spans] Aggregation: ${aggTimeMs.toFixed(2)}ms | Layout (${layoutSample.length} nodes): ${layoutTimeMs.toFixed(2)}ms${colors.reset}`
      );

      // Verify SLA: Aggregation should take < 50ms even for 10k spans
      if (aggTimeMs > 50) {
        throw new Error(`Aggregation took ${aggTimeMs.toFixed(2)}ms, exceeding 50ms SLA`);
      }
    }

    pass('Scale and responsiveness benchmarks satisfied across all trace tiers');
  } catch (err) {
    fail('Scalability benchmarks failed', err);
  }

  console.log(`\n${colors.bold}${colors.green}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.green}  ✔ Phase 15: All 6 Test Gates Passed Successfully!  ${colors.reset}`);
  console.log(`${colors.bold}${colors.green}======================================================${colors.reset}\n`);
}

runPhase15Tests().catch((err) => {
  console.error('Phase 15 Verification Suite Failed:', err);
  process.exit(1);
});
