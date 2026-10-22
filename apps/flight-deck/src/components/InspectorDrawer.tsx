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
  Package
} from 'lucide-react';
import type { TraceSpan, TraceRun, RunProvenance, BreakpointResolution } from '@/lib/api';
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
  run?: TraceRun | null;
  onClose: () => void;
  onForkSuccess: (newRunId: string) => void;
  onReplaySuccess?: (newRunId: string) => void;
  onSelectParentSpan?: (parentSpanId: string) => void;
  isHeldBreakpoint?: boolean;
  onResolveBreakpoint?: (spanId: string, resolution: BreakpointResolution) => Promise<void>;
  onToggleAgentBreakpoint?: (agentName: string) => void;
  isAgentBreakpointed?: boolean;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  span,
  run,
  onClose,
  onForkSuccess,
  onReplaySuccess,
  onSelectParentSpan,
  isHeldBreakpoint,
  onResolveBreakpoint,
  onToggleAgentBreakpoint,
  isAgentBreakpointed
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'fork' | 'json'>('inspector');
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

  if (!span) return null;

  const isIntercepted = Boolean(
    isHeldBreakpoint ||
    span.response_payload?.includes('"status":"intercepted"') ||
    span.response_payload?.includes('"status": "intercepted"') ||
    span.response_payload?.includes('"awaiting_human": true') ||
    span.response_payload?.includes('"awaiting_human":true')
  );

  const handleCopyId = () => {
    navigator.clipboard.writeText(span.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyResponse = () => {
    if (span.response_payload) {
      navigator.clipboard.writeText(span.response_payload);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  const handleExecuteReplay = async () => {
    setIsReplaying(true);
    setReplayError(null);
    try {
      const res = await replaySpan(span.id);
      if (onReplaySuccess) {
        onReplaySuccess(res.newRunId);
      }
    } catch (err: any) {
      setReplayError(err.message || 'Failed to replay from span');
    } finally {
      setIsReplaying(false);
    }
  };

  const handleExecuteFork = async () => {
    let parsedMessages: any[];
    try {
      parsedMessages = JSON.parse(forkMessagesJson);
      if (!Array.isArray(parsedMessages)) {
        throw new Error('Messages must be an array of chat messages');
      }
      setForkJsonError(null);
    } catch (err: any) {
      setForkJsonError(err.message || 'Invalid JSON');
      return;
    }

    setIsForking(true);
    try {
      const forkRes = await forkSpan(span.id, {
        new_run_name: `fork-${span.agent_name}-${Date.now().toString().slice(-4)}`,
        reason: 'time_travel_mutation'
      });

      const newRunId = forkRes.newRunId;

      const payload = {
        model: forkModel,
        messages: parsedMessages,
        temperature: 0.2
      };

      await postChatCompletion(payload, {
        'X-Run-Id': newRunId,
        'X-Parent-Span-Id': span.id,
        'X-Agent-Name': forkAgentName,
        'X-Mock-Upstream': 'true'
      });

      onForkSuccess(newRunId);
    } catch (err: any) {
      setForkJsonError(`Fork failed: ${err.message}`);
    } finally {
      setIsForking(false);
    }
  };

  const handleResolveResume = async () => {
    if (!onResolveBreakpoint) return;
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
    if (!onResolveBreakpoint) return;
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
    if (!onResolveBreakpoint) return;
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
  try {
    if (span.request_payload) parsedRequest = JSON.parse(span.request_payload);
  } catch {}
  try {
    if (span.response_payload) parsedResponse = JSON.parse(span.response_payload);
  } catch {}

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

  const createdTime = new Date(span.created_at).toISOString().split('T')[1]?.replace('Z', '') || `${span.created_at}`;

  return (
    <aside className="w-[460px] h-full border-l border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0 shadow-2xl z-20 select-none">
      {/* Drawer Header */}
      <div className="px-3.5 py-2.5 border-b border-[#202024] bg-[#09090b] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
          <span className="text-xs font-mono font-semibold tracking-wide text-zinc-200 uppercase shrink-0">Inspector</span>
          <button
            onClick={handleCopyId}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#18181c] text-zinc-400 hover:text-white border border-[#2c2c32] truncate max-w-[170px] transition-colors"
            title="Click to copy span ID"
          >
            <span className="truncate">{span.id}</span>
            {copiedId ? <Check className="w-2.5 h-2.5 text-white" /> : <Copy className="w-2.5 h-2.5" />}
          </button>
        </div>
        <IconButton label="Close Inspector (Esc)" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center border-b border-[#202024] bg-[#111114] px-3 font-mono text-xs">
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
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 font-mono text-xs select-text">
        {/* Live Breakpoint Intercept Box */}
        {isIntercepted && (
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

            {/* Editable Request Payload */}
            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold flex justify-between">
                <span>Mutate Request Payload</span>
                <span className="text-amber-500/80 font-normal">JSON</span>
              </label>
              <textarea
                rows={4}
                value={editedPayloadJson}
                onChange={(e) => setEditedPayloadJson(e.target.value)}
                className="w-full bg-[#0e0e11] border border-amber-700/60 rounded p-2 text-[11px] text-amber-100 font-mono focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
              />
            </div>

            {/* Mock Response Input */}
            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold block">
                Mock Response Override
              </label>
              <Input
                placeholder="Synthetic answer returned instantly with $0.00 cost..."
                value={mockResponseText}
                onChange={(e) => setMockResponseText(e.target.value)}
              />
            </div>

            {interceptError && (
              <p className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-800 p-2 rounded">
                {interceptError}
              </p>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <Button variant="primary" size="xs" onClick={handleResolveResume} disabled={isResolving} icon={<Play className="w-2.5 h-2.5 fill-current" />}>
                Resume
              </Button>
              <Button variant="secondary" size="xs" onClick={handleResolveMock} disabled={isResolving} icon={<FlaskConical className="w-2.5 h-2.5" />}>
                Mock ($0)
              </Button>
              <Button variant="danger" size="xs" onClick={handleResolveAbort} disabled={isResolving} icon={<Ban className="w-2.5 h-2.5" />}>
                Abort
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'inspector' && (
          <>
            {/* Quick Actions Strip */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExecuteReplay}
                disabled={isReplaying}
                isLoading={isReplaying}
                icon={<RotateCcw className="w-3 h-3 text-zinc-300" />}
                title="Replay historical execution prefix from this span"
              >
                Replay From Here
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setActiveTab('fork')}
                icon={<GitFork className="w-3 h-3" />}
                title="Branch execution from this span"
              >
                Fork From Here
              </Button>
            </div>

            {replayError && (
              <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900 p-2 rounded">
                {replayError}
              </p>
            )}

            {/* Lineage & Origin Card */}
            <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-[10px] uppercase font-semibold">Origin</span>
                <Badge
                  variant={
                    span.execution_origin === 'cached_replay' || span.cache_hit === 1
                      ? 'origin'
                      : span.execution_origin === 'modified'
                      ? 'origin'
                      : span.execution_origin === 'mocked'
                      ? 'origin'
                      : 'neutral'
                  }
                  origin={span.execution_origin as any}
                  size="xs"
                >
                  {span.execution_origin === 'cached_replay' || span.cache_hit === 1
                    ? 'CACHED REPLAY'
                    : span.execution_origin === 'modified'
                    ? 'MODIFIED'
                    : span.execution_origin === 'mocked'
                    ? 'MOCKED'
                    : span.execution_origin === 'new_execution'
                    ? 'NEW EXECUTION'
                    : 'ORIGINAL'}
                </Badge>
              </div>
              {span.source_span_id && (
                <DataRow label="Source Span ID" value={span.source_span_id} copyable />
              )}
            </div>

            {/* Run Provenance Card */}
            {run && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-zinc-400 text-[10px] uppercase font-semibold">Run Provenance</span>
                  </div>
                  {runProv?.reproducibility?.status && (
                    <Badge variant="neutral" size="xs">
                      {runProv.reproducibility.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  )}
                </div>

                {runProv?.git && (
                  <DataRow
                    label="Git Commit"
                    value={`${runProv.git.branch || 'detached'}@${runProv.git.short_sha || runProv.git.commit_sha?.slice(0, 7)} (${runProv.git.dirty ? 'DIRTY' : 'CLEAN'})`}
                    copyValue={runProv.git.commit_sha}
                    copyable
                  />
                )}

                {runProv?.dependencies && (
                  <DataRow
                    label="Lockfile"
                    value={`${runProv.dependencies.lockfile_type} (${runProv.dependencies.lockfile_fingerprint?.slice(0, 8)})`}
                    copyValue={runProv.dependencies.lockfile_fingerprint}
                    copyable
                  />
                )}

                {runProv?.environment && (
                  <DataRow
                    label="Environment"
                    value={`${runProv.environment.runtime?.name} ${runProv.environment.runtime?.version} · ${runProv.environment.os}`}
                  />
                )}
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
                      Tool Output {parsedResponse.is_error ? '(Error)' : '(Success)'}
                    </button>
                    {expandToolResult && (
                      <pre className={`p-2 rounded border text-[11px] overflow-x-auto max-h-36 ${
                        parsedResponse.is_error ? 'bg-rose-950/20 border-rose-900 text-rose-300' : 'bg-black/80 border-[#202024] text-zinc-300'
                      }`}>
                        {JSON.stringify(parsedResponse.result !== undefined ? parsedResponse.result : parsedResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Request Payload Section */}
            <div className="space-y-1">
              <button
                onClick={() => setExpandRequest((p) => !p)}
                className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 py-1"
              >
                <span className="flex items-center gap-1">
                  {expandRequest ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Request Payload
                </span>
                <span className="text-[10px] text-zinc-500 lowercase">{expandRequest ? 'collapse' : 'expand'}</span>
              </button>
              {expandRequest && (
                <pre className="p-2.5 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-48 leading-relaxed">
                  {parsedRequest ? JSON.stringify(parsedRequest, null, 2) : span.request_payload || 'No request payload'}
                </pre>
              )}
            </div>

            {/* Response Payload Section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between py-1">
                <button
                  onClick={() => setExpandResponse((p) => !p)}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
                >
                  {expandResponse ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Response Output
                </button>
                <button
                  onClick={handleCopyResponse}
                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                  title="Copy response JSON"
                >
                  {copiedResponse ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                  {copiedResponse ? 'Copied' : 'Copy'}
                </button>
              </div>
              {expandResponse && (
                <pre
                  className={`p-2.5 rounded border text-[11px] overflow-x-auto max-h-56 leading-relaxed ${
                    span.span_type === 'guardrail_block'
                      ? 'bg-rose-950/20 border-rose-800 text-rose-200'
                      : 'bg-[#09090b] border-[#202024] text-zinc-300'
                  }`}
                >
                  {parsedResponse ? JSON.stringify(parsedResponse, null, 2) : span.response_payload || 'No response payload'}
                </pre>
              )}
            </div>

            {/* Breakpoint Config Action */}
            {onToggleAgentBreakpoint && (
              <div className="pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => onToggleAgentBreakpoint(span.agent_name)}
                  icon={<Sliders className="w-3 h-3" />}
                >
                  {isAgentBreakpointed ? `Remove Breakpoint on ${span.agent_name}` : `Set Breakpoint on ${span.agent_name}`}
                </Button>
              </div>
            )}
          </>
        )}

        {activeTab === 'fork' && (
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

        {activeTab === 'json' && (
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
