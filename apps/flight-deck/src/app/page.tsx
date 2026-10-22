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
  WS_BASE,
  type TraceRun,
  type TraceSpan,
  type GlobalStats,
  type BreakpointConfig,
  type PendingBreakpoint,
  type BreakpointResolution,
  type ChaosConfig
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

  useEffect(() => {
    loadRuns();
    loadStats();
    loadBreakpoints();
    loadChaosConfig();
  }, [loadRuns, loadStats, loadBreakpoints, loadChaosConfig]);

  useEffect(() => {
    if (selectedRunId) {
      loadSpansForRun(selectedRunId);
    } else {
      setSpans([]);
      setSelectedSpan(null);
    }
  }, [selectedRunId, loadSpansForRun]);

  // 3. Real-Time WebSocket Telemetry Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(WS_BASE);

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

            // If event belongs to currently active run, reload spans immediately
            if (targetRunId && targetRunId === selectedRunIdRef.current) {
              loadSpansForRun(targetRunId);
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
  }, [loadStats, loadSpansForRun, loadBreakpoints, loadChaosConfig]);

  // 4. Global Keyboard Shortcuts Listener
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

      // Escape: Close open drawers or modals
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
        if (selectedSpan) {
          setSelectedSpan(null);
          return;
        }
      }

      if (isInput) return;

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault();
          setIsTimelineOpen((prev) => !prev);
          break;
        case 'i':
          e.preventDefault();
          if (selectedSpan) {
            setSelectedSpan(null);
          } else if (spans.length > 0) {
            setSelectedSpan(spans[0]);
          }
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
        case 'e':
          e.preventDefault();
          handleExportTrace();
          break;
        case ' ': // Space: Pause / Resume current run
          e.preventDefault();
          const activeRun = runs.find((r) => r.id === selectedRunId);
          if (activeRun) {
            if (activeRun.status === 'running') {
              handlePauseRun(activeRun.id);
            } else if (activeRun.status === 'paused') {
              handleResumeRun(activeRun.id);
            }
          }
          break;
        case 'arrowdown':
        case 'j':
          if (spans.length > 0) {
            e.preventDefault();
            const currIdx = spans.findIndex((s) => s.id === selectedSpan?.id);
            const nextIdx = currIdx === -1 ? 0 : Math.min(spans.length - 1, currIdx + 1);
            setSelectedSpan(spans[nextIdx]);
          }
          break;
        case 'arrowup':
        case 'k':
          if (spans.length > 0) {
            e.preventDefault();
            const currIdx = spans.findIndex((s) => s.id === selectedSpan?.id);
            const prevIdx = currIdx <= 0 ? spans.length - 1 : currIdx - 1;
            setSelectedSpan(spans[prevIdx]);
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
    selectedSpan,
    spans,
    selectedRunId,
    runs
  ]);

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
    setIsDiffModalOpen(true);
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

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
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleTimeline={() => setIsTimelineOpen((p) => !p)}
        isTimelineOpen={isTimelineOpen}
        onPauseRun={() => handlePauseRun()}
        onResumeRun={() => handleResumeRun()}
      />

      {/* 3-Pane Flight Deck Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Execution Run Navigation */}
        <RunSidebar
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
        />

        {/* Center Pane: Interactive React Flow DAG */}
        <DagCanvas
          selectedRun={selectedRun}
          spans={spans}
          selectedSpanId={selectedSpan?.id || null}
          onSelectSpan={(span) => setSelectedSpan(span)}
          direction={dagDirection}
          onToggleDirection={() => setDagDirection((d) => (d === 'TB' ? 'LR' : 'TB'))}
        />

        {/* Right Pane: Upgraded Event Inspector & Fork IDE */}
        {selectedSpan && (
          <InspectorDrawer
            span={selectedSpan}
            run={selectedRun}
            onClose={() => setSelectedSpan(null)}
            onForkSuccess={(newRunId) => {
              loadRuns(newRunId);
              setSelectedRunId(newRunId);
            }}
            onReplaySuccess={(newRunId) => {
              loadRuns(newRunId);
              setSelectedRunId(newRunId);
            }}
            onSelectParentSpan={(parentSpanId) => {
              const p = spans.find((s) => s.id === parentSpanId);
              if (p) setSelectedSpan(p);
            }}
            isHeldBreakpoint={pendingBreakpoints.some((p) => p.spanId === selectedSpan.id)}
            onResolveBreakpoint={handleResolveBreakpoint}
            onToggleAgentBreakpoint={handleToggleAgentBreakpoint}
            isAgentBreakpointed={Boolean(
              breakpointConfig?.matchAgentNames.includes(selectedSpan.agent_name)
            )}
          />
        )}
      </div>

      {/* Bottom Pane: Execution Timeline Waterfall */}
      <Timeline
        spans={spans}
        selectedSpanId={selectedSpan?.id || null}
        onSelectSpan={(span) => setSelectedSpan(span)}
        isOpen={isTimelineOpen}
        onToggleOpen={() => setIsTimelineOpen((p) => !p)}
        selectedRun={selectedRun}
      />

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
        onSelectSpan={(span) => setSelectedSpan(span)}
        onSelectSearchResult={async (res) => {
          if (res.type === 'run') {
            setSelectedRunId(res.runId);
            setSelectedSpan(null);
          } else if (res.spanId) {
            if (res.runId !== selectedRunId) {
              setSelectedRunId(res.runId);
              try {
                const data = await fetchRunSpans(res.runId);
                setSpans(data.spans);
                const target = data.spans.find((s) => s.id === res.spanId);
                if (target) setSelectedSpan(target);
              } catch {}
            } else {
              const target = spans.find((s) => s.id === res.spanId);
              if (target) setSelectedSpan(target);
            }
          }
        }}
        onPauseRun={() => handlePauseRun()}
        onResumeRun={() => handleResumeRun()}
        onReplaySpan={() => handleReplayFromSelected()}
        onForkSpan={() => {
          if (selectedSpan) {
            // Focus inspector drawer to fork tab
            setSelectedSpan(selectedSpan);
          }
        }}
        onToggleBreakpoints={() => handleToggleBreakpoints()}
        onToggleTimeline={() => setIsTimelineOpen((p) => !p)}
        onOpenDiffModal={() => handleOpenDiffModal()}
        onOpenChaosModal={() => setIsChaosModalOpen(true)}
        onExportTrace={() => handleExportTrace()}
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
    </div>
  );
}
