import React, { useState, useEffect } from 'react';
import {
  Scale,
  ArrowRight,
  ArrowLeft,
  Zap,
  GitFork,
  ArrowDownRight,
  Coins,
  Clock,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  ArrowUpRight
} from 'lucide-react';
import {
  fetchRunDiff,
  type TraceRun,
  type RunDiffResult
} from '@/lib/api';
import {
  Modal,
  Button,
  IconButton,
  Badge,
  Select,
  EmptyState,
  LoadingState
} from '@/design-system';

interface DiffArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  runs: TraceRun[];
  initialBaseId?: string | null;
  initialTargetId?: string | null;
  embedded?: boolean;
  onSelectSpan?: (spanId: string, runId?: string) => void;
}

export const DiffArenaModal: React.FC<DiffArenaModalProps> = ({
  isOpen,
  onClose,
  runs,
  initialBaseId,
  initialTargetId,
  embedded = false,
  onSelectSpan
}) => {
  const [baseRunId, setBaseRunId] = useState<string>('');
  const [targetRunId, setTargetRunId] = useState<string>('');
  const [diffResult, setDiffResult] = useState<RunDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  // Initialize selected runs
  useEffect(() => {
    if (!isOpen) return;

    if (initialBaseId && initialTargetId) {
      setBaseRunId(initialBaseId);
      setTargetRunId(initialTargetId);
    } else if (initialTargetId) {
      const target = runs.find((r) => r.id === initialTargetId);
      if (target?.parent_run_id) {
        setBaseRunId(target.parent_run_id);
        setTargetRunId(target.id);
      } else if (runs.length >= 2) {
        setBaseRunId(runs[1].id);
        setTargetRunId(initialTargetId);
      }
    } else if (runs.length >= 2) {
      setBaseRunId(runs[1].id);
      setTargetRunId(runs[0].id);
    } else if (runs.length === 1) {
      setBaseRunId(runs[0].id);
      setTargetRunId(runs[0].id);
    }
  }, [isOpen, initialBaseId, initialTargetId, runs]);

  // Load Diff
  useEffect(() => {
    if (!isOpen || !baseRunId || !targetRunId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchRunDiff(baseRunId, targetRunId)
      .then((data) => {
        if (!isMounted) return;
        setDiffResult(data);
        // Expand fork points and modified steps by default
        const initExpanded: Record<number, boolean> = {};
        data.steps.forEach((s) => {
          if (
            s.status === 'modified_fork' ||
            s.status === 'diverged_downstream' ||
            s.status === 'modified' ||
            s.status === 'inserted' ||
            s.status === 'removed'
          ) {
            initExpanded[s.stepIndex] = true;
          }
        });
        setExpandedSteps(initExpanded);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to compute diff');
        setDiffResult(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, baseRunId, targetRunId]);

  if (!isOpen) return null;

  const handleSwap = () => {
    const temp = baseRunId;
    setBaseRunId(targetRunId);
    setTargetRunId(temp);
  };

  const toggleStepExpanded = (idx: number) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const parseJsonSafe = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const summary = diffResult?.summary;

  const runOptions = runs.map((r) => ({
    value: r.id,
    label: `${r.name} ($${r.total_cost_usd.toFixed(4)})`
  }));

  const modalFooter = (
    <div className="w-full flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-zinc-400">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Shared Cache Prefix
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Fork Point (Mutated)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          Diverged Downstream
        </span>
      </div>

      <Button variant="secondary" size="sm" onClick={onClose}>
        Back to Debugger
      </Button>
    </div>
  );

  const contentBody = (
    <div className="space-y-4">
      {/* Selector Controls Bar */}
      <div className="p-3 rounded bg-[#111114] border border-[#27272a] flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">
              Base (A):
            </span>
            <Select
              value={baseRunId}
              onChange={(e) => setBaseRunId(e.target.value)}
              selectSize="sm"
              className="max-w-[260px]"
            >
              {runOptions.map((o) => (
                <option key={`base-${o.value}`} value={o.value} className="bg-[#111114] text-zinc-200">
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <IconButton
            label="Swap Base and Target Runs"
            size="sm"
            variant="outline"
            onClick={handleSwap}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </IconButton>

          <div className="flex items-center gap-2">
            <span className="text-[#ea580c] text-[11px] uppercase tracking-wider font-semibold">
              Target (B):
            </span>
            <Select
              value={targetRunId}
              onChange={(e) => setTargetRunId(e.target.value)}
              selectSize="sm"
              className="max-w-[260px]"
            >
              {runOptions.map((o) => (
                <option key={`target-${o.value}`} value={o.value} className="bg-[#111114] text-zinc-200">
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {summary && (
          <div className="text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="text-zinc-300 font-medium truncate max-w-[160px]">{summary.baseRunName}</span>
            <span className="text-zinc-600 font-bold">➔</span>
            <span className="text-white font-semibold truncate max-w-[160px]">{summary.targetRunName}</span>
          </div>
        )}
      </div>

      {/* Executive Scorecard Banner */}
      {summary && (
        <div className="p-3.5 rounded bg-[#111114] border border-[#27272a] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Cost Delta Card */}
            <div className="p-2.5 rounded bg-[#16161a] border border-[#202024] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                  Spend Delta
                </span>
                {summary.costSavingsPercent > 0 ? (
                  <Badge variant="status" status="completed" size="xs">
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                    -{summary.costSavingsPercent}%
                  </Badge>
                ) : summary.costSavingsPercent < 0 ? (
                  <Badge variant="status" status="failed" size="xs">
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                    +{Math.abs(summary.costSavingsPercent)}%
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="xs">Equal</Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-zinc-400 text-xs line-through">
                  ${summary.baseCostUsd.toFixed(6)}
                </span>
                <ArrowRight className="w-3 h-3 text-zinc-600" />
                <span
                  className={`text-sm font-bold ${
                    summary.costSavingsPercent > 0
                      ? 'text-emerald-400'
                      : summary.costSavingsPercent < 0
                      ? 'text-rose-400'
                      : 'text-zinc-200'
                  }`}
                >
                  ${summary.targetCostUsd.toFixed(6)}
                </span>
              </div>
            </div>

            {/* Latency Delta Card */}
            <div className="p-2.5 rounded bg-[#16161a] border border-[#202024] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  Latency Delta
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    summary.latencyDeltaMs <= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {summary.latencyDeltaMs <= 0 ? `${summary.latencyDeltaMs}ms` : `+${summary.latencyDeltaMs}ms`}
                </span>
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-zinc-400 text-xs">{summary.baseLatencyMs}ms</span>
                <ArrowRight className="w-3 h-3 text-zinc-600" />
                <span className="text-sm font-bold text-zinc-200">{summary.targetLatencyMs}ms</span>
              </div>
            </div>

            {/* Token Delta Card */}
            <div className="p-2.5 rounded bg-[#16161a] border border-[#202024] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                <span className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-zinc-400" />
                  Total Tokens
                </span>
                <span className="text-[11px] text-zinc-400">
                  {summary.tokenDelta >= 0 ? `+${summary.tokenDelta}` : `${summary.tokenDelta}`}
                </span>
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-zinc-400 text-xs">{summary.baseTokens}</span>
                <ArrowRight className="w-3 h-3 text-zinc-600" />
                <span className="text-sm font-bold text-zinc-200">{summary.targetTokens}</span>
              </div>
            </div>

            {/* Lineage Classification Card */}
            <div className="p-2.5 rounded bg-[#16161a] border border-[#202024] flex flex-col justify-between">
              <span className="text-xs text-zinc-400 font-medium font-mono flex items-center gap-1.5 mb-1.5">
                <GitFork className="w-3.5 h-3.5 text-zinc-400" />
                Lineage Topology
              </span>
              <div className="flex items-center gap-2 text-xs font-mono">
                <Badge variant="origin" origin="cached_replay" size="xs">
                  ⚡ {summary.identicalStepsCount} Cached
                </Badge>
                <Badge variant="origin" origin="forked" size="xs">
                  🔀 {summary.divergedStepsCount} Diverged
                </Badge>
              </div>
            </div>
          </div>

          {/* Provenance Diff & Reproducibility Assessment */}
          {diffResult?.provenanceDiff && (
            <div className="pt-2 border-t border-[#202024] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-400 font-semibold flex items-center gap-1.5 uppercase tracking-wider text-[10px] mr-1">
                  <GitBranch className="w-3 h-3 text-zinc-400" />
                  Provenance:
                </span>
                <Badge
                  variant="status"
                  status={diffResult.provenanceDiff.source.status === 'identical' ? 'completed' : 'failed'}
                  size="xs"
                >
                  {diffResult.provenanceDiff.source.status === 'identical' ? '✓ Same Git Head' : '✗ Git Differs'}
                </Badge>
                <Badge
                  variant="status"
                  status={diffResult.provenanceDiff.dependencies.status === 'identical' ? 'completed' : 'intercepted'}
                  size="xs"
                >
                  {diffResult.provenanceDiff.dependencies.status === 'identical' ? '✓ Same Lockfile' : '✗ Lockfile Differs'}
                </Badge>
                <Badge
                  variant="status"
                  status={diffResult.provenanceDiff.runtime.status === 'identical' ? 'completed' : 'intercepted'}
                  size="xs"
                >
                  {diffResult.provenanceDiff.runtime.status === 'identical' ? '✓ Same Runtime' : '✗ Runtime Differs'}
                </Badge>
                <Badge
                  variant="status"
                  status={diffResult.provenanceDiff.platform.status === 'identical' ? 'completed' : 'intercepted'}
                  size="xs"
                >
                  {diffResult.provenanceDiff.platform.status === 'identical' ? '✓ Same Platform' : '✗ Platform Differs'}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-zinc-400">Interpretation:</span>
                <span className="px-2 py-0.5 rounded bg-[#16161a] border border-[#202024] text-zinc-300 font-mono">
                  {diffResult.provenanceDiff.scorecard.interpretation}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diff Content Body */}
      <div className="space-y-3">
        {isLoading ? (
          <LoadingState message="Computing deterministic DAG diff between runs..." className="py-16" />
        ) : error ? (
          <div className="p-4 rounded bg-rose-950/30 border border-rose-900/60 text-rose-300 text-center font-mono text-xs">
            <AlertCircle className="w-5 h-5 text-rose-400 mx-auto mb-1.5" />
            <span>{error}</span>
          </div>
        ) : !diffResult || diffResult.steps.length === 0 ? (
          <EmptyState
            icon={<Scale className="w-8 h-8 text-zinc-400" />}
            title="No Comparison Selected"
            description="Choose two trace runs above to compare model transitions, prompt mutations, latency deltas, and costs across time-travel forks."
            className="py-16"
          />
        ) : (
          diffResult.steps.map((step) => {
            const isExpanded = Boolean(expandedSteps[step.stepIndex]);
            const basePayload = parseJsonSafe(step.baseSpan?.request_payload);
            const targetPayload = parseJsonSafe(step.targetSpan?.request_payload);
            const baseResp = parseJsonSafe(step.baseSpan?.response_payload);
            const targetResp = parseJsonSafe(step.targetSpan?.response_payload);

            const baseAnswer =
              baseResp?.choices?.[0]?.message?.content ||
              baseResp?.content ||
              (typeof baseResp === 'string' ? baseResp : JSON.stringify(baseResp, null, 2));

            const targetAnswer =
              targetResp?.choices?.[0]?.message?.content ||
              targetResp?.content ||
              (typeof targetResp === 'string' ? targetResp : JSON.stringify(targetResp, null, 2));

            const isIdentical = step.status === 'identical_cached';
            const isForkPoint = step.status === 'modified_fork';

            return (
              <div
                key={`step-${step.stepIndex}`}
                className={`rounded border transition-all overflow-hidden ${
                  isForkPoint
                    ? 'bg-[#17140e] border-amber-600/60 ring-1 ring-amber-500/30'
                    : isIdentical
                    ? 'bg-[#111613] border-emerald-900/50'
                    : 'bg-[#111114] border-[#27272a]'
                }`}
              >
                {/* Step Header Accordion */}
                <div
                  onClick={() => toggleStepExpanded(step.stepIndex)}
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button className="text-zinc-400 hover:text-zinc-200">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <span className="w-5 h-5 rounded bg-[#18181c] border border-[#27272a] flex items-center justify-center font-mono text-[11px] font-bold text-zinc-300">
                      {step.stepIndex}
                    </span>
                    <h3 className="font-mono font-semibold text-xs text-zinc-100 truncate">
                      {step.agentName}
                    </h3>

                    {/* Classification Badges */}
                    {isIdentical && (
                      <Badge variant="origin" origin="cached_replay" size="xs">
                        <Zap className="w-3 h-3 mr-0.5" />
                        Cached Replay (0ms / $0)
                      </Badge>
                    )}

                    {isForkPoint && (
                      <Badge variant="origin" origin="modified" size="xs">
                        <GitFork className="w-3 h-3 mr-0.5" />
                        Fork Point: Mutated
                      </Badge>
                    )}

                    {step.status === 'modified' && (
                      <Badge variant="origin" origin="modified" size="xs">
                        Modified
                      </Badge>
                    )}

                    {step.status === 'inserted' && (
                      <Badge variant="origin" origin="new_execution" size="xs">
                        ➕ Inserted
                      </Badge>
                    )}

                    {step.status === 'removed' && (
                      <Badge variant="status" status="failed" size="xs">
                        ➖ Removed
                      </Badge>
                    )}

                    {step.status === 'diverged_downstream' && (
                      <Badge variant="origin" origin="forked" size="xs">
                        <ArrowDownRight className="w-3 h-3 mr-0.5" />
                        Diverged
                      </Badge>
                    )}
                  </div>

                  {/* Step Metrics Delta & Inspect Action */}
                  <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                    {step.deltas.modelChanged && (
                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#16161a] text-zinc-300 border border-[#27272a] text-[10px]">
                        {step.baseSpan?.model || 'none'} ➔ {step.targetSpan?.model || 'none'}
                      </span>
                    )}

                    <span
                      className={`font-semibold ${
                        step.deltas.costDeltaUsd < 0
                          ? 'text-emerald-400'
                          : step.deltas.costDeltaUsd > 0
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {step.deltas.costDeltaUsd < 0
                        ? `-$${Math.abs(step.deltas.costDeltaUsd).toFixed(6)}`
                        : step.deltas.costDeltaUsd > 0
                        ? `+$${step.deltas.costDeltaUsd.toFixed(6)}`
                        : '$0.000000'}
                    </span>

                    <span className="text-zinc-400">
                      {step.deltas.latencyDeltaMs <= 0
                        ? `${step.deltas.latencyDeltaMs}ms`
                        : `+${step.deltas.latencyDeltaMs}ms`}
                    </span>

                    {/* Cross-workspace Jump: Inspect Span in Debugger */}
                    {onSelectSpan && (step.targetSpan || step.baseSpan) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = step.targetSpan || step.baseSpan;
                          if (target) {
                            onSelectSpan(target.id, target.run_id);
                          }
                        }}
                        className="flex items-center gap-1 text-[10px] text-zinc-300 hover:text-white px-2 py-0.5 rounded bg-[#18181c] border border-[#27272a] hover:border-zinc-500 transition-colors cursor-pointer"
                        title="Jump to this span in the Debugger"
                      >
                        <span>Inspect</span>
                        <ArrowUpRight className="w-2.5 h-2.5 text-zinc-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Step Comparison Body */}
                {isExpanded && (
                  <div className="p-3 border-t border-[#202024] bg-[#0c0c0e]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 font-mono text-xs">
                      {/* Left Column: Base Run Span */}
                      <div className="p-3 rounded bg-[#111114] border border-[#202024] space-y-2">
                        <div className="flex items-center justify-between pb-2 border-b border-[#202024]">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-zinc-400" />
                            Base Run ({summary?.baseRunName})
                          </span>
                          <Badge variant="outline" size="xs">
                            {step.baseSpan?.model || 'no-model'}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Cost: ${step.baseSpan?.cost_usd?.toFixed(6) || '0.000000'}</span>
                          <span>Tokens: {(step.baseSpan?.prompt_tokens || 0) + (step.baseSpan?.completion_tokens || 0)}</span>
                          <span>Latency: {step.baseSpan?.latency_ms || 0}ms</span>
                        </div>

                        {/* Request Prompt */}
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                            Prompt Messages:
                          </span>
                          <pre className="p-2 rounded bg-[#09090b] border border-[#202024] text-zinc-300 max-h-36 overflow-y-auto text-[11px] whitespace-pre-wrap font-mono">
                            {JSON.stringify(basePayload?.messages || basePayload || 'No payload recorded', null, 2)}
                          </pre>
                        </div>

                        {/* Assistant Completion */}
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                            Completion:
                          </span>
                          <div className="p-2 rounded bg-[#09090b] border border-[#202024] text-zinc-200 max-h-40 overflow-y-auto text-[11px] whitespace-pre-wrap leading-relaxed font-mono">
                            {baseAnswer || 'No response recorded'}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Target / Forked Run Span */}
                      <div
                        className={`p-3 rounded border space-y-2 ${
                          isForkPoint
                            ? 'bg-[#15120c] border-amber-600/50'
                            : 'bg-[#111114] border-[#202024]'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-[#202024]">
                          <span className="font-semibold text-[#ea580c] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#ea580c]" />
                            Target Run ({summary?.targetRunName})
                          </span>
                          <Badge
                            variant={step.deltas.modelChanged ? 'origin' : 'outline'}
                            origin={step.deltas.modelChanged ? 'modified' : undefined}
                            size="xs"
                          >
                            {step.targetSpan?.model || 'no-model'}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span
                            className={
                              step.deltas.costDeltaUsd < 0 ? 'text-emerald-400 font-semibold' : ''
                            }
                          >
                            Cost: ${step.targetSpan?.cost_usd?.toFixed(6) || '0.000000'}
                          </span>
                          <span>Tokens: {(step.targetSpan?.prompt_tokens || 0) + (step.targetSpan?.completion_tokens || 0)}</span>
                          <span>Latency: {step.targetSpan?.latency_ms || 0}ms</span>
                        </div>

                        {/* Request Prompt */}
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                            Prompt Messages:
                          </span>
                          <pre
                            className={`p-2 rounded bg-[#09090b] border text-[11px] max-h-36 overflow-y-auto whitespace-pre-wrap font-mono ${
                              step.deltas.promptChanged
                                ? 'border-amber-700/80 text-amber-200'
                                : 'border-[#202024] text-zinc-300'
                            }`}
                          >
                            {JSON.stringify(targetPayload?.messages || targetPayload || 'No payload recorded', null, 2)}
                          </pre>
                        </div>

                        {/* Assistant Completion */}
                        <div>
                          <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                            Completion:
                          </span>
                          <div className="p-2 rounded bg-[#09090b] border border-[#202024] text-zinc-200 max-h-40 overflow-y-auto text-[11px] whitespace-pre-wrap leading-relaxed font-mono">
                            {targetAnswer || 'No response recorded'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Embedded Full-Screen Workspace Architecture
  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full bg-[#09090b] text-zinc-100 font-sans text-xs overflow-hidden">
        {/* Studio Workspace Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#202024] bg-[#09090b] shrink-0 font-mono">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
              title="Return to Debugger workspace (Esc)"
            >
              Back to Debugger
            </Button>
            <div className="h-4 w-[1px] bg-[#27272a]" />
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#ea580c]" />
              <span className="font-semibold text-sm text-zinc-100 uppercase tracking-wide">
                Diff Arena
              </span>
              <Badge variant="neutral" size="xs">
                COMPARATOR
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {summary && (
              <span className="text-zinc-400 text-[11px] hidden sm:inline">
                {summary.identicalStepsCount} cached · {summary.divergedStepsCount} diverged
              </span>
            )}
            <Badge variant="outline" size="xs">
              ESC TO EXIT
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {contentBody}
        </div>

        <div className="p-3 border-t border-[#202024] bg-[#0c0c0e] shrink-0">
          {modalFooter}
        </div>
      </div>
    );
  }

  // Modal Fallback Mode
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="7xl"
      title={
        <div className="flex items-center gap-2 font-mono">
          <Scale className="w-4 h-4 text-[#ea580c]" />
          <span>DAG Diff Arena</span>
          <Badge variant="neutral" size="xs">COMPARATOR</Badge>
        </div>
      }
      subtitle="Compare model transitions, prompt deltas, latency, and costs across execution runs"
      footer={modalFooter}
      className="max-h-[94vh]"
    >
      {contentBody}
    </Modal>
  );
};
