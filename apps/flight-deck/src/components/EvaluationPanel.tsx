'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Download,
  Play,
  RotateCcw,
  ExternalLink,
  Target,
  Clock,
  DollarSign,
  Cpu,
  Layers,
  ChevronRight,
  Filter,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import {
  Modal,
  Badge,
  Button,
  IconButton,
  Input,
  DataRow,
  EmptyState,
  Tooltip
} from '@/design-system';
import {
  runEvaluationApi,
  fetchEvaluationByTargetApi,
  fetchEvaluationsApi,
  deleteEvaluationApi,
  exportEvaluationApi,
  type EvaluationReport,
  type TraceRun,
  type AssertionResult,
  type FailureItem,
  type RootCauseCandidate,
  type OptimizationSignal,
  type ErrorCluster
} from '@/lib/api';

interface EvaluationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRun: TraceRun | null;
  runs: TraceRun[];
  onSelectSpan?: (spanId: string) => void;
  onOpenDiffModal?: (baseId: string, targetId: string) => void;
  embedded?: boolean;
}

export const EvaluationPanel: React.FC<EvaluationPanelProps> = ({
  isOpen,
  onClose,
  selectedRun,
  runs,
  onSelectSpan,
  onOpenDiffModal,
  embedded = false
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'assertions' | 'root_cause' | 'optimization' | 'history'>('overview');
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assertionFilter, setAssertionFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [customRules, setCustomRules] = useState<string>(
    'status == completed\nerrors.count == 0\nretries.count <= 2\ncost <= $0.10\nduration <= 5000ms'
  );
  const [historyList, setHistoryList] = useState<any[]>([]);

  // Load latest evaluation for currently selected run
  const loadLatestEvaluation = useCallback(async () => {
    if (!selectedRun) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const existing = await fetchEvaluationByTargetApi('run', selectedRun.id);
      if (existing) {
        setReport(existing);
      } else {
        setReport(null);
      }
    } catch (err: any) {
      console.warn('[EvaluationPanel] No existing evaluation found:', err.message);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRun]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchEvaluationsApi({ limit: 30 });
      setHistoryList(res.evaluations || []);
    } catch (err: any) {
      console.error('[EvaluationPanel] Failed to load history:', err.message);
    }
  }, []);

  useEffect(() => {
    if (isOpen && selectedRun) {
      loadLatestEvaluation();
      loadHistory();
    }
  }, [isOpen, selectedRun, loadLatestEvaluation, loadHistory]);

  const handleRunEvaluation = async () => {
    if (!selectedRun) return;
    setIsLoading(true);
    setErrorMessage(null);

    const rules = customRules
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && !r.startsWith('#'));

    try {
      const newReport = await runEvaluationApi({
        targetType: 'run',
        targetId: selectedRun.id,
        name: `Evaluation of ${selectedRun.name}`,
        rules
      });
      setReport(newReport);
      setActiveTab('overview');
      loadHistory();
    } catch (err: any) {
      setErrorMessage(err.message || 'Evaluation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    if (!report) return;
    try {
      const content = await exportEvaluationApi(report.id, format);
      const mime = format === 'markdown' ? 'text/markdown' : 'application/json';
      const ext = format === 'markdown' ? 'md' : 'json';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evaluation_${report.targetId}_${report.id.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleDeleteEvaluation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this evaluation report?')) return;
    try {
      await deleteEvaluationApi(id);
      if (report?.id === id) setReport(null);
      loadHistory();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const filteredAssertions = report?.assertions.filter((a) => {
    if (assertionFilter === 'passed') return a.status === 'passed';
    if (assertionFilter === 'failed') return a.status === 'failed';
    return true;
  }) || [];

  const contentBody = (
    <div className={`flex flex-col ${embedded ? 'flex-1 h-full' : 'h-[80vh] w-full'} bg-[#0c0c0e] text-zinc-200 overflow-hidden`}>
      {/* Subheader Navigation Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#202024] bg-[#121215] shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Overview & Metrics
            </button>
            <button
              onClick={() => setActiveTab('assertions')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'assertions'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Assertions
              {report && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    report.score.assertionsFailed === 0
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                      : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                  }`}
                >
                  {report.score.assertionsPassed}/{report.score.assertionsTotal}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('root_cause')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'root_cause'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Root Cause & Errors
              {report && (report.failures.length > 0 || report.rootCauses.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('optimization')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'optimization'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Optimization Signals
              {report && report.optimizationSignals.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800/40">
                  {report.optimizationSignals.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              Evaluation History
            </button>
          </div>

          {/* Action Triggers */}
          <div className="flex items-center gap-2">
            {report && (
              <>
                <Button variant="ghost" size="xs" onClick={() => handleExport('json')}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  JSON
                </Button>
                <Button variant="ghost" size="xs" onClick={() => handleExport('markdown')}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Markdown
                </Button>
              </>
            )}
            <Button
              variant="primary"
              size="xs"
              onClick={handleRunEvaluation}
              disabled={isLoading || !selectedRun}
            >
              {isLoading ? (
                <>Evaluating...</>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                  Run Evaluation
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error Banner if any */}
        {errorMessage && (
          <div className="px-6 py-2 bg-rose-950/60 border-b border-rose-800/40 text-xs text-rose-300 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab 1: Overview & Scorecard */}
        {activeTab === 'overview' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {!report ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Target className="w-12 h-12 text-zinc-600 mb-3" />
                <h3 className="text-sm font-semibold text-zinc-300">No Evaluation Performed Yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mt-1 mb-4">
                  Run a deterministic evaluation to assert cost ceilings, latency SLAs, zero-error policies, and identify root causes.
                </p>
                <Button variant="primary" size="sm" onClick={handleRunEvaluation} disabled={isLoading}>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Evaluate Current Run
                </Button>
              </div>
            ) : (
              <>
                {/* Scorecard Header */}
                <div className="p-4 rounded-lg bg-[#141418] border border-[#26262b] flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-wider text-zinc-400 font-mono">Evaluation Verdict</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold font-mono uppercase ${
                          report.status === 'passed'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {report.status === 'passed' ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      {report.score.assertionsPassed} of {report.score.assertionsTotal} Assertions Passed
                      <span className="text-xs font-normal text-zinc-400">
                        ({report.score.passPercentage.toFixed(1)}%)
                      </span>
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    {report.score.criticalFailures > 0 && (
                      <div className="px-3 py-1.5 rounded bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>{report.score.criticalFailures} Critical Failure(s)</span>
                      </div>
                    )}
                    <span className="text-xs text-zinc-500 font-mono">
                      Completed in {report.completedAt - report.createdAt}ms
                    </span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-4">
                  {/* Cost Card */}
                  <div className="p-3.5 rounded-lg bg-[#141418] border border-[#26262b] space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        Spend
                      </span>
                      {report.regression?.costDeltaPercent !== undefined && (
                        <span
                          className={`text-[11px] font-bold ${
                            report.regression.costDeltaPercent <= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {report.regression.costDeltaPercent > 0 ? '+' : ''}
                          {report.regression.costDeltaPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      ${report.metrics.cost.totalCostUsd.toFixed(6)}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Model: ${report.metrics.cost.modelCostUsd.toFixed(6)}
                    </div>
                  </div>

                  {/* Latency Card */}
                  <div className="p-3.5 rounded-lg bg-[#141418] border border-[#26262b] space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        Wall Latency
                      </span>
                      {report.regression?.durationDeltaPercent !== undefined && (
                        <span
                          className={`text-[11px] font-bold ${
                            report.regression.durationDeltaPercent <= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {report.regression.durationDeltaPercent > 0 ? '+' : ''}
                          {report.regression.durationDeltaPercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {(report.metrics.latency.totalDurationMs / 1000).toFixed(2)}s
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Critical Path: {(report.metrics.latency.criticalPathMs / 1000).toFixed(2)}s
                    </div>
                  </div>

                  {/* Tokens Card */}
                  <div className="p-3.5 rounded-lg bg-[#141418] border border-[#26262b] space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-purple-400" />
                        Tokens
                      </span>
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {report.metrics.tokens.totalTokens.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Prompt: {report.metrics.tokens.promptTokens} | Out: {report.metrics.tokens.completionTokens}
                    </div>
                  </div>

                  {/* Reliability Card */}
                  <div className="p-3.5 rounded-lg bg-[#141418] border border-[#26262b] space-y-1.5">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Reliability
                      </span>
                    </div>
                    <div
                      className={`text-base font-bold font-mono ${
                        report.metrics.reliability.errorCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {report.metrics.reliability.errorCount} Errors
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Retries: {report.metrics.reliability.retryCount} ({report.metrics.execution.spanCount} spans)
                    </div>
                  </div>
                </div>

                {/* Assertion Rule Configurator Preview */}
                <div className="p-4 rounded-lg bg-[#141418] border border-[#26262b] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300">Custom Assertion Rules (DSL)</span>
                    <span className="text-[11px] text-zinc-500">One expression per line</span>
                  </div>
                  <textarea
                    value={customRules}
                    onChange={(e) => setCustomRules(e.target.value)}
                    rows={4}
                    className="w-full bg-[#0a0a0c] border border-[#202024] rounded p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-500 resize-none"
                    placeholder="e.g. cost <= $0.10"
                  />
                  <div className="flex justify-end">
                    <Button variant="secondary" size="xs" onClick={handleRunEvaluation} disabled={isLoading}>
                      Re-run With Custom Rules
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Assertions Checklist */}
        {activeTab === 'assertions' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#202024]">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-400">Filter Assertions:</span>
                <button
                  onClick={() => setAssertionFilter('all')}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    assertionFilter === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  All ({report?.assertions.length || 0})
                </button>
                <button
                  onClick={() => setAssertionFilter('passed')}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    assertionFilter === 'passed' ? 'bg-emerald-950 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Passed ({report?.score.assertionsPassed || 0})
                </button>
                <button
                  onClick={() => setAssertionFilter('failed')}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    assertionFilter === 'failed' ? 'bg-rose-950 text-rose-400' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Failed ({report?.score.assertionsFailed || 0})
                </button>
              </div>
            </div>

            {filteredAssertions.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">No assertions matching filter.</div>
            ) : (
              <div className="space-y-2">
                {filteredAssertions.map((a) => {
                  const passed = a.status === 'passed';
                  return (
                    <div
                      key={a.id}
                      className={`p-3.5 rounded-lg border transition-colors ${
                        passed
                          ? 'bg-[#141418] border-zinc-800/60'
                          : 'bg-rose-950/20 border-rose-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )}
                          <span className="text-xs font-bold text-white font-mono">{a.expression}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                            passed
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800/40'
                          }`}
                        >
                          {passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-400 font-mono flex items-center gap-4">
                        <span>Expected: <span className="text-zinc-200">{a.operator} {String(a.expected)}</span></span>
                        <span>Actual: <span className={passed ? 'text-emerald-400' : 'text-rose-400'}>{String(a.actual)}</span></span>
                      </div>

                      {!passed && a.evidence?.spanIds && a.evidence.spanIds.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-rose-900/30 flex items-center gap-2 text-xs">
                          <span className="text-zinc-400 font-mono text-[11px]">Culprit Spans:</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {a.evidence.spanIds.map((sId) => (
                              <button
                                key={sId}
                                onClick={() => onSelectSpan && onSelectSpan(sId)}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-[10px] border border-zinc-700 flex items-center gap-1"
                              >
                                {sId.slice(0, 10)}...
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Failures & Root Causes */}
        {activeTab === 'root_cause' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Root Causes Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Causal Root Causes</h3>
              </div>

              {report?.rootCauses.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#141418] border border-[#26262b] text-xs text-zinc-400 text-center">
                  No causal root failures detected. All execution chains ran cleanly.
                </div>
              ) : (
                <div className="space-y-3">
                  {report?.rootCauses.map((rc) => {
                    const isPrimary = rc.candidateType === 'primary';
                    return (
                      <div
                        key={rc.id}
                        className={`p-4 rounded-lg border ${
                          isPrimary
                            ? 'bg-rose-950/20 border-rose-800/60'
                            : 'bg-[#141418] border-zinc-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                                isPrimary
                                  ? 'bg-rose-900 text-rose-200 border border-rose-700'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {rc.candidateType.toUpperCase()} CAUSE
                            </span>
                            <span className="text-xs font-bold text-white font-mono">
                              {rc.agentName} → {rc.eventType}
                            </span>
                          </div>

                          <button
                            onClick={() => onSelectSpan && onSelectSpan(rc.spanId)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-mono flex items-center gap-1 border border-zinc-700"
                          >
                            Inspect Span: {rc.spanId.slice(0, 8)}...
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>

                        <p className="text-xs text-zinc-300 mb-2.5">{rc.explanation}</p>

                        <div className="grid grid-cols-4 gap-2 p-2.5 rounded bg-[#0e0e11] text-[11px] font-mono text-zinc-400">
                          <div>Retries: <span className="text-zinc-200">{rc.impact.retryCount}</span></div>
                          <div>Added Delay: <span className="text-zinc-200">+{rc.impact.delayMs}ms</span></div>
                          <div>Downstream Fails: <span className="text-zinc-200">{rc.impact.downstreamFailuresCount}</span></div>
                          <div>Wasted Spend: <span className="text-zinc-200">${rc.impact.costImpactUsd.toFixed(6)}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error Clusters Section */}
            {report?.errorClusters && report.errorClusters.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Error Clusters ({report.errorClusters.length})</h3>
                </div>

                <div className="space-y-2">
                  {report.errorClusters.map((ec) => (
                    <div key={ec.id} className="p-3.5 rounded-lg bg-[#141418] border border-[#26262b]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white font-mono">{ec.errorType}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          {ec.occurrences} occurrence(s)
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400 mb-1.5">{ec.normalizedMessage}</div>
                      {ec.affectedTools.length > 0 && (
                        <div className="text-[11px] text-zinc-500">
                          Affected Tools: {ec.affectedTools.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Optimization Signals */}
        {activeTab === 'optimization' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Actionable Optimization Signals</h3>
            </div>

            {report?.optimizationSignals.length === 0 ? (
              <div className="p-8 rounded-lg bg-[#141418] border border-[#26262b] text-xs text-zinc-400 text-center">
                No optimization signals detected. Agent execution is balanced and efficient.
              </div>
            ) : (
              <div className="space-y-3">
                {report?.optimizationSignals.map((opt) => (
                  <div key={opt.id} className="p-4 rounded-lg bg-[#141418] border border-[#26262b] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-amber-950 text-amber-300 border border-amber-800/40">
                          {opt.category}
                        </span>
                        <span className="text-xs font-bold text-white">{opt.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        Priority: {opt.priority}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300">{opt.description}</p>

                    {(opt.potentialSavingsUsd || opt.potentialLatencySavingsMs) && (
                      <div className="flex items-center gap-4 text-xs font-mono text-emerald-400">
                        {opt.potentialSavingsUsd && (
                          <span>Estimated Savings: ${opt.potentialSavingsUsd.toFixed(6)}</span>
                        )}
                        {opt.potentialLatencySavingsMs && (
                          <span>Latency Reduction: ~{opt.potentialLatencySavingsMs}ms</span>
                        )}
                      </div>
                    )}

                    <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800 text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-300">Recommendation: </span>
                      {opt.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Evaluation History */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <h3 className="text-sm font-semibold text-white mb-2">Historical Evaluations</h3>
            {historyList.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">No evaluations recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {historyList.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg bg-[#141418] border border-[#26262b] flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                            h.status === 'passed' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {h.status}
                        </span>
                        <span className="text-xs font-bold text-white font-mono">{h.name}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Target: {h.target_type} ({h.target_id.slice(0, 10)}...) | Assertions: {h.assertions_passed}/{h.assertions_total}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={async () => {
                          const full = await fetchEvaluationByTargetApi(h.target_type, h.target_id);
                          if (full) {
                            setReport(full);
                            setActiveTab('overview');
                          }
                        }}
                      >
                        Load
                      </Button>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        label="Delete evaluation"
                        onClick={() => handleDeleteEvaluation(h.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-rose-400" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
  );

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
              <Target className="w-4 h-4 text-[#ea580c]" />
              <span className="font-semibold text-sm text-zinc-100 uppercase tracking-wide">
                Evaluation Studio
              </span>
              <Badge variant="neutral" size="xs">
                ASSERTION RUNNER
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {selectedRun && (
              <span className="text-zinc-400 text-[11px] hidden sm:inline">
                Target: {selectedRun.name} ({selectedRun.id.slice(0, 8)})
              </span>
            )}
            {report && (
              <Badge
                variant="status"
                status={report.status === 'passed' ? 'completed' : 'failed'}
                size="xs"
              >
                {report.status.toUpperCase()} ({report.score.assertionsPassed}/{report.score.assertionsTotal})
              </Badge>
            )}
            <Badge variant="outline" size="xs">
              ESC TO EXIT
            </Badge>
          </div>
        </div>
        {contentBody}
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 font-mono">
          <Target className="w-4 h-4 text-[#ea580c]" />
          <span>Evaluation & Optimization Studio</span>
          <Badge variant="neutral" size="xs">ASSERTION RUNNER</Badge>
          {selectedRun && (
            <Badge variant="neutral" size="xs">
              {selectedRun.name}
            </Badge>
          )}
        </div>
      }
      subtitle="Deterministic assertions, root cause analysis, and optimization signals"
      maxWidth="5xl"
    >
      {contentBody}
    </Modal>
  );
};

