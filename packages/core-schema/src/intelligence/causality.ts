import type { TraceSpan } from '../schema.js';
import type { CausalRelation, CausalRelationType, CausalClass } from './types.js';

function parsePayload(str?: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Derives deterministic causal, structural, and temporal relationships across execution spans.
 * Distinguishes true causal triggers (e.g. LLM emitting tool call, retry of error)
 * from structural nesting (parent/child) and purely temporal continuations.
 */
export function deriveCausalIntelligence(spans: TraceSpan[]): CausalRelation[] {
  if (!spans || spans.length === 0) return [];

  const relations: CausalRelation[] = [];
  const spanById = new Map<string, TraceSpan>();
  const childrenMap = new Map<string, TraceSpan[]>();

  for (const s of spans) {
    spanById.set(s.id, s);
    if (s.parent_span_id) {
      if (!childrenMap.has(s.parent_span_id)) {
        childrenMap.set(s.parent_span_id, []);
      }
      childrenMap.get(s.parent_span_id)!.push(s);
    }
  }

  // Helper to deduplicate relations
  const relationKeys = new Set<string>();
  function addRelation(
    sourceSpanId: string,
    targetSpanId: string,
    relationType: CausalRelationType,
    classification: CausalClass,
    explanation: string
  ) {
    const key = `${sourceSpanId}->${targetSpanId}:${relationType}`;
    if (!relationKeys.has(key)) {
      relationKeys.add(key);
      relations.push({
        sourceSpanId,
        targetSpanId,
        relationType,
        classification,
        explanation
      });
    }
  }

  // Pre-index tool calls by tool_call_id and id for O(1) dependency resolution
  const toolSpanByCallId = new Map<string, { id: string; toolName: string }>();
  for (const s of spans) {
    if (s.span_type === 'tool_call' || (s.span_type as string) === 'tool_execution') {
      const cReq = parsePayload(s.request_payload);
      const toolName = cReq?.tool_name || cReq?.name || s.model || 'tool';
      const callId = cReq?.tool_call_id || cReq?.id;
      if (callId) {
        toolSpanByCallId.set(callId, { id: s.id, toolName });
      }
      toolSpanByCallId.set(s.id, { id: s.id, toolName });
    }
  }

  for (const target of spans) {
    // 1. Retry relationships (CAUSAL)
    if (target.span_type === 'retry') {
      const payload = parsePayload(target.request_payload);
      const targetId = payload?.original_span_id || target.parent_span_id;
      if (targetId && spanById.has(targetId)) {
        addRelation(
          targetId,
          target.id,
          'retry_of',
          'CAUSAL',
          `Error recovery attempt #${payload?.attempt || 1} triggered by failure of preceding span`
        );
      }
    }

    // 2. Structural Parent/Child relationships
    if (target.parent_span_id && spanById.has(target.parent_span_id)) {
      const parent = spanById.get(target.parent_span_id)!;

      // LLM -> Tool Call (CAUSAL)
      if (parent.span_type === 'llm_call' && (target.span_type === 'tool_call' || (target.span_type as string) === 'tool_execution')) {
        addRelation(
          parent.id,
          target.id,
          'caused_by',
          'CAUSAL',
          `Tool call requested by LLM decision in span ${parent.id}`
        );
      }
      // Tool Call -> Next LLM (CAUSAL)
      else if ((parent.span_type === 'tool_call' || (parent.span_type as string) === 'tool_execution') && target.span_type === 'llm_call') {
        addRelation(
          parent.id,
          target.id,
          'depends_on',
          'CAUSAL',
          `LLM inference provided with tool output from span ${parent.id}`
        );
      }
      // Agent -> Sub-Agent or child span (STRUCTURAL)
      else if (parent.span_type === 'agent_state' || parent.agent_name !== target.agent_name) {
        addRelation(
          parent.id,
          target.id,
          'child_of',
          'STRUCTURAL',
          `Sub-task delegated by agent '${parent.agent_name}' to '${target.agent_name}'`
        );
      }
      // Same-agent nested execution (STRUCTURAL)
      else {
        addRelation(
          parent.id,
          target.id,
          'child_of',
          'STRUCTURAL',
          `Child execution span enclosed within parent span ${parent.id}`
        );
      }
    }

    // 3. Sequential Continuations within same agent (TEMPORAL/CAUSAL)
    // If not a child of prior span, but executed chronologically next and consumes tool output
    if (target.span_type === 'llm_call' && target.request_payload && target.request_payload.includes('tool')) {
      const req = parsePayload(target.request_payload);
      if (Array.isArray(req?.messages)) {
        for (const msg of req.messages) {
          if (msg.role === 'tool' && msg.tool_call_id) {
            const found = toolSpanByCallId.get(msg.tool_call_id);
            if (found && found.id !== target.id) {
              addRelation(
                found.id,
                target.id,
                'depends_on',
                'CAUSAL',
                `Inference consumes tool output from '${found.toolName}'`
              );
            }
          }
        }
      }
    }
  }

  // 4. Parallel sibling relationships (STRUCTURAL/TEMPORAL)
  for (const [, siblings] of childrenMap.entries()) {
    if (siblings.length >= 2) {
      let isSorted = true;
      for (let k = 1; k < siblings.length; k++) {
        if (siblings[k].created_at < siblings[k - 1].created_at) {
          isSorted = false;
          break;
        }
      }
      const sortedSibs = isSorted ? siblings : [...siblings].sort((a, b) => a.created_at - b.created_at);
      let count = 0;
      for (let i = 0; i < sortedSibs.length; i++) {
        if (count >= 50) break;
        const s1 = sortedSibs[i];
        const end1 = s1.created_at + Math.max(0, s1.latency_ms || 0);
        for (let j = i + 1; j < sortedSibs.length; j++) {
          const s2 = sortedSibs[j];
          if (s2.created_at > end1 + 50) {
            // Since sortedSibs are in ascending order of created_at, no further sibling can overlap
            break;
          }
          const end2 = s2.created_at + Math.max(0, s2.latency_ms || 0);
          const overlap = Math.max(s1.created_at, s2.created_at) <= Math.min(end1, end2) + 50;
          if (overlap) {
            addRelation(
              s1.id,
              s2.id,
              'parallel_with',
              'STRUCTURAL',
              `Concurrent sibling branch under shared parent ${s1.parent_span_id}`
            );
            count++;
            if (count >= 50) break;
          }
        }
      }
    }
  }

  return relations;
}

/**
 * Extracts the immediate causal context for a specific span.
 */
export function getSpanCausalContext(
  spanId: string,
  relations: CausalRelation[],
  spans: TraceSpan[] = []
): {
  causedBy: Array<{ spanId: string; type: CausalRelationType; label: string; classification: CausalClass }>;
  caused: Array<{ spanId: string; type: CausalRelationType; label: string; classification: CausalClass }>;
  failureOrigin?: { spanId: string; error: string };
} {
  const spanById = new Map<string, TraceSpan>();
  for (const s of spans) spanById.set(s.id, s);

  const causedBy: Array<{ spanId: string; type: CausalRelationType; label: string; classification: CausalClass }> = [];
  const caused: Array<{ spanId: string; type: CausalRelationType; label: string; classification: CausalClass }> = [];

  for (const r of relations) {
    if (r.targetSpanId === spanId) {
      const src = spanById.get(r.sourceSpanId);
      const label = src ? `${src.agent_name} (${src.model || src.span_type})` : r.sourceSpanId;
      causedBy.push({
        spanId: r.sourceSpanId,
        type: r.relationType,
        label,
        classification: r.classification
      });
    } else if (r.sourceSpanId === spanId) {
      const tgt = spanById.get(r.targetSpanId);
      const label = tgt ? `${tgt.agent_name} (${tgt.model || tgt.span_type})` : r.targetSpanId;
      caused.push({
        spanId: r.targetSpanId,
        type: r.relationType,
        label,
        classification: r.classification
      });
    }
  }

  // Check failure origin
  let failureOrigin: { spanId: string; error: string } | undefined = undefined;
  const current = spanById.get(spanId);
  if (current?.span_type === 'retry' || current?.span_type === 'guardrail_block') {
    // Check incoming retry_of or caused_by
    const errorRel = relations.find((r) => r.targetSpanId === spanId && r.relationType === 'retry_of');
    if (errorRel) {
      const failed = spanById.get(errorRel.sourceSpanId);
      failureOrigin = {
        spanId: errorRel.sourceSpanId,
        error: failed?.response_payload || 'Upstream execution failure'
      };
    }
  }

  return {
    causedBy,
    caused,
    failureOrigin
  };
}
