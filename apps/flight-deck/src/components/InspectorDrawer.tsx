'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  GitFork,
  Terminal,
  Code2,
  Cpu,
  Clock,
  DollarSign,
  AlertTriangle,
  Play,
  RotateCcw,
  Loader2,
  FileText,
  PauseCircle,
  FlaskConical,
  Ban,
  Wrench,
  Globe,
  Sliders,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  User,
  ShieldAlert,
  GitBranch,
  GitCommit,
  Package,
  Workflow,
  Zap,
  Layers,
  Brain,
  GitMerge,
  Share2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import type {
  TraceSpan,
  TraceRun,
  RunProvenance,
  BreakpointResolution,
  ExecutionIntelligence,
  AgentSummary,
  ToolChain,
  IntelligentRetryChain,
  CriticalPathSpan,
  CausalRelation
} from '@/lib/api';
import { forkSpan, replaySpan, postChatCompletion } from '@/lib/api';
import {
  Button,
  IconButton,
  Badge,
  DataRow,
  Select,
  Input,
  Divider
} from '@/design-system';

interface InspectorDrawerProps {
  span: TraceSpan | null;
  selectedAgent?: AgentSummary | null;
  intelligence?: ExecutionIntelligence | null;
  run?: TraceRun | null;
  onClose: () => void;
  onForkSuccess: (newRunId: string) => void;
  onReplaySuccess?: (newRunId: string) => void;
  onSelectParentSpan?: (parentSpanId: string) => void;
  onSelectSpan?: (spanId: string) => void;
  isHeldBreakpoint?: boolean;
  onResolveBreakpoint?: (spanId: string, resolution: BreakpointResolution) => Promise<void>;
  onToggleAgentBreakpoint?: (agentName: string) => void;
  isAgentBreakpointed?: boolean;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  span,
  selectedAgent,
  intelligence,
  run,
  onClose,
  onForkSuccess,
  onReplaySuccess,
  onSelectParentSpan,
  onSelectSpan,
  isHeldBreakpoint,
  onResolveBreakpoint,
  onToggleAgentBreakpoint,
  isAgentBreakpointed
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'intelligence' | 'fork' | 'json'>('inspector');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Section collapse state
  const [expandRequest, setExpandRequest] = useState(false);
  const [expandResponse, setExpandResponse] = useState(true);
  const [expandToolArgs, setExpandToolArgs] = useState(true);
  const [expandToolResult, setExpandToolResult] = useState(true);

  // Breakpoint Intercept State
  const [editedPayloadJson, setEditedPayloadJson] = useState<string>('{}');
  const [mockResponseText, setMockResponseText] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [interceptError, setInterceptError] = useState<string | null>(null);

  // Replay State
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  // Fork IDE State
  const [forkModel, setForkModel] = useState<string>('gpt-4o');
  const [forkAgentName, setForkAgentName] = useState<string>('Planner');
  const [forkMessagesJson, setForkMessagesJson] = useState<string>('[]');
  const [forkJsonError, setForkJsonError] = useState<string | null>(null);
  const [isForking, setIsForking] = useState(false);

  // If selectedAgent is provided and no span, switch to intelligence tab
  useEffect(() => {
    if (!span && selectedAgent) {
      setActiveTab('intelligence');
    }
  }, [span, selectedAgent]);

  // Sync state when selected span changes
  useEffect(() => {
    if (!span) return;
    setForkModel(span.model || 'gpt-4o');
    setForkAgentName(span.agent_name || 'ForkedAgent');
    setEditedPayloadJson(span.request_payload || '{}');
    setMockResponseText('');
    setInterceptError(null);
    setReplayError(null);

    try {
      if (span.request_payload) {
        const parsed = JSON.parse(span.request_payload);
        if (parsed.messages) {
          setForkMessagesJson(JSON.stringify(parsed.messages, null, 2));
        } else {
          setForkMessagesJson(JSON.stringify([{ role: 'user', content: 'Mutated branch prompt' }], null, 2));
        }
      } else {
        setForkMessagesJson(JSON.stringify([{ role: 'user', content: 'New prompt' }], null, 2));
      }
      setForkJsonError(null);
    } catch {
      setForkMessagesJson('[]');
    }
  }, [span]);

  if (!span && !selectedAgent) return null;

  const isIntercepted = Boolean(
    span &&
    (isHeldBreakpoint ||
      span.response_payload?.includes('"status":"intercepted"') ||
      span.response_payload?.includes('"status": "intercepted"') ||
      span.response_payload?.includes('"awaiting_human": true') ||
      span.response_payload?.includes('"awaiting_human":true'))
  );

  const handleCopyId = (idToCopy: string) => {
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleReplaySpan = async () => {
    if (!span) return;
    setIsReplaying(true);
    setReplayError(null);
    try {
      const result = await replaySpan(span.id);
      if (onReplaySuccess) {
        onReplaySuccess(result.newRunId);
      }
    } catch (err: any) {
      setReplayError(err.message || 'Replay failed');
    } finally {
      setIsReplaying(false);
    }
  };

  const handleExecuteFork = async () => {
    if (!span) return;
    setIsForking(true);
    setForkJsonError(null);
    try {
      let parsedMessages: any = [];
      try {
        parsedMessages = JSON.parse(forkMessagesJson);
      } catch {
        throw new Error('Invalid JSON format in messages editor');
      }

      const forkRes = await forkSpan(span.id, {
        new_run_name: `${run?.name || 'Run'}-fork-${forkAgentName}`,
        reason: 'Time-Travel Fork from Inspector IDE'
      });

      const newRunId = forkRes.newRunId;

      await postChatCompletion({
        model: forkModel,
        messages: parsedMessages,
        temperature: 0.7
      }, {
        runId: newRunId,
        runName: `${run?.name || 'Run'}-fork-${forkAgentName}`,
        agentName: forkAgentName,
        parentSpanId: span.id
      });

      onForkSuccess(newRunId);
    } catch (err: any) {
      setForkJsonError(`Fork failed: ${err.message}`);
    } finally {
      setIsForking(false);
    }
  };

  const handleResolveResume = async () => {
    if (!span || !onResolveBreakpoint) return;
    setIsResolving(true);
    setInterceptError(null);
    try {
      let parsedPayload: any = undefined;
      if (editedPayloadJson.trim()) {
        parsedPayload = JSON.parse(editedPayloadJson);
      }
      await onResolveBreakpoint(span.id, {
        action: 'resume',
        modifiedPayload: parsedPayload
      });
    } catch (err: any) {
      setInterceptError(err.message || 'Failed to resume breakpoint');
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolveMock = async () => {
    if (!span || !onResolveBreakpoint) return;
    setIsResolving(true);
    setInterceptError(null);
    try {
      await onResolveBreakpoint(span.id, {
        action: 'mock',
        mockedResponse: mockResponseText || 'Mocked by human operator via Flight Deck'
      });
    } catch (err: any) {
      setInterceptError(err.message || 'Failed to mock response');
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolveAbort = async () => {
    if (!span || !onResolveBreakpoint) return;
    setIsResolving(true);
    setInterceptError(null);
    try {
      await onResolveBreakpoint(span.id, {
        action: 'abort',
        reason: 'Call aborted by human operator in Flight Deck'
      });
    } catch (err: any) {
      setInterceptError(err.message || 'Failed to abort breakpoint');
    } finally {
      setIsResolving(false);
    }
  };

  let parsedRequest: any = null;
  let parsedResponse: any = null;
  if (span) {
    try {
      if (span.request_payload) parsedRequest = JSON.parse(span.request_payload);
    } catch {}
    try {
      if (span.response_payload) parsedResponse = JSON.parse(span.response_payload);
    } catch {}
  }

  let runProv: RunProvenance | null = null;
  if (run?.provenance) {
    if (typeof run.provenance === 'string') {
      try {
        runProv = JSON.parse(run.provenance);
      } catch {}
    } else if (typeof run.provenance === 'object') {
      runProv = run.provenance as RunProvenance;
    }
  }

  // --- Intelligence Lookups for Active Span / Agent ---
  const currentAgentSummary: AgentSummary | null =
    selectedAgent ||
    (span && intelligence?.agents.find((a) => a.agentName === span.agent_name)) ||
    null;

  const currentCriticalPathSpan =
    span && intelligence?.criticalPath.spans.find((s) => s.spanId === span.id);

  const currentToolChain =
    span && intelligence?.toolChains.find((tc) => tc.spanIds.includes(span.id));

  const currentRetryChain =
    span &&
    intelligence?.retryChains.find(
      (rc) => rc.originalSpanId === span.id || rc.attempts.some((att) => att.spanId === span.id)
    );

  const currentParallelGroup =
    span &&
    intelligence?.parallelGroups.find((pg) => pg.branches.some((b) => b.spanIds.includes(span.id)));

  const causedByRelations =
    (span && intelligence?.causalRelations.filter((r) => r.targetSpanId === span.id)) || [];

  const causedRelations =
    (span && intelligence?.causalRelations.filter((r) => r.sourceSpanId === span.id)) || [];

  const createdTime = span
    ? new Date(span.created_at).toISOString().split('T')[1]?.replace('Z', '') || `${span.created_at}`
    : '';

  return (
    <aside className="w-[460px] h-full border-l border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0 shadow-2xl z-20 select-none">
      {/* Drawer Header */}
      <div className="px-3.5 py-2.5 border-b border-[#202024] bg-[#09090b] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
          <span className="text-xs font-mono font-semibold tracking-wide text-zinc-200 uppercase shrink-0">
            {span ? 'Span Inspector' : 'Agent Summary'}
          </span>
          {span && (
            <button
              onClick={() => handleCopyId(span.id)}
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#18181c] text-zinc-400 hover:text-white border border-[#2c2c32] truncate max-w-[170px] transition-colors"
              title="Click to copy span ID"
            >
              <span className="truncate">{span.id}</span>
              {copiedId ? <Check className="w-2.5 h-2.5 text-white" /> : <Copy className="w-2.5 h-2.5" />}
            </button>
          )}
          {!span && selectedAgent && (
            <Badge variant="category" category="AGENT" size="xs">
              {selectedAgent.agentName}
            </Badge>
          )}
        </div>
        <IconButton label="Close Inspector (Esc)" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center border-b border-[#202024] bg-[#111114] px-3 font-mono text-xs">
        {span && (
          <button
            onClick={() => setActiveTab('inspector')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'inspector'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Overview
          </button>
        )}

        <button
          onClick={() => setActiveTab('intelligence')}
          className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'intelligence'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Workflow className="w-3.5 h-3.5 text-cyan-400" />
          Intelligence
        </button>

        {span && (
          <button
            onClick={() => setActiveTab('fork')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'fork'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            Fork IDE
          </button>
        )}

        {span && (
          <button
            onClick={() => setActiveTab('json')}
            className={`py-2 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'json'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            JSON
          </button>
        )}
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 font-mono text-xs select-text">
        {/* Live Breakpoint Intercept Box */}
        {isIntercepted && span && (
          <div className="p-3 rounded bg-amber-950/30 border border-amber-600/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 uppercase">
                <PauseCircle className="w-4 h-4 text-amber-400 animate-pulse" />
                Paused at Breakpoint
              </span>
              <Badge variant="origin" origin="modified" size="xs">
                Awaiting Operator
              </Badge>
            </div>

            <p className="text-[11px] text-amber-200/90 font-sans leading-relaxed">
              Execution is suspended. Mutate prompt payload before forwarding, return a synthetic mock ($0.00 cost), or abort.
            </p>

            {interceptError && (
              <p className="text-[11px] text-rose-300 bg-rose-950/50 border border-rose-800 p-2 rounded">
                {interceptError}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold">Mutate Payload JSON</label>
              <textarea
                rows={4}
                value={editedPayloadJson}
                onChange={(e) => setEditedPayloadJson(e.target.value)}
                className="w-full bg-[#09090b] border border-amber-600/50 rounded p-2 text-[11px] text-amber-100 font-mono focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold">Mock Response ($0.00)</label>
              <Input
                placeholder="Synthetic completion text..."
                value={mockResponseText}
                onChange={(e) => setMockResponseText(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                disabled={isResolving}
                isLoading={isResolving}
                onClick={handleResolveResume}
                icon={<Play className="w-3 h-3" />}
              >
                Forward
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isResolving}
                onClick={handleResolveMock}
                icon={<FlaskConical className="w-3 h-3" />}
              >
                Mock ($0)
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isResolving}
                onClick={handleResolveAbort}
                icon={<Ban className="w-3 h-3" />}
              >
                Abort
              </Button>
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'inspector' && span && (
          <>
            {/* Critical Path & Intelligence Quick Strip */}
            {currentCriticalPathSpan && (
              <div className="p-2.5 rounded bg-amber-950/20 border border-amber-500/40 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  Critical Path Span
                </span>
                <span className="text-amber-200/80 font-mono text-[11px]">
                  {currentCriticalPathSpan.durationMs}ms ({currentCriticalPathSpan.percentageOfCriticalPath}%)
                </span>
              </div>
            )}

            {/* Run Provenance Banner */}
            {runProv?.git && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-zinc-500" />
                    Git Provenance
                  </span>
                  <Badge variant="status" status={runProv.git.dirty ? 'warning' : 'success'} size="xs">
                    {runProv.git.dirty ? 'Dirty Tree' : 'Clean Commit'}
                  </Badge>
                </div>
                <DataRow
                  label="Commit"
                  value={`${runProv.git.branch || 'main'}@${runProv.git.short_sha || runProv.git.commit_sha?.slice(0, 7) || 'HEAD'}`}
                  copyValue={runProv.git.commit_sha}
                  copyable
                />
              </div>
            )}

            {/* Technical Metrics Card */}
            <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-1">
              <DataRow label="Span Type" value={span.span_type.toUpperCase()} />
              <DataRow label="Agent Name" value={span.agent_name} />
              <DataRow label="Target Model" value={span.model || '—'} />
              <DataRow label="Latency" value={span.cache_hit === 1 ? '0ms (cached)' : `${span.latency_ms}ms`} />
              <DataRow label="Cost USD" value={`$${span.cost_usd > 0 ? span.cost_usd.toFixed(6) : '0.000000'}`} />
              <DataRow
                label="Tokens"
                value={`${span.prompt_tokens + span.completion_tokens} (${span.prompt_tokens} in / ${span.completion_tokens} out)`}
              />
              <DataRow
                label="Parent Span"
                value={
                  span.parent_span_id ? (
                    <button
                      onClick={() => onSelectParentSpan && onSelectParentSpan(span.parent_span_id!)}
                      className="text-zinc-200 hover:text-white flex items-center gap-1 font-mono text-[10px]"
                    >
                      <span>{span.parent_span_id}</span>
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    'None (Root)'
                  )
                }
              />
            </div>

            {/* Tool Calls Section */}
            {span.span_type === 'tool_call' && parsedRequest && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <Wrench className="w-3.5 h-3.5" />
                    Tool: <span className="font-mono text-white">{parsedRequest.tool_name || 'custom_tool'}</span>
                  </span>
                </div>

                {parsedRequest.arguments && (
                  <div>
                    <button
                      onClick={() => setExpandToolArgs((p) => !p)}
                      className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1 hover:text-zinc-200 mb-1"
                    >
                      {expandToolArgs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Input Arguments
                    </button>
                    {expandToolArgs && (
                      <pre className="p-2 rounded bg-black/80 border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-36">
                        {JSON.stringify(parsedRequest.arguments, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {parsedResponse && (
                  <div>
                    <button
                      onClick={() => setExpandToolResult((p) => !p)}
                      className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1 hover:text-zinc-200 mb-1"
                    >
                      {expandToolResult ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Output Result
                    </button>
                    {expandToolResult && (
                      <pre className="p-2 rounded bg-black/80 border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-40">
                        {JSON.stringify(parsedResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Request Payload Section */}
            {parsedRequest?.messages && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-1.5">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setExpandRequest((p) => !p)}
                    className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1 hover:text-zinc-200"
                  >
                    {expandRequest ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Input Prompt Messages ({parsedRequest.messages.length})
                  </button>
                </div>
                {expandRequest && (
                  <pre className="p-2 rounded bg-black/80 border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-48">
                    {JSON.stringify(parsedRequest.messages, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Actions: Replay & Breakpoints */}
            <div className="pt-2 flex flex-col gap-2">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleReplaySpan}
                disabled={isReplaying}
                isLoading={isReplaying}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Replay From Here ($0.00 Cache Hit)
              </Button>

              {onToggleAgentBreakpoint && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => onToggleAgentBreakpoint(span.agent_name)}
                  icon={<Sliders className="w-3 h-3" />}
                >
                  {isAgentBreakpointed ? `Remove Breakpoint on ${span.agent_name}` : `Set Breakpoint on ${span.agent_name}`}
                </Button>
              )}
            </div>
          </>
        )}

        {/* TAB 2: AGENT INTELLIGENCE */}
        {activeTab === 'intelligence' && (
          <div className="space-y-3 font-mono">
            {/* Agent Summary Card */}
            {currentAgentSummary && (
              <div className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                    Agent: {currentAgentSummary.agentName}
                  </span>
                  <Badge variant="status" status={currentAgentSummary.status === 'failed' ? 'error' : 'success'} size="xs">
                    {currentAgentSummary.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <DataRow label="Depth" value={`Level ${currentAgentSummary.depth}`} />
                  <DataRow label="Parent Agent" value={currentAgentSummary.parentAgentName || 'Root'} />
                  <DataRow label="Duration" value={`${(currentAgentSummary.durationMs / 1000).toFixed(2)}s`} />
                  <DataRow label="Total Spans" value={currentAgentSummary.spanCount} />
                  <DataRow label="LLM Inferences" value={currentAgentSummary.llmCallCount} />
                  <DataRow label="Tool Invocations" value={currentAgentSummary.toolCallCount} />
                  <DataRow label="Retry Attempts" value={currentAgentSummary.retryCount} />
                  <DataRow label="Errors" value={currentAgentSummary.errorCount} />
                  <DataRow label="Cost USD" value={`$${currentAgentSummary.totalCostUsd.toFixed(6)}`} />
                  <DataRow label="Tokens" value={currentAgentSummary.totalTokens} />
                </div>
              </div>
            )}

            {/* Critical Path Sequence */}
            {intelligence?.criticalPath && (
              <div className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    Critical Path Analysis
                  </span>
                  <Badge variant="status" status="warning" size="xs">
                    {intelligence.criticalPath.coveragePercentage}% of Run
                  </Badge>
                </div>

                <div className="text-[11px] text-zinc-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Critical Path Duration:</span>
                    <span className="text-zinc-200 font-semibold">{intelligence.criticalPath.durationMs}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Run Wall-Clock Time:</span>
                    <span className="text-zinc-200">{intelligence.criticalPath.runDurationMs}ms</span>
                  </div>
                  {intelligence.criticalPath.longestSpan && (
                    <div className="flex justify-between">
                      <span>Longest Bottleneck:</span>
                      <span className="text-amber-200 font-semibold">
                        {intelligence.criticalPath.longestSpan.agentName} ({intelligence.criticalPath.longestSpan.durationMs}ms)
                      </span>
                    </div>
                  )}
                </div>

                {/* Critical Path Steps */}
                <div className="pt-1 space-y-1 border-t border-[#202024]">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Sequence:</span>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {intelligence.criticalPath.spans.map((cp, idx) => (
                      <div
                        key={cp.spanId}
                        onClick={() => onSelectSpan && onSelectSpan(cp.spanId)}
                        className={`p-1.5 rounded flex items-center justify-between text-[11px] cursor-pointer transition-colors ${
                          span?.id === cp.spanId
                            ? 'bg-amber-950/40 border border-amber-600/50 text-amber-200'
                            : 'bg-[#18181c] hover:bg-[#202024] text-zinc-300'
                        }`}
                      >
                        <span className="truncate max-w-[240px]">
                          {idx + 1}. {cp.agentName}: {cp.label}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                          {cp.durationMs}ms ({cp.percentageOfCriticalPath}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Causal Context for Current Span */}
            {span && (
              <div className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5 text-zinc-400" />
                  Causal Context for Current Span
                </span>

                {causedByRelations.length > 0 ? (
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">Caused by:</span>
                    {causedByRelations.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectSpan && onSelectSpan(r.sourceSpanId)}
                        className="p-1.5 rounded bg-[#18181c] hover:bg-[#202024] text-[11px] cursor-pointer space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200 font-semibold">{r.relationType}</span>
                          <Badge variant="neutral" size="xs">{r.classification}</Badge>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">{r.explanation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic">No incoming causal dependencies (root execution).</p>
                )}

                {causedRelations.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[#202024]">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">Triggered Downstream:</span>
                    {causedRelations.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectSpan && onSelectSpan(r.targetSpanId)}
                        className="p-1.5 rounded bg-[#18181c] hover:bg-[#202024] text-[11px] cursor-pointer space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200 font-semibold">{r.relationType}</span>
                          <Badge variant="neutral" size="xs">{r.classification}</Badge>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">{r.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Parallel Group Summary (if active in branch) */}
            {currentParallelGroup && (
              <div className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  Parallel Execution Group
                </span>
                <DataRow label="Branches" value={currentParallelGroup.branchCount} />
                <DataRow label="Total Spans" value={currentParallelGroup.totalSpanCount} />
                <DataRow label="Wall Time" value={`${currentParallelGroup.wallClockDurationMs}ms`} />
                <DataRow label="Longest Branch" value={`${currentParallelGroup.longestBranchDurationMs}ms`} />
                <DataRow label="Shortest Branch" value={`${currentParallelGroup.shortestBranchDurationMs}ms`} />
              </div>
            )}

            {/* Retry Chain Details (if active) */}
            {currentRetryChain && (
              <div className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-1.5">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  Retry Chain ({currentRetryChain.retryCount} retries)
                </span>
                <DataRow label="Operation" value={currentRetryChain.operationName} />
                <DataRow label="Failed Attempts" value={currentRetryChain.failedAttemptsCount} />
                <DataRow label="Outcome" value={currentRetryChain.finalStatus.toUpperCase()} />
                <DataRow label="Total Retry Time" value={`${currentRetryChain.totalRetryDurationMs}ms`} />
                <DataRow label="Total Retry Cost" value={`$${currentRetryChain.totalRetryCostUsd.toFixed(6)}`} />
              </div>
            )}

            {/* Failure Hotspots */}
            {intelligence?.failureHotspots && intelligence.failureHotspots.totalErrors > 0 && (
              <div className="p-3 rounded bg-red-950/20 border border-red-900/40 space-y-1.5">
                <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  Failure Hotspots
                </span>
                <DataRow label="Total Errors" value={intelligence.failureHotspots.totalErrors} />
                {intelligence.failureHotspots.mostFailedTool && (
                  <DataRow label="Most Failed Tool" value={intelligence.failureHotspots.mostFailedTool} />
                )}
                {intelligence.failureHotspots.mostRetriedOperation && (
                  <DataRow label="Most Retried" value={intelligence.failureHotspots.mostRetriedOperation} />
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FORK IDE */}
        {activeTab === 'fork' && span && (
          <div className="space-y-3 font-mono">
            <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] text-xs text-zinc-300 leading-relaxed font-sans">
              <span className="font-semibold text-white block mb-0.5 flex items-center gap-1 font-mono">
                <GitFork className="w-3.5 h-3.5 text-zinc-300" />
                Time-Travel Fork
              </span>
              Branch execution from this point. Preceding DAG nodes are replayed from cache with <strong>$0.00</strong> spend.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase block mb-1">Target Model</label>
                <Select
                  value={forkModel}
                  onChange={(e) => setForkModel(e.target.value)}
                >
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                  <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                </Select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 uppercase block mb-1">Agent Name</label>
                <Input
                  value={forkAgentName}
                  onChange={(e) => setForkAgentName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center justify-between">
                <span>Prompt / Messages JSON</span>
                <span className="text-zinc-500 font-normal">Array of &#123; role, content &#125;</span>
              </label>
              <textarea
                rows={9}
                value={forkMessagesJson}
                onChange={(e) => setForkMessagesJson(e.target.value)}
                className="w-full bg-[#09090b] border border-[#202024] rounded p-2 text-[11px] text-zinc-200 font-mono focus:outline-none focus:border-zinc-500 leading-relaxed resize-none"
              />
              {forkJsonError && (
                <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900 p-2 rounded">
                  {forkJsonError}
                </p>
              )}
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={isForking}
              isLoading={isForking}
              onClick={handleExecuteFork}
              icon={<GitFork className="w-3.5 h-3.5" />}
            >
              Fork & Execute From Here
            </Button>
          </div>
        )}

        {/* TAB 4: JSON */}
        {activeTab === 'json' && span && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Raw Span Object</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(span, null, 2));
                  setCopiedResponse(true);
                  setTimeout(() => setCopiedResponse(false), 2000);
                }}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
              >
                {copiedResponse ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                Copy JSON
              </button>
            </div>
            <pre className="p-2.5 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-[500px] leading-relaxed">
              {JSON.stringify(span, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
