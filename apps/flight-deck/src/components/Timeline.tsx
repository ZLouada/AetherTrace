'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Clock,
  ChevronUp,
  ChevronDown,
  Wrench,
  Globe,
  RotateCcw,
  AlertTriangle,
  User,
  Bot,
  Zap,
  Pin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  SlidersHorizontal,
  Layers
} from 'lucide-react';
import type { TraceSpan, TraceRun } from '@/lib/api';
import { Badge, Divider, IconButton } from '@/design-system';

interface TimelineProps {
  spans: TraceSpan[];
  selectedSpanId: string | null;
  onSelectSpan: (span: TraceSpan) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedRun: TraceRun | null;
  criticalPathSpanIds?: Set<string>;
  pinnedSpanIds?: Set<string>;
  hoveredSpanId?: string | null;
  onHoverSpan?: (spanId: string | null) => void;
  selectedSpanIds?: Set<string>;
  onMultiSelectSpan?: (span: TraceSpan, isShiftOrCmd: boolean) => void;
  pausedSpanId?: string | null;
}

type TimelineDensity = 'compact' | 'detailed';

const ZOOM_STEPS = [1, 1.5, 2, 3, 5, 10];

export const Timeline: React.FC<TimelineProps> = ({
  spans,

  selectedSpanId,
  onSelectSpan,
  isOpen,
  onToggleOpen,
  selectedRun,
  criticalPathSpanIds,
  pinnedSpanIds,
  hoveredSpanId,
  onHoverSpan,
  selectedSpanIds,
  onMultiSelectSpan,
  pausedSpanId
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [density, setDensity] = useState<TimelineDensity>('compact');
  const [hoverCursorMs, setHoverCursorMs] = useState<number | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);

  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // 1. Compute time bounds & duration
  const { sortedSpans, minTime, maxTime, totalDurationMs } = useMemo(() => {
    if (!spans || spans.length === 0) {
      return { sortedSpans: [], minTime: 0, maxTime: 0, totalDurationMs: 0 };
    }

    const sorted = [...spans].sort((a, b) => a.created_at - b.created_at);
    const min = sorted[0].created_at;
    let max = min;

    for (const s of sorted) {
      const end = s.created_at + Math.max(10, s.latency_ms || 10);
      if (end > max) max = end;
    }

    const duration = Math.max(100, max - min);
    return { sortedSpans: sorted, minTime: min, maxTime: max, totalDurationMs: duration };
  }, [spans]);

  // Find paused span for timeline playhead marker
  const pausedSpan = useMemo(() => {
    if (!pausedSpanId) return null;
    return sortedSpans.find((s) => s.id === pausedSpanId) || null;
  }, [pausedSpanId, sortedSpans]);

  const { pausedStartOffset, pausedPercent } = useMemo(() => {
    if (!pausedSpan || totalDurationMs <= 0) return { pausedStartOffset: 0, pausedPercent: 0 };
    const offset = Math.max(0, pausedSpan.created_at - minTime);
    const pct = Math.min(99, Math.max(0, (offset / totalDurationMs) * 100));
    return { pausedStartOffset: offset, pausedPercent: pct };
  }, [pausedSpan, minTime, totalDurationMs]);

  // 2. Compute dynamic time ticks for ruler and background grid
  const ticks = useMemo(() => {
    if (totalDurationMs <= 0) return [];

    const effectiveDuration = totalDurationMs;
    // Determine a clean tick interval (targeting 6 to 12 ticks)
    const rawStep = effectiveDuration / 8;
    const standardSteps = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 30000, 60000];
    const stepMs = standardSteps.find((s) => s >= rawStep) || standardSteps[standardSteps.length - 1];

    const result: { timeMs: number; percent: number; label: string }[] = [];
    for (let t = 0; t <= totalDurationMs; t += stepMs) {
      result.push({
        timeMs: t,
        percent: (t / totalDurationMs) * 100,
        label: t < 1000 ? `${t}ms` : `${(t / 1000).toFixed(1)}s`
      });
    }

    return result;
  }, [totalDurationMs]);

  // 3. Auto-scroll selected row into view
  useEffect(() => {
    if (selectedRowRef.current && isOpen) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedSpanId, isOpen]);

  // 4. Zoom step handlers
  const handleZoomIn = () => {
    setZoomLevel((prev) => {
      const currIdx = ZOOM_STEPS.indexOf(prev);
      if (currIdx < ZOOM_STEPS.length - 1) return ZOOM_STEPS[currIdx + 1];
      return prev;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const currIdx = ZOOM_STEPS.indexOf(prev);
      if (currIdx > 0) return ZOOM_STEPS[currIdx - 1];
      return prev;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    if (tracksScrollRef.current) {
      tracksScrollRef.current.scrollLeft = 0;
    }
  };

  // 5. Track mouse movement over the timeline track canvas for playhead cursor (throttled with RAF)
  const handleTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      setCursorX(relX);
      const ms = Math.round((relX / rect.width) * totalDurationMs);
      setHoverCursorMs(ms);
    });
  };

  const handleTrackMouseLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setHoverCursorMs(null);
    setCursorX(null);
  };

  // Find currently selected span details
  const selectedIndex = sortedSpans.findIndex((s) => s.id === selectedSpanId);
  const selectedSpanObj = selectedIndex !== -1 ? sortedSpans[selectedIndex] : null;

  if (!selectedRun) return null;

  return (
    <div
      role="region"
      aria-label="Execution Timeline"
      className="border-t border-[#202024] bg-[#09090b] flex flex-col z-20 shrink-0 select-none"
    >
      {/* 1. Header Toolbar Strip */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-[#202024] bg-[#111114] text-xs font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleOpen}
            className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors py-0.5 cursor-pointer"
            title="Toggle Timeline Tray (T)"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span className="font-semibold text-zinc-200">Timeline</span>
            <Badge variant="neutral" size="xs">
              {spans.length}
            </Badge>
          </button>

          <Divider orientation="vertical" />

          <span className="text-zinc-400 text-[11px] flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-400" />
            {totalDurationMs}ms window
          </span>

          {selectedSpanObj && (
            <>
              <Divider orientation="vertical" />
              <span className="text-zinc-300 text-[11px] truncate max-w-[200px]">
                #{selectedIndex + 1} {selectedSpanObj.agent_name}{' '}
                <span className="text-zinc-400 font-normal">({selectedSpanObj.latency_ms}ms)</span>
              </span>
            </>
          )}
        </div>

        {/* Right Controls: Zoom + Density Switcher + Shortcut hint */}
        <div className="flex items-center gap-2">
          {isOpen && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center gap-0.5 bg-[#09090b] rounded border border-[#202024] p-0.5">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel === ZOOM_STEPS[0]}
                  className="px-1 py-0.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-zinc-400 font-mono w-10 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  className="px-1 py-0.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                {zoomLevel !== 1 && (
                  <button
                    onClick={handleResetZoom}
                    className="px-1 py-0.5 text-[9px] text-[#ea580c] hover:underline font-mono border-l border-[#202024] ml-0.5"
                    title="Fit to Execution (100%)"
                  >
                    Fit
                  </button>
                )}
              </div>

              <Divider orientation="vertical" />

              {/* Density Toggle */}
              <button
                onClick={() => setDensity((d) => (d === 'compact' ? 'detailed' : 'compact'))}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  density === 'detailed'
                    ? 'bg-[#1c1c22] border-zinc-500 text-white'
                    : 'bg-transparent border-[#202024] text-zinc-400 hover:text-zinc-200'
                }`}
                title="Toggle Compact / Detailed Timeline Density"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{density === 'compact' ? 'Compact' : 'Detailed'}</span>
              </button>

              <Divider orientation="vertical" />
            </>
          )}

          <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">T</kbd>
          </div>
        </div>
      </div>

      {/* 2. Expanded Timeline Body */}
      {isOpen && (
        <div className="flex flex-col bg-[#09090b]">
          {/* Scrollable Container (Sticky left labels, horizontally scrollable right tracks) */}
          <div
            ref={tracksScrollRef}
            className="h-44 overflow-y-auto overflow-x-auto relative divide-y divide-[#18181c]"
          >
            {sortedSpans.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs font-mono">
                No execution spans recorded for this trace yet.
              </div>
            ) : (
              <div
                className="flex flex-col min-w-full"
                style={{ width: `${Math.max(100, zoomLevel * 100)}%` }}
              >
                {/* 2.1 Timeline Time Axis Ruler */}
                <div className="sticky top-0 z-20 flex h-6 bg-[#0d0d10] border-b border-[#202024] text-[9px] font-mono select-none">
                  {/* Sticky left label matching row column width */}
                  <div className="w-[210px] shrink-0 sticky left-0 z-30 bg-[#0d0d10] border-r border-[#202024] px-2 flex items-center justify-between text-zinc-400 font-semibold tracking-wider uppercase">
                    <span>Events</span>
                    <span>Offset</span>
                  </div>

                  {/* Horizontal Time Ticks Strip */}
                  <div className="flex-1 relative h-full overflow-hidden">
                    {ticks.map((tick) => (
                      <div
                        key={tick.timeMs}
                        style={{ left: `${tick.percent}%` }}
                        className="absolute top-0 bottom-0 flex flex-col justify-between -translate-x-1/2 pointer-events-none"
                      >
                        <span className="text-zinc-400 px-0.5">{tick.label}</span>
                        <div className="w-[1px] h-1.5 bg-zinc-600" />
                      </div>
                    ))}

                    {/* Paused Execution Marker on Ruler */}
                    {pausedSpan && (
                      <div
                        style={{ left: `${pausedPercent}%` }}
                        onClick={() => onSelectSpan(pausedSpan)}
                        className="absolute top-0 bottom-0 z-30 flex items-center -translate-x-1/2 cursor-pointer pointer-events-auto"
                        title={`Execution paused at ${pausedSpan.agent_name} (+${pausedStartOffset}ms). Click to inspect.`}
                      >
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-mono font-bold text-[8px] flex items-center gap-0.5 shadow-sm hover:bg-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                          PAUSED
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2.2 Waterfall Tracks Rows */}
                {sortedSpans.map((span, idx) => {
                  const isSelected = span.id === selectedSpanId;
                  const isMultiSelected = Boolean(selectedSpanIds && selectedSpanIds.has(span.id));
                  const isHovered = Boolean(hoveredSpanId && span.id === hoveredSpanId);

                  const startOffset = Math.max(0, span.created_at - minTime);
                  const leftPercent = Math.min(95, (startOffset / totalDurationMs) * 100);
                  const duration = Math.max(10, span.latency_ms || 10);
                  const widthPercent = Math.max(1.2, Math.min(100 - leftPercent, (duration / totalDurationMs) * 100));

                  // Category styling and icon
                  let Icon = Bot;
                  let barColor = 'bg-[#18181c] border-[#3f3f46] text-zinc-200';
                  let typeLabel: string = span.span_type;

                  if (span.span_type === 'tool_call') {
                    Icon = Wrench;
                    barColor = 'bg-[#082f49] border-[#0284c7] text-[#bae6fd]';
                    typeLabel = 'TOOL';
                  } else if (span.span_type === 'http_call') {
                    Icon = Globe;
                    barColor = 'bg-[#134e4a] border-[#0d9488] text-[#99f6e4]';
                    typeLabel = 'HTTP';
                  } else if (span.span_type === 'retry') {
                    Icon = RotateCcw;
                    barColor = 'bg-[#451a03] border-[#d97706] text-[#fde68a]';
                    typeLabel = 'RETRY';
                  } else if (span.span_type === 'guardrail_block') {
                    Icon = AlertTriangle;
                    barColor = 'bg-[#4c0519] border-[#e11d48] text-[#fecdd3]';
                    typeLabel = 'ERROR';
                  } else if (span.span_type === 'user_input') {
                    Icon = User;
                    barColor = 'bg-[#1e1b4b] border-[#6366f1] text-[#c7d2fe]';
                    typeLabel = 'USER';
                  } else if (span.span_type === 'llm_call') {
                    Icon = Bot;
                    barColor = 'bg-[#18181c] border-[#3f3f46] text-zinc-200';
                    typeLabel = span.model || 'LLM';
                  }

                  if (span.execution_origin === 'modified') {
                    barColor = 'bg-[#451a03] border-[#b45309] text-[#fcd34d]';
                  } else if (span.execution_origin === 'cached_replay' || span.cache_hit === 1) {
                    barColor = 'bg-[#082f49] border-[#0369a1] text-[#7dd3fc]';
                  } else if (span.execution_origin === 'new_execution') {
                    barColor = 'bg-[#064e3b] border-[#059669] text-[#6ee7b7]';
                  }

                  const rowHeight = density === 'compact' ? 'h-6' : 'h-8';
                  const barHeight = density === 'compact' ? 'h-3.5' : 'h-5';

                  const isError =
                    span.span_type === 'guardrail_block' ||
                    Boolean(
                      span.response_payload &&
                        (span.response_payload.includes('"status":"error"') ||
                          span.response_payload.includes('"is_error":true'))
                    );
                  const isRetry = span.span_type === 'retry';

                  return (
                    <div
                      key={span.id}
                      role="button"
                      tabIndex={0}
                      aria-selected={isSelected}
                      aria-label={`Span #${idx + 1} ${span.agent_name} ${span.model || span.span_type} ${span.latency_ms}ms`}
                      ref={isSelected ? selectedRowRef : undefined}
                      onClick={(e) => {
                        if ((e.shiftKey || e.metaKey || e.ctrlKey) && onMultiSelectSpan) {
                          onMultiSelectSpan(span, true);
                        } else {
                          onSelectSpan(span);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectSpan(span);
                        }
                      }}
                      onMouseEnter={() => {
                        if (onHoverSpan) onHoverSpan(span.id);
                      }}
                      onMouseLeave={() => {
                        if (onHoverSpan) onHoverSpan(null);
                      }}
                      className={`group flex items-center ${rowHeight} cursor-pointer transition-colors text-xs font-mono select-none ${
                        isSelected
                          ? 'bg-[#18181c] text-white border-l-2 border-l-[#ea580c]'
                          : isMultiSelected
                          ? 'bg-[#16161f] text-indigo-200 border-l-2 border-l-indigo-500'
                          : isHovered
                          ? 'bg-[#141418] text-zinc-200 border-l-2 border-l-[#ea580c]/60'
                          : 'hover:bg-[#121215] text-zinc-400 border-l-2 border-l-transparent'
                      }`}
                    >
                      {/* Left Sticky Label Column */}
                      <div className="w-[210px] shrink-0 sticky left-0 z-10 bg-[#0c0c0e] group-hover:bg-[#121215] border-r border-[#202024] px-2 flex items-center gap-1.5 truncate">
                        <span className="text-[10px] text-zinc-400 w-5 text-right font-mono shrink-0">
                          #{idx + 1}
                        </span>
                        <Icon className="w-3 h-3 shrink-0 opacity-80" />
                        <span
                          className={`font-medium truncate max-w-[85px] ${
                            isSelected ? 'text-zinc-100 font-semibold' : 'text-zinc-300'
                          }`}
                          title={span.agent_name}
                        >
                          {span.agent_name}
                        </span>

                        {criticalPathSpanIds?.has(span.id) && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-600/50 font-mono font-bold flex items-center gap-0.5 shrink-0"
                            title="Critical Path Execution"
                          >
                            <Zap className="w-2.5 h-2.5 fill-amber-400" />
                          </span>
                        )}

                        {pinnedSpanIds?.has(span.id) && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-500/60 font-mono font-bold flex items-center gap-0.5 shrink-0"
                            title="Pinned Span"
                          >
                            <Pin className="w-2.5 h-2.5 fill-amber-400" />
                          </span>
                        )}

                        {isError && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-600/50 font-mono font-bold flex items-center gap-0.5 shrink-0"
                            title="Error in Span"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                          </span>
                        )}

                        {isRetry && (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-600/50 font-mono font-bold flex items-center gap-0.5 shrink-0"
                            title="Retry Span"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </span>
                        )}

                        <span className="text-[10px] text-zinc-400 font-mono ml-auto shrink-0">
                          +{startOffset}ms
                        </span>
                      </div>

                      {/* Right Track Area */}
                      <div
                        className="flex-1 relative h-full flex items-center overflow-hidden"
                        onMouseMove={handleTrackMouseMove}
                        onMouseLeave={handleTrackMouseLeave}
                      >
                        {/* Vertical grid lines matching ruler ticks */}
                        {ticks.map((tick) => (
                          <div
                            key={tick.timeMs}
                            style={{ left: `${tick.percent}%` }}
                            className="absolute top-0 bottom-0 w-[1px] bg-[#1a1a1e] pointer-events-none"
                          />
                        ))}

                        {/* Paused execution playhead line across tracks */}
                        {pausedSpan && (
                          <div
                            style={{ left: `${pausedPercent}%` }}
                            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 border-r border-amber-500/60 z-20 pointer-events-none shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          />
                        )}

                        {/* Interactive Waterfall Span Bar */}
                        <div
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            minWidth: '8px'
                          }}
                          className={`absolute ${barHeight} rounded-xs border px-1 flex items-center justify-between text-[9px] font-mono leading-none truncate transition-all duration-100 ${barColor} ${
                            isSelected
                              ? 'ring-2 ring-[#ea580c] border-white text-white z-10'
                              : isMultiSelected
                              ? 'ring-2 ring-indigo-500 border-indigo-300 z-10'
                              : isHovered
                              ? 'ring-1 ring-zinc-300 brightness-125 z-10'
                              : ''
                          }`}
                          title={`${span.agent_name} (${span.span_type}): +${startOffset}ms, latency ${
                            span.cache_hit === 1 ? '0ms (cached)' : `${span.latency_ms}ms`
                          }${span.cost_usd > 0 ? `, $${span.cost_usd.toFixed(6)}` : ''}`}
                        >
                          <span className="truncate pr-1">
                            {span.cache_hit === 1 ? '0ms' : `${span.latency_ms}ms`}
                          </span>
                          {density === 'detailed' && span.cost_usd > 0 && (
                            <span className="text-[8px] opacity-80 shrink-0">
                              ${span.cost_usd.toFixed(4)}
                            </span>
                          )}
                        </div>

                        {/* Synchronized Playhead Cursor Guide */}
                        {cursorX !== null && hoverCursorMs !== null && (
                          <div
                            style={{ left: `${cursorX}px` }}
                            className="absolute top-0 bottom-0 w-[1px] bg-[#ea580c] shadow-[0_0_6px_rgba(234,88,12,0.6)] z-30 pointer-events-none"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
