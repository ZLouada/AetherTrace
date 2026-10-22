import type { TraceSpan } from '../schema.js';
import type { CriticalPathAnalysis, CriticalPathSpan } from './types.js';

function parsePayload(str?: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Calculates the deterministic Critical Path of an execution DAG.
 * Finds the sequence of dependent spans that determined the run's wall-clock duration.
 * O(V + E) dynamic programming algorithm on topological DAG.
 */
export function deriveCriticalPathIntelligence(spans: TraceSpan[]): CriticalPathAnalysis {
  if (!spans || spans.length === 0) {
    return {
      durationMs: 0,
      runDurationMs: 0,
      coveragePercentage: 0,
      spanIds: [],
      spans: [],
      longestSpan: null
    };
  }

  // 1. Sort spans chronologically to guarantee topological order
  let isSorted = true;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].created_at < spans[i - 1].created_at) {
      isSorted = false;
      break;
    }
  }
  const sorted = isSorted
    ? spans
    : [...spans].sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at - b.created_at;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

  const spanById = new Map<string, TraceSpan>();
  for (const s of sorted) {
    spanById.set(s.id, s);
  }

  // Calculate run wall-clock duration
  const minTime = sorted[0].created_at;
  let maxTime = minTime;
  for (const s of sorted) {
    const end = s.created_at + Math.max(0, s.latency_ms || 0);
    if (end > maxTime) maxTime = end;
  }
  const runDurationMs = Math.max(1, maxTime - minTime);

  const N = sorted.length;
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    idToIndex.set(sorted[i].id, i);
  }

  // 2. Build DAG edges using fast index arrays
  const predIndices: number[][] = new Array(N);
  for (let i = 0; i < N; i++) predIndices[i] = [];

  // Edge a: parent_span_id -> span
  for (let i = 0; i < N; i++) {
    const pId = sorted[i].parent_span_id;
    if (pId) {
      const pIdx = idToIndex.get(pId);
      if (pIdx !== undefined) {
        predIndices[i].push(pIdx);
      }
    }
  }

  // Edge b: retry original span -> retry span
  for (let i = 0; i < N; i++) {
    const s = sorted[i];
    if (s.span_type === 'retry') {
      const payload = parsePayload(s.request_payload);
      const targetId = payload?.original_span_id;
      if (targetId) {
        const targetIdx = idToIndex.get(targetId);
        if (targetIdx !== undefined && !predIndices[i].includes(targetIdx)) {
          predIndices[i].push(targetIdx);
        }
      }
    }
  }

  // Edge c: sequential continuity between root spans within the same agent
  const lastRootIdxByAgent = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const s = sorted[i];
    if (!s.parent_span_id) {
      const agent = s.agent_name || 'default-agent';
      const lastIdx = lastRootIdxByAgent.get(agent);
      if (lastIdx !== undefined && lastIdx !== i && !predIndices[i].includes(lastIdx)) {
        if (sorted[lastIdx].created_at <= s.created_at) {
          predIndices[i].push(lastIdx);
        }
      }
      lastRootIdxByAgent.set(agent, i);
    }
  }

  // If a non-first span has 0 predecessors, link to the closest preceding span to ensure continuity
  for (let i = 1; i < N; i++) {
    if (predIndices[i].length === 0) {
      predIndices[i].push(i - 1);
    }
  }

  // 3. Dynamic Programming: Compute longest dependency path
  // dist[v] = weight(v) + max(dist[u] for u in predecessors[v])
  const dist = new Float64Array(N);
  const prev = new Int32Array(N);
  prev.fill(-1);

  for (let i = 0; i < N; i++) {
    const s = sorted[i];
    const weight = Math.max(1, s.latency_ms || 1);
    const preds = predIndices[i];

    if (preds.length === 0) {
      dist[i] = weight;
    } else {
      let maxPredDist = 0;
      let bestPred = -1;
      for (let p = 0; p < preds.length; p++) {
        const pIdx = preds[p];
        const pDist = dist[pIdx];
        if (pDist > maxPredDist) {
          maxPredDist = pDist;
          bestPred = pIdx;
        }
      }
      dist[i] = weight + maxPredDist;
      prev[i] = bestPred;
    }
  }

  // 4. Find the terminal node on the critical path
  let maxPathDist = 0;
  let endIdx = 0;

  for (let i = 0; i < N; i++) {
    if (dist[i] > maxPathDist) {
      maxPathDist = dist[i];
      endIdx = i;
    }
  }

  // 5. Backtrack to reconstruct the critical path
  const pathSpanIds: string[] = [];
  let curr = endIdx;
  const visited = new Uint8Array(N);

  while (curr >= 0 && !visited[curr]) {
    visited[curr] = 1;
    pathSpanIds.unshift(sorted[curr].id);
    curr = prev[curr];
  }

  // 6. Build CriticalPathSpan objects and summary
  const pathSpans: CriticalPathSpan[] = [];
  let criticalPathDurationMs = 0;
  let longestSpanObj: CriticalPathSpan | null = null;
  let maxSpanDuration = -1;

  for (const id of pathSpanIds) {
    const s = spanById.get(id)!;
    const dur = Math.max(0, s.latency_ms || 0);
    criticalPathDurationMs += dur;

    let label = s.model || s.span_type;
    if (s.span_type === 'tool_call') {
      const p = parsePayload(s.request_payload);
      label = `Tool: ${p?.tool_name || p?.name || 'unknown'}`;
    } else if (s.span_type === 'retry') {
      const p = parsePayload(s.request_payload);
      label = `Retry #${p?.attempt || 1}`;
    }

    const cpSpan: CriticalPathSpan = {
      spanId: s.id,
      agentName: s.agent_name || 'default-agent',
      spanType: s.span_type,
      label,
      startTime: s.created_at,
      durationMs: dur,
      percentageOfCriticalPath: 0 // Will compute below
    };

    if (dur > maxSpanDuration) {
      maxSpanDuration = dur;
      longestSpanObj = cpSpan;
    }

    pathSpans.push(cpSpan);
  }

  // Calculate percentages
  const safeTotal = Math.max(1, criticalPathDurationMs);
  for (const p of pathSpans) {
    p.percentageOfCriticalPath = Number(((p.durationMs / safeTotal) * 100).toFixed(1));
  }

  const coveragePercentage = Number(
    Math.min(100, Math.max(0, (criticalPathDurationMs / runDurationMs) * 100)).toFixed(1)
  );

  return {
    durationMs: criticalPathDurationMs,
    runDurationMs,
    coveragePercentage,
    spanIds: pathSpanIds,
    spans: pathSpans,
    longestSpan: longestSpanObj
  };
}
