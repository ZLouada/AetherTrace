'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/TopBar';
import { RunSidebar } from '@/components/RunSidebar';
import { DagCanvas } from '@/components/DagCanvas';
import { InspectorDrawer } from '@/components/InspectorDrawer';
import {
  fetchRuns,
  fetchRunSpans,
  fetchStats,
  postChatCompletion,
  WS_BASE,
  type TraceRun,
  type TraceSpan,
  type GlobalStats
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

  useEffect(() => {
    loadRuns();
    loadStats();
  }, [loadRuns, loadStats]);

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

            // Refresh runs list when runs or spans are created
            if (
              eventType === 'RUN_CREATED' ||
              eventType === 'run:created' ||
              eventType === 'CIRCUIT_BREAKER_TRIPPED'
            ) {
              fetchRuns().then((updated) => setRuns(updated));
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
  }, [loadStats, loadSpansForRun]);

  // 4. Handle Simulation Trigger
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    const simSeed = Date.now();
    const simRunId = `run_sim_${simSeed}`;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      // Step 1: Planner
      const res1 = await postChatCompletion(
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

      // Select this run immediately so user watches the DAG unfold
      setSelectedRunId(simRunId);
      await loadRuns(simRunId);
      await sleep(350);

      const span1Id = res1.data?.id ? `span_planner_${simSeed}` : null;

      // Step 2: Researcher
      const res2 = await postChatCompletion(
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

      // Step 5: Rogue Loop Agent triggering circuit breaker
      const loopPayload = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Run infinite self-referential reflection loop [Seed:${simSeed}]` }]
      };

      for (let i = 0; i < 3; i++) {
        await postChatCompletion(loopPayload, {
          'X-Run-Id': simRunId,
          'X-Agent-Name': 'Rogue Loop Agent',
          'X-Replay-Mode': 'false',
          'X-Mock-Upstream': 'true'
        });
        await sleep(150);
      }

      await loadRuns(simRunId);
      await loadSpansForRun(simRunId);
      await loadStats();
    } catch (err) {
      console.error('[FlightDeck] Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas">
      {/* Top Telemetry Header */}
      <TopBar
        wsConnected={wsConnected}
        stats={stats}
        onRefreshStats={loadStats}
        onRunSimulation={handleRunSimulation}
        isSimulating={isSimulating}
      />

      {/* 3-Pane Flight Deck Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Run History Sidebar */}
        <RunSidebar
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={(runId) => {
            setSelectedRunId(runId);
            setSelectedSpan(null);
          }}
          onRefreshRuns={() => loadRuns()}
          isLoading={isLoadingRuns}
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

        {/* Right Pane: Inspector & Time-Travel Fork IDE */}
        {selectedSpan && (
          <InspectorDrawer
            span={selectedSpan}
            onClose={() => setSelectedSpan(null)}
            onForkSuccess={(newRunId) => {
              loadRuns(newRunId);
            }}
          />
        )}
      </div>
    </div>
  );
}
