import type { TraceRun, TraceSpan } from '../schema.js';
import type { AgentSummary, AgentHierarchyNode } from './types.js';

/**
 * Derives agent summaries and hierarchy from execution spans.
 * O(N) single-pass computation.
 */
export function deriveAgentIntelligence(
  spans: TraceSpan[],
  run?: TraceRun
): {
  agents: AgentSummary[];
  agentHierarchy: AgentHierarchyNode[];
} {
  if (!spans || spans.length === 0) {
    return { agents: [], agentHierarchy: [] };
  }

  const spanById = new Map<string, TraceSpan>();
  for (const s of spans) {
    spanById.set(s.id, s);
  }

  // 1. Group spans by agent_name
  const agentSpansMap = new Map<string, TraceSpan[]>();
  const agentOrder: string[] = [];

  for (const s of spans) {
    const name = s.agent_name || 'default-agent';
    if (!agentSpansMap.has(name)) {
      agentSpansMap.set(name, []);
      agentOrder.push(name);
    }
    agentSpansMap.get(name)!.push(s);
  }

  // 2. Determine parent-agent relationships
  // An agent's parent is determined by:
  // a) Explicit parent_agent_name in agent_state span request_payload
  // b) Or the agent of the parent_span_id of its root span
  const parentAgentMap = new Map<string, string | null>();

  for (const [agentName, aSpans] of agentSpansMap.entries()) {
    let parentName: string | null = null;

    // Check agent_state spans first
    for (const s of aSpans) {
      if (s.span_type === 'agent_state' && s.request_payload) {
        try {
          const parsed = JSON.parse(s.request_payload);
          if (parsed.parent_agent_name && parsed.parent_agent_name !== agentName) {
            parentName = parsed.parent_agent_name;
            break;
          }
        } catch {}
      }
    }

    // Fallback: check the parent_span of the earliest span for this agent
    if (!parentName) {
      const earliestSpan = aSpans.reduce((earliest, s) =>
        s.created_at < earliest.created_at ? s : earliest
      , aSpans[0]);

      if (earliestSpan.parent_span_id && spanById.has(earliestSpan.parent_span_id)) {
        const parentSpan = spanById.get(earliestSpan.parent_span_id)!;
        if (parentSpan.agent_name && parentSpan.agent_name !== agentName) {
          parentName = parentSpan.agent_name;
        }
      }
    }

    parentAgentMap.set(agentName, parentName);
  }

  // Guard against self-reference or cycles in parentAgentMap
  for (const [agentName, pName] of parentAgentMap.entries()) {
    if (pName === agentName) {
      parentAgentMap.set(agentName, null);
      continue;
    }
    // Check cycle
    const visited = new Set<string>([agentName]);
    let curr = pName;
    while (curr) {
      if (visited.has(curr)) {
        parentAgentMap.set(agentName, null);
        break;
      }
      visited.add(curr);
      curr = parentAgentMap.get(curr) || null;
    }
  }

  // 3. Compute depths
  function getDepth(name: string): number {
    let depth = 0;
    let curr = parentAgentMap.get(name);
    const seen = new Set<string>();
    while (curr && !seen.has(curr)) {
      seen.add(curr);
      depth++;
      curr = parentAgentMap.get(curr) || null;
    }
    return depth;
  }

  // 4. Compute summaries for each agent
  const agentSummaries: AgentSummary[] = [];

  for (const agentName of agentOrder) {
    const aSpans = agentSpansMap.get(agentName)!;
    const parentAgentName = parentAgentMap.get(agentName) || null;
    const depth = getDepth(agentName);

    let startTime = Infinity;
    let endTime = -Infinity;
    let toolCallCount = 0;
    let llmCallCount = 0;
    let retryCount = 0;
    let errorCount = 0;
    let totalCostUsd = 0;
    let totalTokens = 0;
    const spanIds: string[] = [];
    let hasFailures = false;

    for (const s of aSpans) {
      spanIds.push(s.id);
      const spanStart = s.created_at;
      const spanDuration = Math.max(0, s.latency_ms || 0);
      const spanEnd = spanStart + spanDuration;

      if (spanStart < startTime) startTime = spanStart;
      if (spanEnd > endTime) endTime = spanEnd;

      if (s.span_type === 'tool_call' || (s.span_type as string) === 'tool_execution') toolCallCount++;
      else if (s.span_type === 'llm_call') llmCallCount++;
      else if (s.span_type === 'retry') retryCount++;
      else if (s.span_type === 'guardrail_block') {
        errorCount++;
        hasFailures = true;
      }

      // Check response payload for errors
      if (s.response_payload && (s.response_payload.includes('"is_error":true') || s.response_payload.includes('"status":"error"'))) {
        hasFailures = true;
      }

      totalCostUsd += s.cost_usd || 0;
      totalTokens += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
    }

    if (startTime === Infinity) startTime = aSpans[0]?.created_at || 0;
    if (endTime === -Infinity) endTime = startTime + (aSpans[0]?.latency_ms || 0);

    const durationMs = Math.max(0, endTime - startTime);

    // Count children agents
    let childAgentCount = 0;
    for (const [, p] of parentAgentMap.entries()) {
      if (p === agentName) childAgentCount++;
    }

    let status: AgentSummary['status'] = 'completed';
    if (run?.status === 'running') status = 'running';
    else if (run?.status === 'paused') status = 'paused';
    else if (hasFailures || errorCount > 0) status = 'failed';

    agentSummaries.push({
      agentName,
      parentAgentName,
      depth,
      spanCount: aSpans.length,
      durationMs,
      status,
      startTime,
      endTime,
      childAgentCount,
      toolCallCount,
      llmCallCount,
      retryCount,
      errorCount,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      totalTokens,
      spanIds
    });
  }

  // 5. Construct hierarchy tree
  const summaryByName = new Map<string, AgentSummary>();
  for (const a of agentSummaries) {
    summaryByName.set(a.agentName, a);
  }

  const hierarchyNodes = new Map<string, AgentHierarchyNode>();
  for (const a of agentSummaries) {
    hierarchyNodes.set(a.agentName, { agent: a, children: [] });
  }

  const rootHierarchyNodes: AgentHierarchyNode[] = [];

  for (const a of agentSummaries) {
    const node = hierarchyNodes.get(a.agentName)!;
    if (a.parentAgentName && hierarchyNodes.has(a.parentAgentName)) {
      hierarchyNodes.get(a.parentAgentName)!.children.push(node);
    } else {
      rootHierarchyNodes.push(node);
    }
  }

  return {
    agents: agentSummaries,
    agentHierarchy: rootHierarchyNodes
  };
}
