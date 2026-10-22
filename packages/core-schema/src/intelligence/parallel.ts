import type { TraceSpan } from '../schema.js';
import type { ParallelGroup, ParallelBranch } from './types.js';

/**
 * Detects parallel execution branches using actual execution timestamps and DAG lineage.
 * Does not infer parallelism purely based on sibling structure; requires temporal overlap.
 */
export function deriveParallelIntelligence(spans: TraceSpan[]): ParallelGroup[] {
  if (!spans || spans.length < 2) return [];

  const spanById = new Map<string, TraceSpan>();
  const childrenMap = new Map<string | null, TraceSpan[]>();

  for (const s of spans) {
    spanById.set(s.id, s);
    const pId = s.parent_span_id || null;
    if (!childrenMap.has(pId)) {
      childrenMap.set(pId, []);
    }
    childrenMap.get(pId)!.push(s);
  }

  // Bottom-up iterative computation of subtree intervals: O(N) zero-recursion
  const subtreeTiming = new Map<string, { minStart: number; maxEnd: number; hasError: boolean }>();
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    subtreeTiming.set(s.id, {
      minStart: s.created_at,
      maxEnd: s.created_at + Math.max(0, s.latency_ms || 0),
      hasError: s.span_type === 'guardrail_block'
    });
  }

  // Determine chronological order to traverse children before parents
  let isSorted = true;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].created_at < spans[i - 1].created_at) {
      isSorted = false;
      break;
    }
  }
  const chronSpans = isSorted ? spans : [...spans].sort((a, b) => a.created_at - b.created_at);

  // In reverse chronological order, children always precede their parents in execution trees.
  for (let i = chronSpans.length - 1; i >= 0; i--) {
    const s = chronSpans[i];
    if (s.parent_span_id) {
      const pInfo = subtreeTiming.get(s.parent_span_id);
      const sInfo = subtreeTiming.get(s.id);
      if (pInfo && sInfo) {
        if (sInfo.minStart < pInfo.minStart) pInfo.minStart = sInfo.minStart;
        if (sInfo.maxEnd > pInfo.maxEnd) pInfo.maxEnd = sInfo.maxEnd;
        if (sInfo.hasError) pInfo.hasError = true;
      }
    }
  }

  function getSubtreeTiming(rootSpanId: string): { minStart: number; maxEnd: number; hasError: boolean } {
    return subtreeTiming.get(rootSpanId) || { minStart: 0, maxEnd: 0, hasError: false };
  }

  // Collect descendant IDs only when an actual parallel group is confirmed
  function collectDescendantSpanIds(rootSpanId: string): string[] {
    const result: string[] = [rootSpanId];
    const queue: string[] = [rootSpanId];
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const children = childrenMap.get(curr);
      if (children) {
        for (let c = 0; c < children.length; c++) {
          const chId = children[c].id;
          result.push(chId);
          queue.push(chId);
        }
      }
    }
    return result;
  }

  const parallelGroups: ParallelGroup[] = [];
  const processedParents = new Set<string | null>();

  // Check each parent that has 2 or more direct children
  for (const [parentId, siblings] of childrenMap.entries()) {
    if (siblings.length < 2) continue;
    if (processedParents.has(parentId)) continue;
    processedParents.add(parentId);

    // Compute time window for each branch starting at sibling in O(1) via cache
    const branchesData: Array<{
      sibling: TraceSpan;
      startTime: number;
      endTime: number;
      durationMs: number;
      hasError: boolean;
    }> = [];

    for (const sib of siblings) {
      const info = getSubtreeTiming(sib.id);
      branchesData.push({
        sibling: sib,
        startTime: info.minStart,
        endTime: info.maxEnd,
        durationMs: Math.max(0, info.maxEnd - info.minStart),
        hasError: info.hasError
      });
    }

    // Sort branches by startTime to enable O(B) early-break sweep line
    branchesData.sort((a, b) => a.startTime - b.startTime);

    // Determine which branches actually overlap temporally (simultaneous execution)
    // Two intervals [s1, e1] and [s2, e2] overlap concurrently iff max(s1, s2) < min(e1, e2)
    const hasOverlap = new Uint8Array(branchesData.length);

    for (let i = 0; i < branchesData.length; i++) {
      const b1 = branchesData[i];
      for (let j = i + 1; j < branchesData.length; j++) {
        const b2 = branchesData[j];
        if (b2.startTime >= b1.endTime) {
          break; // Since sorted by startTime, all subsequent branches start after b1 finished
        }
        hasOverlap[i] = 1;
        hasOverlap[j] = 1;
      }
    }

    const overlappingBranches: typeof branchesData = [];
    for (let i = 0; i < branchesData.length; i++) {
      if (hasOverlap[i]) {
        overlappingBranches.push(branchesData[i]);
      }
    }

    if (overlappingBranches.length < 2) continue;

    // Construct ParallelGroup
    let minGroupStart = Infinity;
    let maxGroupEnd = -Infinity;
    let longestBranchMs = -Infinity;
    let shortestBranchMs = Infinity;
    let slowestIdx = 0;
    let totalSpans = 0;

    const branches: ParallelBranch[] = [];

    for (let idx = 0; idx < overlappingBranches.length; idx++) {
      const b = overlappingBranches[idx];
      const descIds = collectDescendantSpanIds(b.sibling.id);
      totalSpans += descIds.length;

      if (b.startTime < minGroupStart) minGroupStart = b.startTime;
      if (b.endTime > maxGroupEnd) maxGroupEnd = b.endTime;

      if (b.durationMs > longestBranchMs) {
        longestBranchMs = b.durationMs;
        slowestIdx = idx;
      }
      if (b.durationMs < shortestBranchMs) {
        shortestBranchMs = b.durationMs;
      }

      branches.push({
        branchIndex: idx,
        rootSpanId: b.sibling.id,
        agentName: b.sibling.agent_name || 'default-agent',
        spanIds: descIds,
        durationMs: b.durationMs,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.hasError ? 'failed' : 'completed'
      });
    }

    const wallClockDurationMs = Math.max(0, maxGroupEnd - minGroupStart);

    // Look for a synchronization span: a span that starts after all branches complete
    let synchronizationSpanId: string | null = null;
    const groupSpanIds = new Set<string>();
    for (let bIdx = 0; bIdx < branches.length; bIdx++) {
      const sIds = branches[bIdx].spanIds;
      for (let sIdx = 0; sIdx < sIds.length; sIdx++) {
        groupSpanIds.add(sIds[sIdx]);
      }
    }
    for (let sIdx = 0; sIdx < spans.length; sIdx++) {
      const s = spans[sIdx];
      if (s.created_at >= maxGroupEnd && !groupSpanIds.has(s.id)) {
        synchronizationSpanId = s.id;
        break;
      }
    }

    parallelGroups.push({
      id: `pg_${parentId || 'root'}_${minGroupStart}`,
      parentSpanId: parentId,
      branches,
      branchCount: branches.length,
      totalSpanCount: totalSpans,
      wallClockDurationMs,
      longestBranchDurationMs: longestBranchMs,
      shortestBranchDurationMs: shortestBranchMs,
      slowestBranchIndex: slowestIdx,
      synchronizationSpanId
    });
  }

  return parallelGroups;
}
