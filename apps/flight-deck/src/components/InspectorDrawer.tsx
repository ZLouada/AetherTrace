'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Workflow,
  Zap,
  Layers,
  GitMerge,
  Share2,
  Pin,
  Sparkles,
  ListTree
} from 'lucide-react';
import type {
  TraceSpan,
  TraceRun,
  RunProvenance,
  BreakpointResolution,
  ExecutionIntelligence,
  AgentSummary
} from '@/lib/api';
import { forkSpan, replaySpan, postChatCompletion } from '@/lib/api';
import {
  Button,
  IconButton,
  Badge,
  DataRow,
  Select,
  Input
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
  isPinned?: boolean;
  onTogglePin?: (spanId: string) => void;
  selectedSpans?: TraceSpan[];
  onClearMultiSelection?: () => void;
  childSpans?: TraceSpan[];
  width?: number;
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
  isAgentBreakpointed,
  isPinned,
  onTogglePin,
  selectedSpans,
  onClearMultiSelection,
  childSpans,
  width = 400
}) => {
  // Navigation filter: 'all' shows the unified vertical document; other modes filter down to focused sections
  const [activeSection, setActiveSection] = useState<'all' | 'payload' | 'intelligence' | 'fork' | 'json'>('all');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedPromptIdx, setCopiedPromptIdx] = useState<number | null>(null);

  // Section collapse states
  const [expandPayload, setExpandPayload] = useState(true);
  const [expandIntelligence, setExpandIntelligence] = useState(true);
  const [expandChildren, setExpandChildren] = useState(true);
  const [expandFork, setExpandFork] = useState(false);
  const [expandJson, setExpandJson] = useState(false);

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

  // Multi-select aggregated metrics
  const multiSelectSummary = useMemo(() => {
    if (!selectedSpans || selectedSpans.length <= 1) return null;
    let totalCost = 0;
    let totalLatency = 0;
    let totalPromptTok = 0;
    let totalCompTok = 0;
    const models = new Set<string>();
    const agents = new Set<string>();
    let errorCount = 0;

    for (const s of selectedSpans) {
      totalCost += s.cost_usd || 0;
      totalLatency += s.latency_ms || 0;
      totalPromptTok += s.prompt_tokens || 0;
      totalCompTok += s.completion_tokens || 0;
      if (s.model) models.add(s.model);
      if (s.agent_name) agents.add(s.agent_name);
      if (
        s.span_type === 'guardrail_block' ||
        (s.response_payload &&
          (s.response_payload.includes('"error"') || s.response_payload.includes('"status":"error"')))
      ) {
        errorCount++;
      }
    }
    return {
      count: selectedSpans.length,
      totalCost,
      totalLatency,
      totalTokens: totalPromptTok + totalCompTok,
      models: Array.from(models),
      agents: Array.from(agents),
      errorCount
    };
  }, [selectedSpans]);

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

  const isError = Boolean(
    span &&
      (span.span_type === 'guardrail_block' ||
        (span.response_payload &&
          (span.response_payload.includes('"error"') ||
            span.response_payload.includes('"status":"error"') ||
            span.response_payload.includes('"is_error":true'))))
  );

  const handleCopyId = (idToCopy: string) => {
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyText = (text: string, type: 'json' | 'response' | 'prompt', index?: number) => {
    navigator.clipboard.writeText(text);
    if (type === 'json') {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } else if (type === 'response') {
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } else if (type === 'prompt' && index !== undefined) {
      setCopiedPromptIdx(index);
      setTimeout(() => setCopiedPromptIdx(null), 2000);
    }
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

      await postChatCompletion(
        {
          model: forkModel,
          messages: parsedMessages,
          temperature: 0.7
        },
        {
          runId: newRunId,
          runName: `${run?.name || 'Run'}-fork-${forkAgentName}`,
          agentName: forkAgentName,
          parentSpanId: span.id
        }
      );

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

  // Parsed payloads
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

  // Provenance extraction
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

  // Intelligence lookups
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

  // Determine Category details
  let CategoryIcon = Cpu;
  let categoryKey: 'LLM' | 'TOOL' | 'HTTP' | 'RETRY' | 'ERROR' | 'USER' | 'AGENT' = 'LLM';
  if (span?.span_type === 'tool_call') {
    CategoryIcon = Wrench;
    categoryKey = 'TOOL';
  } else if (span?.span_type === 'http_call') {
    CategoryIcon = Globe;
    categoryKey = 'HTTP';
  } else if (span?.span_type === 'retry') {
    CategoryIcon = RotateCcw;
    categoryKey = 'RETRY';
  } else if (span?.span_type === 'guardrail_block') {
    CategoryIcon = ShieldAlert;
    categoryKey = 'ERROR';
  } else if (span?.span_type === 'user_input') {
    CategoryIcon = User;
    categoryKey = 'USER';
  } else if (span?.span_type === 'agent_state' || (span?.span_type as string) === 'agent_dispatch') {
    CategoryIcon = Workflow;
    categoryKey = 'AGENT';
  }

  return (
    <aside
      className="h-full border-l border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0 shadow-2xl z-20 select-none overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* 1. STICKY HEADER */}
      <div className="px-3.5 py-2.5 border-b border-[#202024] bg-[#09090b] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {span ? (
            <>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isIntercepted
                    ? 'bg-amber-400 animate-ping'
                    : isError
                    ? 'bg-rose-500'
                    : 'bg-emerald-400'
                }`}
              />
              <Badge
                variant="category"
                category={categoryKey}
                size="xs"
                icon={<CategoryIcon className="w-3 h-3 shrink-0" />}
              >
                {span.agent_name}
              </Badge>
              <button
                onClick={() => handleCopyId(span.id)}
                className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#16161a] text-zinc-400 hover:text-white border border-[#27272a] truncate max-w-[140px] transition-colors cursor-pointer"
                title="Click to copy full span ID"
              >
                <span className="truncate">{span.id}</span>
                {copiedId ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </>
          ) : selectedAgent ? (
            <>
              <Workflow className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-xs font-mono font-semibold text-zinc-100 truncate">
                Agent: {selectedAgent.agentName}
              </span>
            </>
          ) : (
            <span className="text-xs font-mono font-semibold text-zinc-300">
              Inspector
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {span && onTogglePin && (
            <button
              onClick={() => onTogglePin(span.id)}
              className={`p-1 rounded transition-colors flex items-center gap-1 text-[11px] font-mono px-2 cursor-pointer ${
                isPinned
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#18181c] border border-[#27272a]'
              }`}
              title={isPinned ? 'Unpin Span (P)' : 'Pin Span (P)'}
            >
              <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span className="text-[10px]">{isPinned ? 'Pinned' : 'Pin'}</span>
            </button>
          )}
          <IconButton label="Close Inspector (Esc)" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {/* 2. SECTION ANCHOR NAV (Unified Navigation Bar) */}
      <div className="flex items-center border-b border-[#202024] bg-[#111114] px-2 py-1 font-mono text-[11px] gap-1 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveSection('all')}
          className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
            activeSection === 'all'
              ? 'bg-[#27272a] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-3 h-3" />
          Overview
        </button>
        {span && (
          <button
            onClick={() => setActiveSection('payload')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              activeSection === 'payload'
                ? 'bg-[#27272a] text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3 h-3" />
            Payload
          </button>
        )}
        <button
          onClick={() => setActiveSection('intelligence')}
          className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
            activeSection === 'intelligence'
              ? 'bg-[#27272a] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Workflow className="w-3 h-3 text-cyan-400" />
          Intelligence
        </button>
        {span && (
          <button
            onClick={() => setActiveSection('fork')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              activeSection === 'fork'
                ? 'bg-[#27272a] text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <GitFork className="w-3 h-3" />
            Fork IDE
          </button>
        )}
        {span && (
          <button
            onClick={() => setActiveSection('json')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              activeSection === 'json'
                ? 'bg-[#27272a] text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-3 h-3" />
            JSON
          </button>
        )}
      </div>

      {/* 3. UNIFIED SCROLLABLE DOCUMENT BODY */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs select-text">
        {/* MULTI-SELECTION SUMMARY BANNER */}
        {multiSelectSummary && (
          <div className="p-3 rounded bg-indigo-950/30 border border-indigo-600/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 uppercase">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Multi-Selection ({multiSelectSummary.count} Spans)
              </span>
              {onClearMultiSelection && (
                <button
                  onClick={onClearMultiSelection}
                  className="text-[10px] text-zinc-400 hover:text-white underline font-mono cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-[#09090b] p-2 rounded border border-[#202024]">
                <span className="text-zinc-400 text-[10px] block">Aggregated Cost</span>
                <span className="text-white font-mono font-semibold">
                  ${multiSelectSummary.totalCost.toFixed(5)}
                </span>
              </div>
              <div className="bg-[#09090b] p-2 rounded border border-[#202024]">
                <span className="text-zinc-400 text-[10px] block">Total Latency</span>
                <span className="text-white font-mono font-semibold">
                  {multiSelectSummary.totalLatency}ms
                </span>
              </div>
              <div className="bg-[#09090b] p-2 rounded border border-[#202024]">
                <span className="text-zinc-400 text-[10px] block">Combined Tokens</span>
                <span className="text-white font-mono font-semibold">
                  {multiSelectSummary.totalTokens}
                </span>
              </div>
              <div className="bg-[#09090b] p-2 rounded border border-[#202024]">
                <span className="text-zinc-400 text-[10px] block">Error Count</span>
                <span
                  className={`font-mono font-semibold ${
                    multiSelectSummary.errorCount > 0 ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                >
                  {multiSelectSummary.errorCount}
                </span>
              </div>
            </div>
            <div className="pt-1 flex flex-wrap gap-1">
              {selectedSpans?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSpan && onSelectSpan(s.id)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    s.id === span?.id
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-[#18181c] text-zinc-300 border-[#27272a] hover:border-zinc-500'
                  }`}
                >
                  {s.agent_name}:{s.model || s.span_type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LIVE BREAKPOINT INTERCEPTION CARD */}
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
              Execution is suspended. Mutate payload JSON before forwarding, return a synthetic mock ($0.00 cost), or abort.
            </p>

            {interceptError && (
              <p className="text-[11px] text-rose-300 bg-rose-950/50 border border-rose-800 p-2 rounded">
                {interceptError}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold">
                Mutate Payload JSON
              </label>
              <textarea
                rows={4}
                value={editedPayloadJson}
                onChange={(e) => setEditedPayloadJson(e.target.value)}
                className="w-full bg-[#09090b] border border-amber-600/50 rounded p-2 text-[11px] text-amber-100 font-mono focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-amber-300 uppercase font-semibold">
                Mock Response ($0.00)
              </label>
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

        {/* PRIMARY METRIC STRIP (High-density 4-tile grid) */}
        {span && (activeSection === 'all' || activeSection === 'payload') && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-sans flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-400" />
                Duration
              </span>
              <div className="text-sm font-semibold text-zinc-100">
                {span.cache_hit === 1 ? '0ms (cache)' : `${span.latency_ms}ms`}
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-sans flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-zinc-400" />
                Cost USD
              </span>
              <div className="text-sm font-semibold text-zinc-100">
                ${span.cost_usd > 0 ? span.cost_usd.toFixed(6) : '0.000000'}
              </div>
            </div>

            {/* Tokens Tile (Only shown if tokens exist to prevent fake zeroes) */}
            {span.prompt_tokens > 0 || span.completion_tokens > 0 ? (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-0.5">
                <span className="text-[10px] text-zinc-400 uppercase font-sans flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-zinc-400" />
                  Tokens
                </span>
                <div className="text-xs font-semibold text-zinc-100">
                  {span.prompt_tokens + span.completion_tokens}
                  <span className="text-zinc-400 font-normal ml-1 text-[10px]">
                    ({span.prompt_tokens} in / {span.completion_tokens} out)
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-0.5">
                <span className="text-[10px] text-zinc-400 uppercase font-sans flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-zinc-400" />
                  Type
                </span>
                <div className="text-xs font-semibold text-zinc-100 uppercase">
                  {span.span_type}
                </div>
              </div>
            )}

            <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-sans flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-zinc-400" />
                Origin / Status
              </span>
              <div className="text-xs font-semibold text-zinc-100 capitalize">
                {span.execution_origin || (isError ? 'Failed' : 'Success')}
              </div>
            </div>
          </div>
        )}

        {/* CRITICAL PATH NOTIFICATION STRIP */}
        {currentCriticalPathSpan && (activeSection === 'all' || activeSection === 'intelligence') && (
          <div className="p-2.5 rounded bg-amber-950/20 border border-amber-500/40 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
              <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              Critical Path Bottleneck
            </span>
            <span className="text-amber-200/80 font-mono text-[11px]">
              {currentCriticalPathSpan.durationMs}ms ({currentCriticalPathSpan.percentageOfCriticalPath}% of run)
            </span>
          </div>
        )}

        {/* EXECUTION LINEAGE & METADATA SECTION */}
        {span && (activeSection === 'all' || activeSection === 'payload') && (
          <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-1">
            <div className="flex items-center justify-between pb-1 border-b border-[#202024]">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                Execution Metadata
              </span>
              {runProv?.git && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <GitBranch className="w-2.5 h-2.5 text-zinc-400" />
                  {runProv.git.branch || 'main'}
                </span>
              )}
            </div>

            <DataRow label="Agent Name" value={span.agent_name} />
            <DataRow label="Target Model" value={span.model || '—'} />
            <DataRow
              label="Telemetry Source"
              value={
                span.id.startsWith('span_otel_') ? (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    OpenTelemetry OTLP
                  </span>
                ) : span.id.startsWith('span_lc_') ? (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    LangChain Adapter
                  </span>
                ) : span.id.startsWith('span_py_') ? (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Python SDK
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    AetherTrace SDK
                  </span>
                )
              }
            />
            <DataRow
              label="Parent Span"
              value={
                span.parent_span_id ? (
                  <button
                    onClick={() => onSelectParentSpan && onSelectParentSpan(span.parent_span_id!)}
                    className="text-zinc-200 hover:text-white flex items-center gap-1 font-mono text-[10px] cursor-pointer"
                    title="Jump to Parent Span ([)"
                  >
                    <span>{span.parent_span_id}</span>
                    <ArrowUpRight className="w-2.5 h-2.5 text-zinc-400" />
                  </button>
                ) : (
                  'None (Root Invocation)'
                )
              }
            />
          </div>
        )}

        {/* EVENT-SPECIFIC PAYLOAD SECTIONS */}
        {span && (activeSection === 'all' || activeSection === 'payload') && (
          <div className="space-y-2.5">
            {/* LLM Prompt Messages Section */}
            {parsedRequest?.messages && Array.isArray(parsedRequest.messages) && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1">
                    <FileText className="w-3 h-3 text-zinc-400" />
                    Input Messages ({parsedRequest.messages.length})
                  </span>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {parsedRequest.messages.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-[#09090b] border border-[#202024] space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span
                          className={`font-semibold uppercase px-1.5 py-0.5 rounded text-[9px] ${
                            m.role === 'system'
                              ? 'bg-zinc-800 text-zinc-300'
                              : m.role === 'user'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/50'
                              : 'bg-purple-950 text-purple-300 border border-purple-800/50'
                          }`}
                        >
                          {m.role || 'message'}
                        </span>
                        <button
                          onClick={() =>
                            handleCopyText(
                              typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                              'prompt',
                              idx
                            )
                          }
                          className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          title="Copy message content"
                        >
                          {copiedPromptIdx === idx ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                        </button>
                      </div>
                      <pre className="text-[11px] text-zinc-300 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-24 overflow-y-auto">
                        {typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LLM Completion Response */}
            {parsedResponse?.choices?.[0]?.message && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-zinc-400" />
                    Completion Output
                  </span>
                  <button
                    onClick={() =>
                      handleCopyText(
                        parsedResponse.choices[0].message.content || '',
                        'response'
                      )
                    }
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedResponse ? (
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-2.5 h-2.5" />
                    )}
                    Copy
                  </button>
                </div>
                <pre className="p-2 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-200 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto">
                  {parsedResponse.choices[0].message.content}
                </pre>
              </div>
            )}

            {/* Tool Calls Section */}
            {span.span_type === 'tool_call' && parsedRequest && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <Wrench className="w-3.5 h-3.5" />
                    Tool: <span className="font-mono text-white">{parsedRequest.tool_name || 'custom_tool'}</span>
                  </span>
                </div>

                {parsedRequest.arguments && (
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                      Arguments
                    </span>
                    <pre className="p-2 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-36">
                      {typeof parsedRequest.arguments === 'string'
                        ? parsedRequest.arguments
                        : JSON.stringify(parsedRequest.arguments, null, 2)}
                    </pre>
                  </div>
                )}

                {parsedResponse && (
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                      Output Result
                    </span>
                    <pre className="p-2 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-40">
                      {JSON.stringify(parsedResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Error or Guardrail Alert */}
            {isError && (
              <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/60 space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Execution Error / Guardrail Block
                </div>
                <pre className="p-2 rounded bg-[#09090b] border border-rose-900/50 text-[11px] text-rose-200 overflow-x-auto max-h-32">
                  {span.response_payload || 'Execution terminated with error'}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* CHILD SPANS NAVIGATION SECTION */}
        {childSpans && childSpans.length > 0 && (activeSection === 'all' || activeSection === 'payload') && (
          <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1">
                <ListTree className="w-3 h-3 text-zinc-400" />
                Child Spans ({childSpans.length})
              </span>
              <span className="text-[9px] text-zinc-400">Click to focus (])</span>
            </div>

            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {childSpans.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onSelectSpan && onSelectSpan(child.id)}
                  className="w-full p-1.5 rounded bg-[#16161a] hover:bg-[#202024] border border-[#202024] hover:border-zinc-500 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        child.span_type === 'guardrail_block' ? 'bg-rose-500' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-zinc-200 truncate">
                      {child.agent_name}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono truncate">
                      {child.model || child.span_type}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-zinc-400 shrink-0 pl-1">
                    {child.latency_ms}ms
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* INTELLIGENCE & CAUSAL CONTEXT SECTION */}
        {(activeSection === 'all' || activeSection === 'intelligence') && (
          <div className="space-y-2.5">
            {/* Agent Summary Card */}
            {currentAgentSummary && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                    Agent: {currentAgentSummary.agentName}
                  </span>
                  <Badge
                    variant="status"
                    status={currentAgentSummary.status === 'failed' ? 'error' : 'success'}
                    size="xs"
                  >
                    {currentAgentSummary.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <DataRow label="Depth" value={`Level ${currentAgentSummary.depth}`} />
                  <DataRow label="Parent" value={currentAgentSummary.parentAgentName || 'Root'} />
                  <DataRow
                    label="Duration"
                    value={`${(currentAgentSummary.durationMs / 1000).toFixed(2)}s`}
                  />
                  <DataRow label="Spans" value={currentAgentSummary.spanCount} />
                  <DataRow label="LLM Calls" value={currentAgentSummary.llmCallCount} />
                  <DataRow label="Tool Calls" value={currentAgentSummary.toolCallCount} />
                  <DataRow label="Retries" value={currentAgentSummary.retryCount} />
                  <DataRow label="Errors" value={currentAgentSummary.errorCount} />
                  <DataRow
                    label="Cost USD"
                    value={`$${currentAgentSummary.totalCostUsd.toFixed(6)}`}
                  />
                  <DataRow label="Tokens" value={currentAgentSummary.totalTokens} />
                </div>
              </div>
            )}

            {/* Causal Relations for Active Span */}
            {span && (causedByRelations.length > 0 || causedRelations.length > 0) && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5 text-zinc-400" />
                  Causal Reasoning Context
                </span>

                {causedByRelations.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                      Caused by:
                    </span>
                    {causedByRelations.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectSpan && onSelectSpan(r.sourceSpanId)}
                        className="p-1.5 rounded bg-[#16161a] hover:bg-[#202024] text-[11px] cursor-pointer space-y-0.5 border border-[#202024]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200 font-semibold">{r.relationType}</span>
                          <Badge variant="neutral" size="xs">
                            {r.classification}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">{r.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {causedRelations.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[#202024]">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                      Triggered Downstream:
                    </span>
                    {causedRelations.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectSpan && onSelectSpan(r.targetSpanId)}
                        className="p-1.5 rounded bg-[#16161a] hover:bg-[#202024] text-[11px] cursor-pointer space-y-0.5 border border-[#202024]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-200 font-semibold">{r.relationType}</span>
                          <Badge variant="neutral" size="xs">
                            {r.classification}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">{r.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Parallel Group Summary (if active) */}
            {currentParallelGroup && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                  Parallel Execution Group
                </span>
                <DataRow label="Branches" value={currentParallelGroup.branchCount} />
                <DataRow label="Total Spans" value={currentParallelGroup.totalSpanCount} />
                <DataRow label="Wall Time" value={`${currentParallelGroup.wallClockDurationMs}ms`} />
              </div>
            )}

            {/* Retry Chain Details (if active) */}
            {currentRetryChain && (
              <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-1.5">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  Retry Chain ({currentRetryChain.retryCount} retries)
                </span>
                <DataRow label="Operation" value={currentRetryChain.operationName} />
                <DataRow label="Failed Attempts" value={currentRetryChain.failedAttemptsCount} />
                <DataRow label="Outcome" value={currentRetryChain.finalStatus.toUpperCase()} />
              </div>
            )}
          </div>
        )}

        {/* FORK & BRANCH STUDIO SECTION */}
        {span && (activeSection === 'all' || activeSection === 'fork') && (
          <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-zinc-300" />
                Time-Travel Fork Studio
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                $0.00 cached replay
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase block mb-1">
                  Target Model
                </label>
                <Select value={forkModel} onChange={(e) => setForkModel(e.target.value)}>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                  <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                </Select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 uppercase block mb-1">
                  Agent Name
                </label>
                <Input value={forkAgentName} onChange={(e) => setForkAgentName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center justify-between">
                <span>Prompt Messages JSON</span>
                <span className="text-zinc-400 font-normal">Array of &#123; role, content &#125;</span>
              </label>
              <textarea
                rows={5}
                value={forkMessagesJson}
                onChange={(e) => setForkMessagesJson(e.target.value)}
                className="w-full bg-[#09090b] border border-[#202024] rounded p-2 text-[11px] text-zinc-200 font-mono focus:outline-none focus:border-zinc-500 leading-relaxed resize-none"
              />
              {forkJsonError && (
                <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900 p-1.5 rounded">
                  {forkJsonError}
                </p>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
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

        {/* PRIMARY ACTIONS: REPLAY & AGENT BREAKPOINTS */}
        {span && (activeSection === 'all' || activeSection === 'payload') && (
          <div className="pt-1 flex flex-col gap-2">
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
                {isAgentBreakpointed
                  ? `Remove Breakpoint on ${span.agent_name}`
                  : `Set Breakpoint on ${span.agent_name}`}
              </Button>
            )}
          </div>
        )}

        {/* RAW JSON SECTION */}
        {span && (activeSection === 'all' || activeSection === 'json') && (
          <div className="p-2.5 rounded bg-[#111114] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                Raw Span Object
              </span>
              <button
                onClick={() => handleCopyText(JSON.stringify(span, null, 2), 'json')}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedJson ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                Copy JSON
              </button>
            </div>
            <pre className="p-2 rounded bg-[#09090b] border border-[#202024] text-[11px] text-zinc-300 overflow-x-auto max-h-56 leading-relaxed">
              {JSON.stringify(span, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
