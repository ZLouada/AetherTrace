import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  ArrowRight,
  Zap,
  GitFork,
  ArrowDownRight,
  Coins,
  Clock,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Cpu,
  Layers,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  fetchRunDiff,
  type TraceRun,
  type RunDiffResult,
  type SpanDiffItem
} from '@/lib/api';

interface DiffArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  runs: TraceRun[];
  initialBaseId?: string | null;
  initialTargetId?: string | null;
}

export const DiffArenaModal: React.FC<DiffArenaModalProps> = ({
  isOpen,
  onClose,
  runs,
  initialBaseId,
  initialTargetId
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
        // Expand fork points by default
        const initExpanded: Record<number, boolean> = {};
        data.steps.forEach((s) => {
          if (s.status === 'modified_fork' || s.status === 'diverged_downstream') {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
      <div className="relative w-full max-w-7xl max-h-[92vh] flex flex-col bg-[#0b0f1a] border border-cyan-800/60 rounded-xl shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b border-gray-800 bg-[#0d1322] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Side-by-Side DAG Diff Arena
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80">
                  v0.3.0
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Compare Model, Prompt & Cost Transitions across Time-Travel Forks & Runs
              </p>
            </div>
          </div>

          {/* Run Selectors */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="flex items-center gap-1.5 bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1">
              <span className="text-gray-400 font-bold">Base (A):</span>
              <select
                value={baseRunId}
                onChange={(e) => setBaseRunId(e.target.value)}
                className="bg-transparent text-gray-200 outline-none text-xs cursor-pointer max-w-[180px] truncate"
              >
                {runs.map((r) => (
                  <option key={`base-${r.id}`} value={r.id} className="bg-gray-900 text-gray-200">
                    {r.name} (${r.total_cost_usd.toFixed(4)})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSwap}
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
              title="Swap Base and Target Runs"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
            </button>

            <div className="flex items-center gap-1.5 bg-[#111827] border border-purple-800/70 rounded-lg px-2.5 py-1">
              <span className="text-purple-400 font-bold">Target (B):</span>
              <select
                value={targetRunId}
                onChange={(e) => setTargetRunId(e.target.value)}
                className="bg-transparent text-purple-200 outline-none text-xs cursor-pointer max-w-[180px] truncate"
              >
                {runs.map((r) => (
                  <option key={`target-${r.id}`} value={r.id} className="bg-gray-900 text-purple-200">
                    {r.name} (${r.total_cost_usd.toFixed(4)})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Executive Scorecard Banner */}
        {summary && (
          <div className="p-4 border-b border-gray-800/80 bg-[#101728] shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Cost Delta Card */}
              <div className="p-3 rounded-lg bg-[#0b0f1a] border border-gray-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                    Total Spend Delta
                  </span>
                  {summary.costSavingsPercent > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                      <TrendingDown className="w-3 h-3" />
                      -{summary.costSavingsPercent}% Saved
                    </span>
                  ) : summary.costSavingsPercent < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800">
                      <TrendingUp className="w-3 h-3" />
                      +{Math.abs(summary.costSavingsPercent)}% More
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-gray-400">Equal</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-gray-400 text-xs line-through">${summary.baseCostUsd.toFixed(6)}</span>
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                  <span className={`text-base font-bold ${summary.costSavingsPercent > 0 ? 'text-emerald-400' : summary.costSavingsPercent < 0 ? 'text-red-400' : 'text-gray-200'}`}>
                    ${summary.targetCostUsd.toFixed(6)}
                  </span>
                </div>
              </div>

              {/* Latency Delta Card */}
              <div className="p-3 rounded-lg bg-[#0b0f1a] border border-gray-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-yellow-400" />
                    Total Latency Delta
                  </span>
                  <span className={`text-[11px] font-mono font-bold ${summary.latencyDeltaMs <= 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {summary.latencyDeltaMs <= 0 ? `${summary.latencyDeltaMs}ms Faster` : `+${summary.latencyDeltaMs}ms Slower`}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-gray-400 text-xs">{summary.baseLatencyMs}ms</span>
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                  <span className="text-base font-bold text-gray-200">{summary.targetLatencyMs}ms</span>
                </div>
              </div>

              {/* Token Delta Card */}
              <div className="p-3 rounded-lg bg-[#0b0f1a] border border-gray-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Coins className="w-3.5 h-3.5 text-purple-400" />
                    Total Tokens
                  </span>
                  <span className="text-[11px] font-mono text-gray-400">
                    {summary.tokenDelta >= 0 ? `+${summary.tokenDelta}` : `${summary.tokenDelta}`} tokens
                  </span>
                </div>
                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-gray-400 text-xs">{summary.baseTokens}</span>
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                  <span className="text-base font-bold text-gray-200">{summary.targetTokens}</span>
                </div>
              </div>

              {/* Execution Lineage Card */}
              <div className="p-3 rounded-lg bg-[#0b0f1a] border border-gray-800 flex flex-col justify-between">
                <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mb-1">
                  <GitFork className="w-3.5 h-3.5 text-cyan-400" />
                  Lineage Classification
                </span>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ⚡ {summary.identicalStepsCount} Cached
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                    🔀 {summary.divergedStepsCount} Diverged
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diff Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-20 text-center font-mono text-gray-400 flex flex-col items-center gap-2">
              <Scale className="w-8 h-8 text-cyan-400 animate-spin" />
              <span>Computing deterministic DAG diff between runs...</span>
            </div>
          ) : error ? (
            <div className="p-6 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-center font-mono text-sm">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <span>{error}</span>
            </div>
          ) : !diffResult || diffResult.steps.length === 0 ? (
            <div className="py-20 text-center font-mono text-gray-500 text-sm">
              No span steps found to compare between selected runs.
            </div>
          ) : (
            diffResult.steps.map((step) => {
              const isExpanded = Boolean(expandedSteps[step.stepIndex]);
              const basePayload = parseJsonSafe(step.baseSpan?.request_payload);
              const targetPayload = parseJsonSafe(step.targetSpan?.request_payload);
              const baseResp = parseJsonSafe(step.baseSpan?.response_payload);
              const targetResp = parseJsonSafe(step.targetSpan?.response_payload);

              // Extract text answers for direct visual comparison
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
                  className={`rounded-xl border transition-all ${
                    isForkPoint
                      ? 'bg-[#151c2d] border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40'
                      : isIdentical
                      ? 'bg-[#0e1424] border-emerald-900/60'
                      : 'bg-[#101524] border-purple-900/60'
                  }`}
                >
                  {/* Step Header Accordion */}
                  <div
                    onClick={() => toggleStepExpanded(step.stepIndex)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400 hover:text-white">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center font-mono text-xs font-bold text-gray-300">
                          {step.stepIndex}
                        </span>
                        <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
                          {step.agentName}
                        </h3>
                      </div>

                      {/* Classification Badge */}
                      {isIdentical && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          Shared Cached Prefix (0ms / $0)
                        </span>
                      )}

                      {isForkPoint && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-600 animate-pulse">
                          <GitFork className="w-3 h-3 text-amber-400" />
                          Fork Point: Model / Prompt Mutated
                        </span>
                      )}

                      {step.status === 'diverged_downstream' && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                          <ArrowDownRight className="w-3 h-3 text-purple-400" />
                          Diverged Downstream Step
                        </span>
                      )}
                    </div>

                    {/* Step Metrics Delta Pill */}
                    <div className="flex items-center gap-4 text-xs font-mono">
                      {step.deltas.modelChanged && (
                        <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                          {step.baseSpan?.model || 'none'} ➔ {step.targetSpan?.model || 'none'}
                        </span>
                      )}

                      <span
                        className={`font-semibold ${
                          step.deltas.costDeltaUsd < 0
                            ? 'text-emerald-400'
                            : step.deltas.costDeltaUsd > 0
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.deltas.costDeltaUsd < 0
                          ? `-$${Math.abs(step.deltas.costDeltaUsd).toFixed(6)}`
                          : step.deltas.costDeltaUsd > 0
                          ? `+$${step.deltas.costDeltaUsd.toFixed(6)}`
                          : '$0.000000'}
                      </span>

                      <span className="text-gray-400">
                        {step.deltas.latencyDeltaMs <= 0
                          ? `${step.deltas.latencyDeltaMs}ms`
                          : `+${step.deltas.latencyDeltaMs}ms`}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Step Comparison Body */}
                  {isExpanded && (
                    <div className="p-4 border-t border-gray-800/80 bg-[#090d16]/70">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-mono text-xs">
                        {/* Left Column: Base Run Span */}
                        <div className="p-3.5 rounded-lg bg-[#111827] border border-gray-800 space-y-2.5">
                          <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                            <span className="font-bold text-gray-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-cyan-400" />
                              Base Run ({summary?.baseRunName})
                            </span>
                            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[11px]">
                              {step.baseSpan?.model || 'no-model'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>Cost: ${step.baseSpan?.cost_usd?.toFixed(6) || '0.000000'}</span>
                            <span>Tokens: {(step.baseSpan?.prompt_tokens || 0) + (step.baseSpan?.completion_tokens || 0)}</span>
                            <span>Latency: {step.baseSpan?.latency_ms || 0}ms</span>
                          </div>

                          {/* Request Prompt */}
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                              Prompt Messages:
                            </span>
                            <pre className="mt-1 p-2 rounded bg-black/60 border border-gray-800/80 text-gray-300 max-h-36 overflow-y-auto text-[11px] whitespace-pre-wrap">
                              {JSON.stringify(basePayload?.messages || basePayload || 'No payload recorded', null, 2)}
                            </pre>
                          </div>

                          {/* Assistant Completion */}
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                              Assistant Response:
                            </span>
                            <div className="mt-1 p-2.5 rounded bg-black/60 border border-gray-800/80 text-gray-200 max-h-44 overflow-y-auto text-[11px] whitespace-pre-wrap leading-relaxed">
                              {baseAnswer || 'No response recorded'}
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Target / Forked Run Span */}
                        <div
                          className={`p-3.5 rounded-lg border space-y-2.5 ${
                            isForkPoint
                              ? 'bg-[#141b2b] border-amber-600/60 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                              : 'bg-[#111827] border-purple-800/60'
                          }`}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                            <span className="font-bold text-purple-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-purple-400" />
                              Target Run ({summary?.targetRunName})
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                step.deltas.modelChanged
                                  ? 'bg-amber-950 text-amber-300 border border-amber-600'
                                  : 'bg-gray-800 text-gray-300'
                              }`}
                            >
                              {step.targetSpan?.model || 'no-model'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-400">
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
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                              Prompt Messages:
                            </span>
                            <pre
                              className={`mt-1 p-2 rounded bg-black/60 border text-[11px] max-h-36 overflow-y-auto whitespace-pre-wrap ${
                                step.deltas.promptChanged
                                  ? 'border-amber-700/80 text-amber-200'
                                  : 'border-gray-800/80 text-gray-300'
                              }`}
                            >
                              {JSON.stringify(targetPayload?.messages || targetPayload || 'No payload recorded', null, 2)}
                            </pre>
                          </div>

                          {/* Assistant Completion */}
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                              Assistant Response:
                            </span>
                            <div className="mt-1 p-2.5 rounded bg-black/60 border border-gray-800/80 text-gray-200 max-h-44 overflow-y-auto text-[11px] whitespace-pre-wrap leading-relaxed">
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

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 bg-[#0d1322] flex items-center justify-between shrink-0 font-mono text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Shared Cache Prefix
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Fork Point (Model/Prompt Mutated)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Diverged Downstream
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition-colors"
          >
            Close Arena
          </button>
        </div>
      </div>
    </div>
  );
};
