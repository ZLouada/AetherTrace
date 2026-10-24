'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/TopBar';
import { RunSidebar } from '@/components/RunSidebar';
import { DagCanvas } from '@/components/DagCanvas';
import { InspectorDrawer } from '@/components/InspectorDrawer';
import { Timeline } from '@/components/Timeline';
import { CommandPalette } from '@/components/CommandPalette';
import { ChaosModal } from '@/components/ChaosModal';
import { DiffArenaModal } from '@/components/DiffArenaModal';
import { BreakpointModal } from '@/components/BreakpointModal';
import { ExperimentStudio } from '@/components/ExperimentStudio';
import { EvaluationPanel } from '@/components/EvaluationPanel';
import { BreakpointHUD } from '@/components/BreakpointHUD';
import { ReplayContextBanner } from '@/components/ReplayContextBanner';
import { ActionFeedbackBanner, type ActionFeedback } from '@/components/ActionFeedbackBanner';
import { AppSidebar, type WorkspaceView } from '@/components/AppSidebar';
import { SplitPaneDivider } from '@/components/SplitPaneDivider';
import {
  fetchRuns,
  fetchRunSpans,
  fetchStats,
  postChatCompletion,
  exportRun,
  importRun,
  fetchBreakpoints,
  updateBreakpointConfig,
  resolveBreakpoint,
  fetchChaosConfig,
  updateChaosConfig,
  replaySpan,
  pauseRun,
  resumeRun,
  fetchRunIntelligence,
  getWsBase,
  WS_BASE,
  type TraceRun,
  type TraceSpan,
  type GlobalStats,
  type BreakpointConfig,
  type PendingBreakpoint,
  type BreakpointResolution,
  type ChaosConfig,
  type ExecutionIntelligence,
  type AgentSummary
} from '@/lib/api';

export default function FlightDeckPage() {
  const [runs, setRuns] = useState<TraceRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [dagDirection, setDagDirection] = useState<'TB' | 'LR'>('TB');

  // Agent Intelligence State (Phase 11)
  const [intelligence, setIntelligence] = useState<ExecutionIntelligence | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [collapsedAgentNames, setCollapsedAgentNames] = useState<Set<string>>(new Set());
  const [isCriticalPathFocused, setIsCriticalPathFocused] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Flight Deck Developer Workstation State (Phase 15)
  const [pinnedSpanIds, setPinnedSpanIds] = useState<Set<string>>(new Set());
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [hoveredSpanId, setHoveredSpanId] = useState<string | null>(null);

  // Debugger Panel States
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Breakpoints & Chaos State
  const [breakpointConfig, setBreakpointConfig] = useState<BreakpointConfig | null>(null);
  const [pendingBreakpoints, setPendingBreakpoints] = useState<PendingBreakpoint[]>([]);
  const [isBreakpointModalOpen, setIsBreakpointModalOpen] = useState<boolean>(false);
  const [chaosConfig, setChaosConfig] = useState<ChaosConfig | null>(null);
  const [isChaosModalOpen, setIsChaosModalOpen] = useState<boolean>(false);

  // Diff Arena State
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);
  const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
  const [diffTargetId, setDiffTargetId] = useState<string | null>(null);

  // Experiment Studio State (Phase 12)
  const [isExperimentStudioOpen, setIsExperimentStudioOpen] = useState<boolean>(false);

  // Evaluation & Optimization Studio State (Phase 13)
  const [isEvaluationPanelOpen, setIsEvaluationPanelOpen] = useState<boolean>(false);

  // Workspace Shell 2.0 State (Step 03)
  const [activeView, setActiveView] = useState<WorkspaceView>('debugger');
  const [sidebarWidth, setSidebarWidth] = useState<number>(240);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [inspectorWidth, setInspectorWidth] = useState<number>(400);

  // Step 07: Action Feedback State
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const handleCopyText = useCallback((text: string, label: string) => {
    try {
      navigator.clipboard.writeText(text);
      setActionFeedback({
        id: `copy_${Date.now()}`,
        type: 'copy',
        title: `${label} Copied`,
        message: text.length > 40 ? `${text.slice(0, 37)}...` : text,
        timestamp: Date.now()
      });
    } catch {
      // fallback
    }
  }, []);

  // Load persisted panel widths & collapsed state
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem('aethertrace:sidebar_width');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= 180 && parsed <= 380) setSidebarWidth(parsed);
      }
      const savedCollapsed = localStorage.getItem('aethertrace:sidebar_collapsed');
      if (savedCollapsed !== null) setIsSidebarCollapsed(savedCollapsed === 'true');

      const savedInspWidth = localStorage.getItem('aethertrace:inspector_width');
      if (savedInspWidth) {
        const parsed = parseInt(savedInspWidth, 10);
        if (!isNaN(parsed) && parsed >= 300 && parsed <= 640) setInspectorWidth(parsed);
      }

      const savedView = localStorage.getItem('aethertrace:active_view');
      if (savedView && ['debugger', 'diff', 'experiments', 'evaluations'].includes(savedView)) {
        setActiveView(savedView as WorkspaceView);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('aethertrace:sidebar_width', String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('aethertrace:sidebar_collapsed', String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('aethertrace:inspector_width', String(inspectorWidth));
    } catch {}
  }, [inspectorWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('aethertrace:active_view', activeView);
    } catch {}
  }, [activeView]);

  const handleResizeEnd = useCallback(() => {
    window.dispatchEvent(new Event('resize'));
  }, []);

  const handleToggleInspector = useCallback(() => {
    if (selectedSpan || selectedAgent) {
      setSelectedSpan(null);
      setSelectedAgent(null);
      setSelectedSpanIds(new Set());
    } else if (spans.length > 0) {
      setSelectedSpan(spans[0]);
      setSelectedSpanIds(new Set([spans[0].id]));
    }
  }, [selectedSpan, selectedAgent, spans]);

  const handlePreviousRun = useCallback(() => {
    if (runs.length <= 1) return;
    const currIdx = runs.findIndex((r) => r.id === selectedRunId);
    const prevIdx = currIdx <= 0 ? runs.length - 1 : currIdx - 1;
    setSelectedRunId(runs[prevIdx].id);
    setSelectedSpan(null);
  }, [runs, selectedRunId]);

  const handleNextRun = useCallback(() => {
    if (runs.length <= 1) return;
    const currIdx = runs.findIndex((r) => r.id === selectedRunId);
    const nextIdx = currIdx === -1 || currIdx >= runs.length - 1 ? 0 : currIdx + 1;
    setSelectedRunId(runs[nextIdx].id);
    setSelectedSpan(null);
  }, [runs, selectedRunId]);

  const selectedRunIdRef = useRef<string | null>(null);
  selectedRunIdRef.current = selectedRunId;

  // 1. Fetch Runs & Global Stats
  const loadRuns = useCallback(async (preferredRunId?: string) => {
    setIsLoadingRuns(true);
    try {
      const runList = await fetchRuns();
      setRuns(runList);

      if (runList.length > 0) {
        if (preferredRunId && runList.some((r) => r.id === preferredRunId)) {
          setSelectedRunId(preferredRunId);
        } else if (!selectedRunIdRef.current || !runList.some((r) => r.id === selectedRunIdRef.current)) {
          setSelectedRunId(runList[0].id);
        }
      }
    } catch (err) {
      console.error('[FlightDeck] Failed to load runs:', err);
    } finally {
      setIsLoadingRuns(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
    } catch (err) {
      console.error('[FlightDeck] Failed to load stats:', err);
    }
  }, []);

  // 2. Fetch Spans for Selected Run
  const loadSpansForRun = useCallback(async (runId: string) => {
    try {
      const data = await fetchRunSpans(runId);
      setSpans(data.spans);

      // Preserve or deselect span
      setSelectedSpan((prev) => {
        if (!prev) return null;
        return data.spans.find((s) => s.id === prev.id) || null;
      });
    } catch (err) {
      console.error(`[FlightDeck] Failed to load spans for ${runId}:`, err);
      setSpans([]);
    }
  }, []);

  const loadBreakpoints = useCallback(async () => {
    try {
      const data = await fetchBreakpoints();
      setBreakpointConfig(data.config);
      setPendingBreakpoints(data.pending || []);
    } catch (err) {
      console.error('[FlightDeck] Failed to load breakpoints:', err);
    }
  }, []);

  const loadChaosConfig = useCallback(async () => {
    try {
      const data = await fetchChaosConfig();
      setChaosConfig(data.config);
    } catch (err) {
      console.error('[FlightDeck] Failed to load chaos config:', err);
    }
  }, []);

  const loadIntelligence = useCallback(async (runId: string) => {
    try {
      const data = await fetchRunIntelligence(runId);
      setIntelligence(data);
    } catch (err) {
      console.error(`[FlightDeck] Failed to load intelligence for ${runId}:`, err);
      setIntelligence(null);
    }
  }, []);

  const handleToggleCollapseAgent = useCallback((agentName: string) => {
    setCollapsedAgentNames((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) {
        next.delete(agentName);
      } else {
        next.add(agentName);
      }
      return next;
    });
  }, []);

  const handleExpandAllAgents = useCallback(() => {
    setCollapsedAgentNames(new Set());
  }, []);

  const handleCollapseAllAgents = useCallback(() => {
    if (intelligence?.agents) {
      setCollapsedAgentNames(new Set(intelligence.agents.map((a) => a.agentName)));
    }
  }, [intelligence]);

  const handleToggleCriticalPathFocus = useCallback(() => {
    setIsCriticalPathFocused((prev) => !prev);
  }, []);

  const criticalPathSpanIds = React.useMemo(() => {
    if (!intelligence?.criticalPath?.spanIds) return undefined;
    return new Set<string>(intelligence.criticalPath.spanIds);
  }, [intelligence]);

  // Phase 15: Flight Deck Workstation Handlers
  const handleTogglePinSpan = useCallback((spanId: string) => {
    setPinnedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);

  const handleMultiSelectSpan = useCallback((span: TraceSpan, isShiftOrCmd: boolean) => {
    if (isShiftOrCmd) {
      setSelectedSpanIds((prev) => {
        const next = new Set(prev);
        if (next.has(span.id)) {
          next.delete(span.id);
        } else {
          next.add(span.id);
        }
        return next;
      });
      setSelectedSpan(span);
      setSelectedAgent(null);
    } else {
      setSelectedSpan(span);
      setSelectedSpanIds(new Set([span.id]));
      setSelectedAgent(null);
    }
  }, []);

  const handleNavigateParent = useCallback(() => {
    if (!selectedSpan || !selectedSpan.parent_span_id) return;
    const parent = spans.find((s) => s.id === selectedSpan.parent_span_id);
    if (parent) {
      setSelectedSpan(parent);
      setSelectedSpanIds(new Set([parent.id]));
      setSelectedAgent(null);
    }
  }, [selectedSpan, spans]);

  const handleNavigateChild = useCallback(() => {
    if (!selectedSpan) return;
    const child = spans.find((s) => s.parent_span_id === selectedSpan.id);
    if (child) {
      setSelectedSpan(child);
      setSelectedSpanIds(new Set([child.id]));
      setSelectedAgent(null);
    }
  }, [selectedSpan, spans]);

  const childSpans = React.useMemo(() => {
    if (!selectedSpan) return [];
    return spans.filter((s) => s.parent_span_id === selectedSpan.id);
  }, [selectedSpan, spans]);

  const multiSelectedSpansList = React.useMemo(() => {
    if (selectedSpanIds.size === 0) return [];
    return spans.filter((s) => selectedSpanIds.has(s.id));
  }, [selectedSpanIds, spans]);

  const activeRunDurationMs = React.useMemo(() => {
    if (!spans || spans.length === 0) return 0;
    let min = spans[0].created_at;
    let max = min;
    for (const s of spans) {
      const end = s.created_at + Math.max(10, s.latency_ms || 10);
      if (end > max) max = end;
    }
    return max - min;
  }, [spans]);

  const activeRunErrorCount = React.useMemo(() => {
    return spans.filter(
      (s) =>
        s.span_type === 'guardrail_block' ||
        Boolean(
          s.response_payload &&
            (s.response_payload.includes('"status":"error"') ||
              s.response_payload.includes('"is_error":true'))
        )
    ).length;
  }, [spans]);

  useEffect(() => {
    loadRuns();
    loadStats();
    loadBreakpoints();
    loadChaosConfig();
  }, [loadRuns, loadStats, loadBreakpoints, loadChaosConfig]);

  useEffect(() => {
    if (selectedRunId) {
      loadSpansForRun(selectedRunId);
      loadIntelligence(selectedRunId);
    } else {
      setSpans([]);
      setSelectedSpan(null);
      setIntelligence(null);
      setSelectedAgent(null);
    }
    setPinnedSpanIds(new Set());
    setSelectedSpanIds(new Set());
  }, [selectedRunId, loadSpansForRun, loadIntelligence]);

  // 3. Real-Time WebSocket Telemetry Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(getWsBase());

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const eventType = msg.type;
            const targetRunId = msg.runId || msg.data?.run_id || msg.data?.id;

            // Update stats
            loadStats();

            // Refresh runs list when runs or spans are created or updated
            if (
              eventType === 'RUN_CREATED' ||
              eventType === 'RUN_UPDATED' ||
              eventType === 'run:created' ||
              eventType === 'CIRCUIT_BREAKER_TRIPPED' ||
              eventType === 'BREAKPOINT_HIT' ||
              eventType === 'BREAKPOINT_RESOLVED'
            ) {
              fetchRuns().then((updated) => setRuns(updated));
              loadBreakpoints();
            }

            if (
              eventType === 'BREAKPOINT_CONFIG_UPDATED' ||
              eventType === 'BREAKPOINT_HIT' ||
              eventType === 'BREAKPOINT_RESOLVED'
            ) {
              loadBreakpoints();
            }

            if (
              eventType === 'CHAOS_CONFIG_UPDATED' ||
              eventType === 'CHAOS_INJECTED'
            ) {
              loadChaosConfig();
            }

            // If event belongs to currently active run, reload spans & intelligence immediately
            if (targetRunId && targetRunId === selectedRunIdRef.current) {
              loadSpansForRun(targetRunId);
              loadIntelligence(targetRunId);
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = () => {
          setWsConnected(false);
          ws?.close();
        };
      } catch {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 2000);
      }
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [loadStats, loadSpansForRun, loadIntelligence, loadBreakpoints, loadChaosConfig]);

  // 5. Simulation Handler
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    const simSeed = Date.now();
    const simRunId = `run_sim_${simSeed}`;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      // Step 1: Planner
      await postChatCompletion(
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are the Lead Planning Agent.' },
            { role: 'user', content: `Deconstruct task requirements for secure biometric authentication [Seed:${simSeed}]` }
          ]
        },
        {
          'X-Run-Id': simRunId,
          'X-Agent-Name': 'Planner',
          'X-Max-Budget-USD': '0.05',
          'X-Mock-Upstream': 'true'
        }
      );

      setSelectedRunId(simRunId);
      await loadRuns(simRunId);
      await sleep(350);

      // Step 2: Researcher
      await postChatCompletion(
        {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are the Cryptographic Researcher Agent.' },
            { role: 'user', content: 'Survey zero-knowledge proof protocols compatible with WebAuthn.' }
          ]
        },
        {
          'X-Run-Id': simRunId,
          'X-Agent-Name': 'Researcher',
          'X-Mock-Upstream': 'true'
        }
      );
      await sleep(350);

      // Step 3: Coder
      await postChatCompletion(
        {
          model: 'claude-3-5-sonnet-20241022',
          messages: [
            { role: 'system', content: 'You are the Core Implementation Agent.' },
            { role: 'user', content: 'Generate Rust FFI bindings for biometric enclave attestations.' }
          ]
        },
        {
          'X-Run-Id': simRunId,
          'X-Agent-Name': 'Coder',
          'X-Mock-Upstream': 'true'
        }
      );
      await sleep(350);

      // Step 4: Reviewer
      await postChatCompletion(
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are the Automated Security Reviewer.' },
            { role: 'user', content: 'Perform static taint analysis and memory safety verification.' }
          ]
        },
        {
          'X-Run-Id': simRunId,
          'X-Agent-Name': 'Reviewer',
          'X-Mock-Upstream': 'true'
        }
      );
      await sleep(350);

      await loadRuns(simRunId);
      await loadSpansForRun(simRunId);
      await loadStats();
    } catch (err) {
      console.error('[FlightDeck] Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExportTrace = async () => {
    if (!selectedRunId) return;
    try {
      await exportRun(selectedRunId);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleImportTrace = async (file: File) => {
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const result = await importRun(bundle);
      await loadRuns(result.runId);
      setSelectedRunId(result.runId);
      await loadSpansForRun(result.runId);
      await loadStats();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleToggleBreakpoints = async () => {
    try {
      const newEnabled = !breakpointConfig?.enabled;
      const res = await updateBreakpointConfig({ enabled: newEnabled });
      setBreakpointConfig(res.config);
    } catch (err: any) {
      alert(`Failed to update breakpoints: ${err.message}`);
    }
  };

  const handleToggleAgentBreakpoint = async (agentName: string) => {
    try {
      const currentList = breakpointConfig?.matchAgentNames || [];
      const updatedList = currentList.includes(agentName)
        ? currentList.filter((a) => a !== agentName)
        : [...currentList, agentName];

      const res = await updateBreakpointConfig({
        enabled: true,
        matchAgentNames: updatedList
      });
      setBreakpointConfig(res.config);
    } catch (err: any) {
      alert(`Failed to update breakpoint for agent: ${err.message}`);
    }
  };

  const handlePauseRun = async (runId?: string) => {
    const target = runId || selectedRunId;
    if (!target) return;
    try {
      await pauseRun(target);
      await loadRuns(target);
    } catch (err: any) {
      alert(`Failed to pause run: ${err.message}`);
    }
  };

  const handleResumeRun = async (runId?: string) => {
    const target = runId || selectedRunId;
    if (!target) return;
    try {
      await resumeRun(target);
      await loadRuns(target);
    } catch (err: any) {
      alert(`Failed to resume run: ${err.message}`);
    }
  };

  const handleReplayFromSelected = async () => {
    if (!selectedSpan) return;
    try {
      const res = await replaySpan(selectedSpan.id);
      await loadRuns(res.newRunId);
      setSelectedRunId(res.newRunId);
      await loadSpansForRun(res.newRunId);
      await loadStats();
      setActionFeedback({
        id: String(Date.now()),
        type: 'replay',
        title: 'Replay Created',
        message: 'Replay execution started with cached prefix.',
        runId: res.newRunId,
        sourceRunId: selectedRunId || undefined,
        timestamp: Date.now()
      });
    } catch (err: any) {
      alert(`Replay failed: ${err.message}`);
    }
  };

  const handleSaveChaosConfig = async (newCfg: Partial<ChaosConfig>) => {
    const res = await updateChaosConfig(newCfg);
    setChaosConfig(res.config);
  };

  const handleResolveBreakpoint = async (spanId: string, resolution: BreakpointResolution) => {
    await resolveBreakpoint(spanId, resolution);
    await loadBreakpoints();
    if (selectedRunId) {
      await loadSpansForRun(selectedRunId);
      await loadRuns(selectedRunId);
    }
  };

  const handleSelectSpanFromStudio = useCallback(
    async (spanId: string, runId?: string) => {
      const targetRunId = runId || selectedRunId;
      if (targetRunId && targetRunId !== selectedRunId) {
        setSelectedRunId(targetRunId);
        try {
          const data = await fetchRunSpans(targetRunId);
          setSpans(data.spans);
          const target = data.spans.find((s) => s.id === spanId);
          if (target) {
            setSelectedSpan(target);
            setSelectedSpanIds(new Set([target.id]));
            setSelectedAgent(null);
          }
        } catch (err) {
          console.error('[FlightDeck] Failed to load spans for inspected run:', err);
        }
      } else {
        const target = spans.find((s) => s.id === spanId);
        if (target) {
          setSelectedSpan(target);
          setSelectedSpanIds(new Set([target.id]));
          setSelectedAgent(null);
        }
      }
      setActiveView('debugger');
    },
    [selectedRunId, spans]
  );

  const handleOpenDiffModal = (baseId?: string, targetId?: string) => {
    if (baseId && targetId) {
      setDiffBaseId(baseId);
      setDiffTargetId(targetId);
    } else if (selectedRunId) {
      setDiffTargetId(selectedRunId);
      const selected = runs.find((r) => r.id === selectedRunId);
      if (selected?.parent_run_id) {
        setDiffBaseId(selected.parent_run_id);
      } else {
        const otherRun = runs.find((r) => r.id !== selectedRunId);
        setDiffBaseId(otherRun?.id || null);
      }
    }
    setActiveView('diff');
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

  // Step 07: Breakpoint & Execution State computation
  const activePendingBreakpoint = React.useMemo(() => {
    if (pendingBreakpoints.length === 0) return null;
    if (selectedRunId) {
      const match = pendingBreakpoints.find((p) => p.runId === selectedRunId);
      if (match) return match;
    }
    return pendingBreakpoints[0];
  }, [pendingBreakpoints, selectedRunId]);

  const pendingBreakpointSpanIds = React.useMemo(() => {
    return new Set<string>(pendingBreakpoints.map((p) => p.spanId));
  }, [pendingBreakpoints]);

  const interceptedSpan = React.useMemo(() => {
    if (activePendingBreakpoint) {
      return spans.find((s) => s.id === activePendingBreakpoint.spanId) || null;
    }
    return spans.find((s) =>
      s.response_payload?.includes('"status":"intercepted"') ||
      s.response_payload?.includes('"awaiting_human": true') ||
      s.response_payload?.includes('"awaiting_human":true')
    ) || null;
  }, [activePendingBreakpoint, spans]);

  const isRunPaused = Boolean(
    selectedRun?.status === 'paused' ||
    activePendingBreakpoint !== null ||
    interceptedSpan !== null
  );

  const handleHUDContinue = useCallback(async () => {
    if (activePendingBreakpoint) {
      await handleResolveBreakpoint(activePendingBreakpoint.spanId, { action: 'resume' });
    } else if (interceptedSpan) {
      await handleResolveBreakpoint(interceptedSpan.id, { action: 'resume' });
    } else if (selectedRun?.status === 'paused') {
      await handleResumeRun(selectedRun.id);
    }
  }, [activePendingBreakpoint, interceptedSpan, selectedRun, handleResolveBreakpoint, handleResumeRun]);

  const handleHUDMock = useCallback(async () => {
    const targetSpanId = activePendingBreakpoint?.spanId || interceptedSpan?.id;
    if (targetSpanId) {
      await handleResolveBreakpoint(targetSpanId, {
        action: 'mock',
        mockedResponse: '{"status":"mocked","result":"Synthetic response ($0.00)"}'
      });
    } else if (selectedSpan) {
      handleToggleInspector();
    }
  }, [activePendingBreakpoint, interceptedSpan, selectedSpan, handleResolveBreakpoint, handleToggleInspector]);

  const handleHUDAbort = useCallback(async () => {
    const targetSpanId = activePendingBreakpoint?.spanId || interceptedSpan?.id;
    if (targetSpanId) {
      await handleResolveBreakpoint(targetSpanId, { action: 'abort' });
    } else if (selectedRun?.status === 'running') {
      await handlePauseRun(selectedRun.id);
    }
  }, [activePendingBreakpoint, interceptedSpan, selectedRun, handleResolveBreakpoint, handlePauseRun]);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

      // Cmd+K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((p) => !p);
        return;
      }

      // Cmd+B / Ctrl+B: Toggle Sidebar Collapsed
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((p) => !p);
        window.dispatchEvent(new Event('resize'));
        return;
      }

      // Alt+[ or Alt+ArrowUp: Previous Run Navigation
      if (e.altKey && (e.key === '[' || e.key === 'ArrowUp')) {
        e.preventDefault();
        handlePreviousRun();
        return;
      }

      // Alt+] or Alt+ArrowDown: Next Run Navigation
      if (e.altKey && (e.key === ']' || e.key === 'ArrowDown')) {
        e.preventDefault();
        handleNextRun();
        return;
      }

      // Escape: Close open drawers or modals, or return to debugger view
      if (e.key === 'Escape') {
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
          return;
        }
        if (isBreakpointModalOpen) {
          setIsBreakpointModalOpen(false);
          return;
        }
        if (isChaosModalOpen) {
          setIsChaosModalOpen(false);
          return;
        }
        if (isDiffModalOpen) {
          setIsDiffModalOpen(false);
          return;
        }
        if (isExperimentStudioOpen) {
          setIsExperimentStudioOpen(false);
          return;
        }
        if (isEvaluationPanelOpen) {
          setIsEvaluationPanelOpen(false);
          return;
        }
        if (selectedSpan || selectedAgent) {
          setSelectedSpan(null);
          setSelectedAgent(null);
          setSelectedSpanIds(new Set());
          return;
        }
        if (activeView !== 'debugger') {
          setActiveView('debugger');
          return;
        }
      }

      if (isInput) return;

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case '1':
          e.preventDefault();
          setActiveView('debugger');
          break;
        case '2':
          e.preventDefault();
          setActiveView('diff');
          break;
        case '3':
          e.preventDefault();
          setActiveView('experiments');
          break;
        case '4':
          e.preventDefault();
          setActiveView('evaluations');
          break;
        case 't':
          e.preventDefault();
          setIsTimelineOpen((prev) => !prev);
          break;
        case 'i':
          e.preventDefault();
          handleToggleInspector();
          break;
        case 'b':
          e.preventDefault();
          handleToggleBreakpoints();
          break;
        case 'd':
          e.preventDefault();
          handleOpenDiffModal();
          break;
        case 'c':
          e.preventDefault();
          setIsChaosModalOpen(true);
          break;
        case 'x':
          e.preventDefault();
          setIsExperimentStudioOpen(true);
          break;
        case 'e':
          e.preventDefault();
          setIsEvaluationPanelOpen((p) => !p);
          break;
        case ' ': // Space: Continue breakpoint or Pause / Resume current run
          e.preventDefault();
          if (activePendingBreakpoint || interceptedSpan) {
            handleHUDContinue();
          } else {
            const activeRun = runs.find((r) => r.id === selectedRunId);
            if (activeRun) {
              if (activeRun.status === 'running') {
                handlePauseRun(activeRun.id);
              } else if (activeRun.status === 'paused') {
                handleResumeRun(activeRun.id);
              }
            }
          }
          break;
        case 'm':
          if (activePendingBreakpoint || interceptedSpan) {
            e.preventDefault();
            handleHUDMock();
          }
          break;
        case 'p':
          if (selectedSpan) {
            e.preventDefault();
            handleTogglePinSpan(selectedSpan.id);
          }
          break;
        case '[':
          e.preventDefault();
          handleNavigateParent();
          break;
        case ']':
          e.preventDefault();
          handleNavigateChild();
          break;
        case 'f':
          e.preventDefault();
          setActiveFilter((current) => {
            const cycle = ['all', 'pinned', 'agents', 'llms', 'tools', 'retries', 'errors'];
            const idx = cycle.indexOf(current);
            return cycle[(idx + 1) % cycle.length];
          });
          break;
        case 'arrowdown':
        case 'j':
          if (spans.length > 0) {
            e.preventDefault();
            const currIdx = spans.findIndex((s) => s.id === selectedSpan?.id);
            const nextIdx = currIdx === -1 ? 0 : Math.min(spans.length - 1, currIdx + 1);
            setSelectedSpan(spans[nextIdx]);
            setSelectedSpanIds(new Set([spans[nextIdx].id]));
          }
          break;
        case 'arrowup':
        case 'k':
          if (spans.length > 0) {
            e.preventDefault();
            const currIdx = spans.findIndex((s) => s.id === selectedSpan?.id);
            const prevIdx = currIdx <= 0 ? spans.length - 1 : currIdx - 1;
            setSelectedSpan(spans[prevIdx]);
            setSelectedSpanIds(new Set([spans[prevIdx].id]));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCommandPaletteOpen,
    isChaosModalOpen,
    isDiffModalOpen,
    isExperimentStudioOpen,
    isEvaluationPanelOpen,
    isBreakpointModalOpen,
    selectedSpan,
    selectedAgent,
    activeView,
    spans,
    selectedRunId,
    runs,
    activePendingBreakpoint,
    interceptedSpan,
    handleHUDContinue,
    handleHUDMock,
    handleTogglePinSpan,
    handleNavigateParent,
    handleNavigateChild,
    handlePreviousRun,
    handleNextRun,
    handleToggleInspector,
    handleToggleBreakpoints,
    handleOpenDiffModal,
    handlePauseRun,
    handleResumeRun
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas">
      {/* Top Telemetry & Control Header */}
      <TopBar
        wsConnected={wsConnected}
        stats={stats}
        onRefreshStats={loadStats}
        onRunSimulation={handleRunSimulation}
        isSimulating={isSimulating}
        selectedRun={selectedRun}
        onExportTrace={handleExportTrace}
        onImportTrace={handleImportTrace}
        breakpointConfig={breakpointConfig}
        pendingBreakpointsCount={pendingBreakpoints.length}
        onToggleBreakpoints={handleToggleBreakpoints}
        onOpenBreakpointModal={() => setIsBreakpointModalOpen(true)}
        chaosConfig={chaosConfig}
        onOpenChaosModal={() => setIsChaosModalOpen(true)}
        onOpenDiffModal={() => handleOpenDiffModal()}
        onOpenExperimentStudio={() => setActiveView('experiments')}
        onOpenEvaluationPanel={() => setActiveView('evaluations')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleTimeline={() => setIsTimelineOpen((p) => !p)}
        isTimelineOpen={isTimelineOpen}
        onPauseRun={() => handlePauseRun()}
        onResumeRun={() => handleResumeRun()}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        isInspectorOpen={Boolean(selectedSpan || selectedAgent)}
        onToggleInspector={handleToggleInspector}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Activity Rail */}
        <AppSidebar
          activeView={activeView}
          onSelectView={setActiveView}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenChaos={() => setIsChaosModalOpen(true)}
          onOpenBreakpoints={() => setIsBreakpointModalOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          wsConnected={wsConnected}
          pendingBreakpointsCount={pendingBreakpoints.length}
          chaosEnabled={Boolean(chaosConfig?.enabled)}
        />

        {/* Resizable Left Runs Sidebar (when expanded) */}
        {!isSidebarCollapsed && (
          <>
            <RunSidebar
              width={sidebarWidth}
              runs={runs}
              selectedRunId={selectedRunId}
              onSelectRun={(runId) => {
                setSelectedRunId(runId);
                setSelectedSpan(null);
              }}
              onRefreshRuns={() => loadRuns()}
              isLoading={isLoadingRuns}
              onCompareRuns={(baseId, targetId) => handleOpenDiffModal(baseId, targetId)}
              onPauseRun={(rId) => handlePauseRun(rId)}
              onResumeRun={(rId) => handleResumeRun(rId)}
              activeRunSpansCount={spans.length}
              activeRunDurationMs={activeRunDurationMs}
              activeRunErrorCount={activeRunErrorCount}
            />

            <SplitPaneDivider
              onResize={(delta) => {
                setSidebarWidth((prev) => Math.min(380, Math.max(180, prev + delta)));
              }}
              onResizeEnd={handleResizeEnd}
              onDoubleClick={() => setSidebarWidth(240)}
              title="Double-click to reset runs sidebar width (240px)"
            />
          </>
        )}

        {/* Center Workspace Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
          {activeView === 'debugger' && (
            <>
              {/* Step 07: Debugger Breakpoint HUD 2.0 (Integrated paused / interception HUD) */}
              <BreakpointHUD
                isPaused={isRunPaused}
                pendingBreakpoint={activePendingBreakpoint}
                interceptedSpan={interceptedSpan}
                onContinue={handleHUDContinue}
                onMock={handleHUDMock}
                onAbort={handleHUDAbort}
                onInspectSpan={(spanId) => {
                  const s = spans.find((item) => item.id === spanId);
                  if (s) {
                    setSelectedSpan(s);
                    setSelectedSpanIds(new Set([s.id]));
                    setSelectedAgent(null);
                  }
                }}
              />

              {/* Step 07: Replay & Fork Context Banner (Source run lineage & comparison) */}
              <ReplayContextBanner
                run={selectedRun}
                onSelectRun={(runId) => {
                  setSelectedRunId(runId);
                  setSelectedSpan(null);
                }}
                onCompareWithSource={(sourceId, targetId) => handleOpenDiffModal(sourceId, targetId)}
              />

              <div className="flex-1 flex overflow-hidden min-h-0 relative">
                {/* Center Pane: Interactive React Flow DAG */}
                <DagCanvas
                  selectedRun={selectedRun}
                  spans={spans}
                  selectedSpanId={selectedSpan?.id || null}
                  onSelectSpan={(span) => {
                    setSelectedSpan(span);
                    setSelectedSpanIds(new Set([span.id]));
                    setSelectedAgent(null);
                  }}
                  onClearSelection={() => {
                    setSelectedSpan(null);
                    setSelectedAgent(null);
                    setSelectedSpanIds(new Set());
                  }}
                  pendingBreakpointSpanIds={pendingBreakpointSpanIds}
                  direction={dagDirection}
                  onToggleDirection={() => setDagDirection((d) => (d === 'TB' ? 'LR' : 'TB'))}
                  intelligence={intelligence}
                  collapsedAgentNames={collapsedAgentNames}
                  onToggleCollapseAgent={handleToggleCollapseAgent}
                  onExpandAllAgents={handleExpandAllAgents}
                  onCollapseAllAgents={handleCollapseAllAgents}
                  isCriticalPathFocused={isCriticalPathFocused}
                  onToggleCriticalPathFocus={handleToggleCriticalPathFocus}
                  activeFilter={activeFilter}
                  onSelectFilter={setActiveFilter}
                  pinnedSpanIds={pinnedSpanIds}
                  selectedSpanIds={selectedSpanIds}
                  onMultiSelectSpan={handleMultiSelectSpan}
                  hoveredSpanId={hoveredSpanId}
                  onHoverSpan={setHoveredSpanId}
                  onSelectAgentGroup={(agent) => {
                    setSelectedAgent(agent);
                    setSelectedSpan(null);
                    setCollapsedAgentNames((prev) => {
                      const next = new Set(prev);
                      next.delete(agent.agentName);
                      return next;
                    });
                  }}
                />

                {/* Split Pane Divider between Center Canvas and Inspector */}
                {(selectedSpan || selectedAgent) && (
                  <SplitPaneDivider
                    onResize={(delta) => {
                      setInspectorWidth((prev) => Math.min(640, Math.max(300, prev - delta)));
                    }}
                    onResizeEnd={handleResizeEnd}
                    onDoubleClick={() => setInspectorWidth(400)}
                    title="Double-click to reset inspector width (400px)"
                  />
                )}

                {/* Right Pane: Upgraded Event Inspector & Fork IDE */}
                {(selectedSpan || selectedAgent) && (
                  <InspectorDrawer
                    width={inspectorWidth}
                    span={selectedSpan}
                    selectedAgent={selectedAgent}
                    intelligence={intelligence}
                    run={selectedRun}
                    onClose={() => {
                      setSelectedSpan(null);
                      setSelectedAgent(null);
                      setSelectedSpanIds(new Set());
                    }}
                    onForkSuccess={(newRunId) => {
                      loadRuns(newRunId);
                      setSelectedRunId(newRunId);
                      setActionFeedback({
                        id: String(Date.now()),
                        type: 'fork',
                        title: 'Fork Created Successfully',
                        message: 'Execution branched at selected span.',
                        runId: newRunId,
                        sourceRunId: selectedRunId || undefined,
                        timestamp: Date.now()
                      });
                    }}
                    onReplaySuccess={(newRunId) => {
                      loadRuns(newRunId);
                      setSelectedRunId(newRunId);
                      setActionFeedback({
                        id: String(Date.now()),
                        type: 'replay',
                        title: 'Replay Created',
                        message: 'Replay execution started with cached prefix.',
                        runId: newRunId,
                        sourceRunId: selectedRunId || undefined,
                        timestamp: Date.now()
                      });
                    }}
                    onSelectParentSpan={(parentSpanId) => {
                      const p = spans.find((s) => s.id === parentSpanId);
                      if (p) {
                        setSelectedSpan(p);
                        setSelectedSpanIds(new Set([p.id]));
                        setSelectedAgent(null);
                      }
                    }}
                    onSelectSpan={(spanId) => {
                      const s = spans.find((item) => item.id === spanId);
                      if (s) {
                        setSelectedSpan(s);
                        setSelectedSpanIds(new Set([s.id]));
                        setSelectedAgent(null);
                      }
                    }}
                    isHeldBreakpoint={Boolean(selectedSpan && pendingBreakpoints.some((p) => p.spanId === selectedSpan.id))}
                    onResolveBreakpoint={handleResolveBreakpoint}
                    onToggleAgentBreakpoint={handleToggleAgentBreakpoint}
                    isAgentBreakpointed={Boolean(
                      selectedSpan && breakpointConfig?.matchAgentNames.includes(selectedSpan.agent_name)
                    )}
                    isPinned={Boolean(selectedSpan && pinnedSpanIds.has(selectedSpan.id))}
                    onTogglePin={handleTogglePinSpan}
                    selectedSpans={multiSelectedSpansList.length > 1 ? multiSelectedSpansList : undefined}
                    onClearMultiSelection={() => setSelectedSpanIds(new Set(selectedSpan ? [selectedSpan.id] : []))}
                    childSpans={childSpans}
                  />
                )}
              </div>

              {/* Bottom Pane: Execution Timeline Waterfall */}
              <Timeline
                spans={spans}
                selectedSpanId={selectedSpan?.id || null}
                onSelectSpan={(span) => {
                  setSelectedSpan(span);
                  setSelectedSpanIds(new Set([span.id]));
                  setSelectedAgent(null);
                }}
                isOpen={isTimelineOpen}
                onToggleOpen={() => setIsTimelineOpen((p) => !p)}
                selectedRun={selectedRun}
                criticalPathSpanIds={criticalPathSpanIds}
                pinnedSpanIds={pinnedSpanIds}
                hoveredSpanId={hoveredSpanId}
                onHoverSpan={setHoveredSpanId}
                selectedSpanIds={selectedSpanIds}
                onMultiSelectSpan={handleMultiSelectSpan}
                pausedSpanId={activePendingBreakpoint?.spanId || interceptedSpan?.id || null}
              />
            </>
          )}

          {activeView === 'diff' && (
            <div className="flex-1 h-full overflow-hidden">
              <DiffArenaModal
                isOpen={true}
                embedded={true}
                onClose={() => setActiveView('debugger')}
                runs={runs}
                initialBaseId={diffBaseId}
                initialTargetId={diffTargetId}
                onSelectSpan={(spanId, runId) => handleSelectSpanFromStudio(spanId, runId)}
              />
            </div>
          )}

          {activeView === 'experiments' && (
            <div className="flex-1 h-full overflow-hidden">
              <ExperimentStudio
                isOpen={true}
                embedded={true}
                onClose={() => setActiveView('debugger')}
                runs={runs}
                selectedRunId={selectedRunId}
                onSelectRun={(runId) => {
                  setSelectedRunId(runId);
                  setSelectedSpan(null);
                  loadSpansForRun(runId);
                }}
                onSelectSpan={(spanId, runId) => handleSelectSpanFromStudio(spanId, runId)}
                onOpenDiffModal={(baseId, targetId) => handleOpenDiffModal(baseId, targetId)}
              />
            </div>
          )}

          {activeView === 'evaluations' && (
            <div className="flex-1 h-full overflow-hidden">
              <EvaluationPanel
                isOpen={true}
                embedded={true}
                onClose={() => setActiveView('debugger')}
                selectedRun={runs.find((r) => r.id === selectedRunId) || null}
                runs={runs}
                onSelectSpan={(spanId) => handleSelectSpanFromStudio(spanId)}
                onOpenDiffModal={(baseId, targetId) => handleOpenDiffModal(baseId, targetId)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Lightweight Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => {
          setSelectedRunId(runId);
          setSelectedSpan(null);
        }}
        spans={spans}
        selectedSpan={selectedSpan}
        onSelectSpan={(span) => {
          setSelectedSpan(span);
          setSelectedSpanIds(new Set([span.id]));
          setActiveView('debugger');
        }}
        onSelectView={(view) => setActiveView(view)}
        onSelectSearchResult={async (res) => {
          if (res.type === 'run') {
            setSelectedRunId(res.runId);
            setSelectedSpan(null);
            setActiveView('debugger');
          } else if (res.spanId) {
            handleSelectSpanFromStudio(res.spanId, res.runId);
          }
        }}
        onPauseRun={() => handlePauseRun()}
        onResumeRun={() => handleResumeRun()}
        onReplaySpan={() => handleReplayFromSelected()}
        onForkSpan={() => {
          if (selectedSpan) {
            setSelectedSpan(selectedSpan);
            setActiveView('debugger');
          }
        }}
        onToggleBreakpoints={() => handleToggleBreakpoints()}
        onToggleTimeline={() => setIsTimelineOpen((p) => !p)}
        onOpenDiffModal={() => handleOpenDiffModal()}
        onOpenChaosModal={() => setIsChaosModalOpen(true)}
        onOpenExperimentStudio={() => setActiveView('experiments')}
        onOpenEvaluationPanel={() => setActiveView('evaluations')}
        onExportTrace={() => handleExportTrace()}
        onToggleCriticalPathFocus={handleToggleCriticalPathFocus}
        onCollapseAllAgents={handleCollapseAllAgents}
        onExpandAllAgents={handleExpandAllAgents}
        onSelectFilter={setActiveFilter}
        onTogglePinSpan={handleTogglePinSpan}
        onNavigateParent={handleNavigateParent}
        onNavigateChild={handleNavigateChild}
        onClearFilters={() => setActiveFilter('all')}
        pendingBreakpoints={pendingBreakpoints}
        onResolveBreakpoint={handleResolveBreakpoint}
        isPinned={Boolean(selectedSpan && pinnedSpanIds.has(selectedSpan.id))}
        onCopyText={handleCopyText}
        onDeselectSpan={() => {
          setSelectedSpan(null);
          setSelectedAgent(null);
          setSelectedSpanIds(new Set());
        }}
      />

      {/* Chaos Engineering Modal */}
      <ChaosModal
        isOpen={isChaosModalOpen}
        onClose={() => setIsChaosModalOpen(false)}
        config={chaosConfig}
        onSave={handleSaveChaosConfig}
      />

      {/* Side-by-Side Diff Arena Modal */}
      <DiffArenaModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        runs={runs}
        initialBaseId={diffBaseId}
        initialTargetId={diffTargetId}
        onSelectSpan={(spanId, runId) => handleSelectSpanFromStudio(spanId, runId)}
      />

      {/* Conditional Breakpoints Rules Modal */}
      <BreakpointModal
        isOpen={isBreakpointModalOpen}
        onClose={() => setIsBreakpointModalOpen(false)}
        config={breakpointConfig}
        onSaveConfig={async (newCfg) => {
          const res = await updateBreakpointConfig(newCfg);
          setBreakpointConfig(res.config);
        }}
        onRefresh={loadBreakpoints}
      />

      {/* Replay & Experiment Studio Modal (Phase 12) */}
      <ExperimentStudio
        isOpen={isExperimentStudioOpen}
        onClose={() => setIsExperimentStudioOpen(false)}
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => {
          setSelectedRunId(runId);
          setSelectedSpan(null);
          loadSpansForRun(runId);
        }}
        onSelectSpan={(spanId, runId) => handleSelectSpanFromStudio(spanId, runId)}
        onOpenDiffModal={(baseId, targetId) => handleOpenDiffModal(baseId, targetId)}
      />

      {/* Evaluation & Optimization Studio Modal (Phase 13) */}
      <EvaluationPanel
        isOpen={isEvaluationPanelOpen}
        onClose={() => setIsEvaluationPanelOpen(false)}
        selectedRun={runs.find((r) => r.id === selectedRunId) || null}
        runs={runs}
        onSelectSpan={(spanId) => handleSelectSpanFromStudio(spanId)}
        onOpenDiffModal={(baseId, targetId) => handleOpenDiffModal(baseId, targetId)}
      />

      {/* Action Feedback Banner (Forks, Replays, Copy Confirmations) */}
      <ActionFeedbackBanner
        feedback={actionFeedback}
        onDismiss={() => setActionFeedback(null)}
        onOpenRun={(runId) => {
          setSelectedRunId(runId);
          setSelectedSpan(null);
        }}
        onCompareWithSource={(sourceId, targetId) => handleOpenDiffModal(sourceId, targetId)}
      />
    </div>
  );
}

