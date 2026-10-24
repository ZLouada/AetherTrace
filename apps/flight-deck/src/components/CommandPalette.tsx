'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Layers,
  Play,
  Pause,
  RotateCcw,
  GitFork,
  Scale,
  FlaskConical,
  Download,
  Sliders,
  Clock,
  Wrench,
  Bot,
  AlertTriangle,
  GitBranch,
  Bookmark,
  X,
  Zap,
  Target,
  Pin,
  Maximize2,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  Ban,
  Copy,
  Check
} from 'lucide-react';
import {
  searchTraces,
  fetchSavedSearches,
  type TraceRun,
  type TraceSpan,
  type SearchResult,
  type SavedSearch,
  type PendingBreakpoint,
  type BreakpointResolution
} from '@/lib/api';
import {
  Badge,
  IconButton,
  EmptyState
} from '@/design-system';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  runs: TraceRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  spans: TraceSpan[];
  selectedSpan: TraceSpan | null;
  onSelectSpan: (span: TraceSpan) => void;
  onSelectSearchResult?: (result: SearchResult) => void;
  onSelectView?: (view: 'debugger' | 'diff' | 'experiments' | 'evaluations') => void;
  onPauseRun: () => void;
  onResumeRun: () => void;
  onReplaySpan: () => void;
  onForkSpan: () => void;
  onToggleBreakpoints: () => void;
  onToggleTimeline: () => void;
  onOpenDiffModal: () => void;
  onOpenChaosModal: () => void;
  onOpenExperimentStudio?: () => void;
  onOpenEvaluationPanel?: () => void;
  onExportTrace: () => void;
  onToggleCriticalPathFocus?: () => void;
  onCollapseAllAgents?: () => void;
  onExpandAllAgents?: () => void;
  onSelectFilter?: (filter: string) => void;
  onTogglePinSpan?: (spanId: string) => void;
  onFitGraphView?: () => void;
  onNavigateParent?: () => void;
  onNavigateChild?: () => void;
  onClearFilters?: () => void;
  pendingBreakpoints?: PendingBreakpoint[];
  onResolveBreakpoint?: (spanId: string, resolution: BreakpointResolution) => Promise<void>;
  isPinned?: boolean;
  onCopyText?: (text: string, label: string) => void;
  onDeselectSpan?: () => void;
}

interface PaletteItem {
  id: string;
  category: 'Breakpoint Actions' | 'Navigation' | 'Debugger & Canvas' | 'Span Actions' | 'Execution & Tools' | 'Runs' | 'Errors' | 'Tools' | 'Spans' | 'Saved Searches';
  label: string;
  detail?: string;
  snippet?: string;
  badge?: string;
  badgeCategory?: 'LLM' | 'TOOL' | 'ERROR' | 'HTTP' | 'AGENT';
  shortcut?: string;
  icon: any;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  runs,
  selectedRunId,
  onSelectRun,
  spans,
  selectedSpan,
  onSelectSpan,
  onSelectSearchResult,
  onSelectView,
  onPauseRun,
  onResumeRun,
  onReplaySpan,
  onForkSpan,
  onToggleBreakpoints,
  onToggleTimeline,
  onOpenDiffModal,
  onOpenChaosModal,
  onOpenExperimentStudio,
  onOpenEvaluationPanel,
  onExportTrace,
  onToggleCriticalPathFocus,
  onCollapseAllAgents,
  onExpandAllAgents,
  onSelectFilter,
  onTogglePinSpan,
  onFitGraphView,
  onNavigateParent,
  onNavigateChild,
  onClearFilters,
  pendingBreakpoints,
  onResolveBreakpoint,
  isPinned,
  onCopyText,
  onDeselectSpan
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      setQuery('');
      setSelectedIndex(0);
      setRemoteResults([]);
      fetchSavedSearches()
        .then((res) => setSavedSearches(res.savedSearches || []))
        .catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus?.();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  // Clean up focus restoration on unmount
  useEffect(() => {
    return () => {
      if (previousActiveElement.current) {
        previousActiveElement.current.focus?.();
      }
    };
  }, []);

  // Debounced Remote Search
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();

    if (!trimmed || trimmed.startsWith('>')) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const resp = await searchTraces(trimmed, { limit: 30 });
        setRemoteResults(resp.results || []);
      } catch (err) {
        setRemoteResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 120);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  const activeRun = runs.find((r) => r.id === selectedRunId) || null;

  // Build unified palette items
  const items: PaletteItem[] = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    const resultItems: PaletteItem[] = [];

    const isCommandMode = q.startsWith('>');
    const filterTerm = isCommandMode ? q.slice(1).trim() : q;

    // 0. Breakpoint Actions (when pending breakpoints exist or run is paused)
    const breakpointList: PaletteItem[] = [];
    if (pendingBreakpoints && pendingBreakpoints.length > 0) {
      const activeBp = pendingBreakpoints[0];
      if (onResolveBreakpoint) {
        breakpointList.push({
          id: 'action-bp-continue',
          category: 'Breakpoint Actions',
          label: `Continue Execution (${activeBp.agentName})`,
          detail: `Resume held ${activeBp.spanType || 'span'} ${activeBp.spanId.slice(0, 8)}`,
          shortcut: 'Space',
          icon: Play,
          run: () => onResolveBreakpoint(activeBp.spanId, { action: 'resume' })
        });
        breakpointList.push({
          id: 'action-bp-mock',
          category: 'Breakpoint Actions',
          label: `Mock Response ($0.00 Cost)`,
          detail: `Inject synthetic response for ${activeBp.agentName}`,
          shortcut: 'M',
          icon: Sparkles,
          run: () => onResolveBreakpoint(activeBp.spanId, { action: 'mock', mockedResponse: '{"status":"mocked","result":"Synthetic response"}' })
        });
        breakpointList.push({
          id: 'action-bp-abort',
          category: 'Breakpoint Actions',
          label: `Abort Execution`,
          detail: `Terminate held ${activeBp.agentName} span immediately`,
          shortcut: 'Esc',
          icon: Ban,
          run: () => onResolveBreakpoint(activeBp.spanId, { action: 'abort' })
        });
      }
    }

    // 1. Navigation Category
    const navigationList: PaletteItem[] = [
      {
        id: 'nav-debugger',
        category: 'Navigation',
        label: 'Switch to Debugger Workspace',
        detail: 'DAG Canvas, Waterfall Timeline, Inspector',
        shortcut: '1',
        icon: Bot,
        run: () => {
          if (onSelectView) onSelectView('debugger');
        }
      },
      {
        id: 'nav-diff',
        category: 'Navigation',
        label: 'Switch to Diff Arena',
        detail: 'Side-by-side model & prompt comparison',
        shortcut: '2',
        icon: Scale,
        run: () => {
          if (onSelectView) onSelectView('diff');
          else onOpenDiffModal();
        }
      },
      {
        id: 'nav-experiments',
        category: 'Navigation',
        label: 'Switch to Experiment Studio',
        detail: 'Replay variants, prompt mutations & batch matrix',
        shortcut: '3',
        icon: FlaskConical,
        run: () => {
          if (onSelectView) onSelectView('experiments');
          else onOpenExperimentStudio?.();
        }
      },
      {
        id: 'nav-evaluations',
        category: 'Navigation',
        label: 'Switch to Evaluation Studio',
        detail: 'Deterministic assertions & root cause analysis',
        shortcut: '4',
        icon: Target,
        run: () => {
          if (onSelectView) onSelectView('evaluations');
          else onOpenEvaluationPanel?.();
        }
      }
    ];

    // 2. Span Actions (when a span is selected)
    const spanActionList: PaletteItem[] = [];
    if (selectedSpan) {
      if (onTogglePinSpan) {
        spanActionList.push({
          id: 'action-pin-span',
          category: 'Span Actions',
          label: isPinned ? `Unpin Span (${selectedSpan.agent_name})` : `Pin Span as Reference (${selectedSpan.agent_name})`,
          detail: isPinned ? 'Remove pin marker from workspace' : 'Pin span to persist reference marker in DAG and Timeline',
          shortcut: 'P',
          icon: Pin,
          run: () => onTogglePinSpan(selectedSpan.id)
        });
      }

      spanActionList.push({
        id: 'action-inspect-span',
        category: 'Span Actions',
        label: `Inspect Span (${selectedSpan.agent_name})`,
        detail: `Open inspector for ${selectedSpan.model || selectedSpan.span_type} span`,
        shortcut: 'I',
        icon: Bot,
        run: () => onSelectSpan(selectedSpan)
      });

      if (onCopyText) {
        spanActionList.push({
          id: 'action-copy-span-id',
          category: 'Span Actions',
          label: `Copy Span ID (${selectedSpan.id.slice(0, 8)})`,
          detail: 'Copy full unique span ID to clipboard',
          icon: Copy,
          run: () => onCopyText(selectedSpan.id, 'Span ID')
        });
      }

      spanActionList.push({
        id: 'action-replay',
        category: 'Span Actions',
        label: `Replay From ${selectedSpan.agent_name}`,
        detail: `Cached prefix up to span ${selectedSpan.id.slice(0, 8)}`,
        shortcut: 'T',
        icon: RotateCcw,
        run: onReplaySpan
      });

      spanActionList.push({
        id: 'action-fork',
        category: 'Span Actions',
        label: `Fork From ${selectedSpan.agent_name}`,
        detail: `Branch new execution at span ${selectedSpan.id.slice(0, 8)}`,
        icon: GitFork,
        run: onForkSpan
      });

      if (selectedSpan.parent_span_id && onNavigateParent) {
        spanActionList.push({
          id: 'action-navigate-parent',
          category: 'Span Actions',
          label: 'Navigate to Parent Span',
          detail: `Jump to ancestor ${selectedSpan.parent_span_id.slice(0, 8)}`,
          shortcut: '[',
          icon: ArrowUpRight,
          run: onNavigateParent
        });
      }

      if (onNavigateChild) {
        spanActionList.push({
          id: 'action-navigate-child',
          category: 'Span Actions',
          label: 'Navigate to First Child Span',
          detail: 'Jump to child execution',
          shortcut: ']',
          icon: ChevronRight,
          run: onNavigateChild
        });
      }

      if (onDeselectSpan) {
        spanActionList.push({
          id: 'action-deselect-span',
          category: 'Span Actions',
          label: 'Deselect Span (Close Inspector)',
          detail: 'Clear current span selection',
          shortcut: 'Esc',
          icon: X,
          run: onDeselectSpan
        });
      }
    }

    // 3. Debugger & Canvas Category
    const debuggerList: PaletteItem[] = [
      {
        id: 'action-timeline',
        category: 'Debugger & Canvas',
        label: 'Toggle Execution Timeline',
        detail: 'View waterfall timing chart',
        shortcut: 'T',
        icon: Clock,
        run: onToggleTimeline
      }
    ];

    if (onFitGraphView) {
      debuggerList.push({
        id: 'action-fit-view',
        category: 'Debugger & Canvas',
        label: 'Fit Graph View to Screen',
        detail: 'Center and auto-fit entire execution DAG',
        shortcut: 'G',
        icon: Maximize2,
        run: onFitGraphView
      });
    }

    if (onToggleCriticalPathFocus) {
      debuggerList.push({
        id: 'action-critical-path',
        category: 'Debugger & Canvas',
        label: 'Toggle Critical Path Focus',
        detail: 'Highlight DAG bottleneck and subdue non-critical nodes',
        icon: Zap,
        run: onToggleCriticalPathFocus
      });
    }

    if (onCollapseAllAgents) {
      debuggerList.push({
        id: 'action-collapse-agents',
        category: 'Debugger & Canvas',
        label: 'Collapse All Agents',
        detail: 'Group spans by agent boundaries in DAG',
        icon: Layers,
        run: onCollapseAllAgents
      });
    }

    if (onExpandAllAgents) {
      debuggerList.push({
        id: 'action-expand-agents',
        category: 'Debugger & Canvas',
        label: 'Expand All Agents',
        detail: 'Show all individual spans in DAG',
        icon: Layers,
        run: onExpandAllAgents
      });
    }

    if (onSelectFilter) {
      debuggerList.push({
        id: 'action-filter-pinned',
        category: 'Debugger & Canvas',
        label: 'Filter: Pinned Spans Only',
        detail: 'Only display pinned reference spans in DAG',
        icon: Pin,
        run: () => onSelectFilter('pinned')
      });
      debuggerList.push({
        id: 'action-filter-errors',
        category: 'Debugger & Canvas',
        label: 'Filter: Errors & Retries Only',
        detail: 'Only display failing spans and retry attempts',
        icon: AlertTriangle,
        run: () => onSelectFilter('errors')
      });
      debuggerList.push({
        id: 'action-filter-tools',
        category: 'Debugger & Canvas',
        label: 'Filter: Tools Only',
        detail: 'Only display tool execution spans',
        icon: Wrench,
        run: () => onSelectFilter('tools')
      });
    }

    if (onClearFilters) {
      debuggerList.push({
        id: 'action-clear-filters',
        category: 'Debugger & Canvas',
        label: 'Clear All Graph Filters',
        detail: 'Reset DAG and timeline to show all spans',
        icon: X,
        run: onClearFilters
      });
    }

    // 4. Execution & Tools Category
    const executionList: PaletteItem[] = [];
    if (activeRun?.status === 'running') {
      executionList.push({
        id: 'action-pause',
        category: 'Execution & Tools',
        label: 'Pause Execution',
        detail: 'Halt current active run',
        shortcut: 'Space',
        icon: Pause,
        run: onPauseRun
      });
    } else {
      executionList.push({
        id: 'action-resume',
        category: 'Execution & Tools',
        label: 'Resume Execution',
        detail: 'Resume paused run',
        shortcut: 'Space',
        icon: Play,
        run: onResumeRun
      });
    }

    if (selectedRunId && onCopyText) {
      executionList.push({
        id: 'action-copy-run-id',
        category: 'Execution & Tools',
        label: `Copy Run ID (${selectedRunId.slice(0, 8)})`,
        detail: 'Copy active run ID to clipboard',
        icon: Copy,
        run: () => onCopyText(selectedRunId, 'Run ID')
      });
    }

    if (activeRun?.parent_run_id) {
      executionList.push({
        id: 'action-nav-source-run',
        category: 'Execution & Tools',
        label: `Navigate to Source Run (${activeRun.parent_run_id.slice(0, 8)})`,
        detail: 'Open original ancestor execution in Debugger',
        icon: ArrowUpRight,
        run: () => onSelectRun(activeRun.parent_run_id!)
      });

      executionList.push({
        id: 'action-diff-source-run',
        category: 'Execution & Tools',
        label: `Compare with Source in Diff Arena`,
        detail: 'Compare ancestor baseline with this run',
        icon: Scale,
        run: () => onOpenDiffModal()
      });
    }

    executionList.push({
      id: 'action-breakpoints',
      category: 'Execution & Tools',
      label: 'Toggle Breakpoints Interception',
      detail: 'Pause outbound LLM calls mid-flight',
      shortcut: 'B',
      icon: Sliders,
      run: onToggleBreakpoints
    });

    executionList.push({
      id: 'action-chaos',
      category: 'Execution & Tools',
      label: 'Open Chaos Engineering Engine',
      detail: 'Inject 429 rate limits, 500s, or latencies',
      shortcut: 'C',
      icon: FlaskConical,
      run: onOpenChaosModal
    });

    executionList.push({
      id: 'action-export',
      category: 'Execution & Tools',
      label: 'Export Trace (.trace.json)',
      detail: 'Download portable execution bundle',
      icon: Download,
      run: onExportTrace
    });

    const matchesFilter = (item: PaletteItem) => {
      if (!filterTerm) return true;
      return (
        item.label.toLowerCase().includes(filterTerm) ||
        (item.detail && item.detail.toLowerCase().includes(filterTerm)) ||
        (item.shortcut && item.shortcut.toLowerCase() === filterTerm) ||
        item.category.toLowerCase().includes(filterTerm)
      );
    };

    const filteredBreakpoints = breakpointList.filter(matchesFilter);
    const filteredNav = navigationList.filter(matchesFilter);
    const filteredSpanActions = spanActionList.filter(matchesFilter);
    const filteredDebugger = debuggerList.filter(matchesFilter);
    const filteredExecution = executionList.filter(matchesFilter);

    const allActions = [
      ...filteredBreakpoints,
      ...filteredNav,
      ...filteredSpanActions,
      ...filteredDebugger,
      ...filteredExecution
    ];

    if (isCommandMode) {
      return allActions;
    }

    // 5. Saved Searches (shown on empty query)
    if (!q && savedSearches.length > 0) {
      for (const s of savedSearches) {
        resultItems.push({
          id: `saved-${s.id}`,
          category: 'Saved Searches',
          label: s.name,
          detail: s.query,
          icon: Bookmark,
          run: () => setQuery(s.query)
        });
      }
    }

    // 6. Remote Server Search Results
    if (remoteResults.length > 0) {
      for (const res of remoteResults) {
        let cat: PaletteItem['category'] = 'Spans';
        let icon = Bot;
        let badgeCategory: 'LLM' | 'TOOL' | 'ERROR' | 'HTTP' | 'AGENT' = 'LLM';

        if (res.type === 'error') {
          cat = 'Errors';
          icon = AlertTriangle;
          badgeCategory = 'ERROR';
        } else if (res.type === 'tool') {
          cat = 'Tools';
          icon = Wrench;
          badgeCategory = 'TOOL';
        } else if (res.type === 'run' || res.type === 'provenance') {
          cat = 'Runs';
          icon = res.type === 'provenance' ? GitBranch : Layers;
        }

        resultItems.push({
          id: `search-${res.type}-${res.id}`,
          category: cat,
          label: res.title,
          detail: res.subtitle,
          snippet: res.snippet,
          badge: res.type.toUpperCase(),
          badgeCategory,
          icon,
          run: () => {
            if (onSelectSearchResult) {
              onSelectSearchResult(res);
            } else if (res.type === 'run') {
              onSelectRun(res.runId);
            } else if (res.spanId) {
              const matchedSpan = spans.find((s) => s.id === res.spanId);
              if (matchedSpan) {
                onSelectSpan(matchedSpan);
              } else {
                onSelectRun(res.runId);
              }
            }
          }
        });
      }
    } else if (!q) {
      // Add current active run spans when query is empty
      for (const span of spans.slice(0, 10)) {
        resultItems.push({
          id: `span-${span.id}`,
          category: span.span_type === 'tool_call' ? 'Tools' : 'Spans',
          label: `${span.agent_name} (${span.span_type})`,
          detail: span.model ? `${span.model} · ${span.latency_ms}ms · $${Number(span.cost_usd).toFixed(4)}` : `${span.latency_ms}ms`,
          badgeCategory: span.span_type === 'tool_call' ? 'TOOL' : 'LLM',
          icon: span.span_type === 'tool_call' ? Wrench : Bot,
          run: () => onSelectSpan(span)
        });
      }
    }

    // Combine Actions and Results
    return [...allActions, ...resultItems];
  }, [
    query,
    remoteResults,
    savedSearches,
    activeRun,
    selectedSpan,
    spans,
    onPauseRun,
    onResumeRun,
    onReplaySpan,
    onForkSpan,
    onToggleTimeline,
    onToggleBreakpoints,
    onOpenDiffModal,
    onOpenChaosModal,
    onOpenExperimentStudio,
    onOpenEvaluationPanel,
    onExportTrace,
    onSelectSpan,
    onSelectRun,
    onSelectSearchResult,
    onSelectView,
    onTogglePinSpan,
    onFitGraphView,
    onNavigateParent,
    onNavigateChild,
    onClearFilters,
    onSelectFilter,
    onToggleCriticalPathFocus,
    onCollapseAllAgents,
    onExpandAllAgents,
    pendingBreakpoints,
    onResolveBreakpoint,
    isPinned,
    onCopyText,
    onDeselectSpan,
    selectedRunId
  ]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
      } else {
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].run();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const setFilterTag = (tag: string) => {
    setQuery((prev) => (prev ? `${prev.trim()} ${tag}` : tag));
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center pt-16 p-4 animate-in fade-in duration-fast"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-[#111114] border border-[#2c2c32] rounded-lg shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Search Input Bar */}
        <div className="flex items-center px-3.5 py-3 border-b border-[#202024] bg-[#18181c]">
          <Search className="w-4 h-4 text-zinc-400 mr-2.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls="command-palette-results"
            aria-activedescendant={items[selectedIndex] ? `item-${items[selectedIndex].id}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search runs, spans, errors, tools, models (e.g. status:error, cost:>0.10, or >action)..."
            className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none"
          />
          {isSearching && (
            <span className="text-[10px] text-zinc-400 mr-2 shrink-0 animate-pulse">
              Searching...
            </span>
          )}
          <IconButton label="Close palette (Esc)" size="xs" onClick={onClose}>
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </IconButton>
        </div>

        {/* Semantic Filter Quick Chips */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141418] border-b border-[#202024] overflow-x-auto select-none">
          <span className="text-[10px] text-zinc-400 mr-1 shrink-0 font-medium">Filters:</span>
          <button
            onClick={() => setFilterTag('status:error')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/60 text-rose-300 border border-rose-900/60 hover:bg-rose-900/60 transition-colors shrink-0"
          >
            status:error
          </button>
          <button
            onClick={() => setFilterTag('event:tool')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-950/60 text-sky-300 border border-sky-900/60 hover:bg-sky-900/60 transition-colors shrink-0"
          >
            event:tool
          </button>
          <button
            onClick={() => setFilterTag('cost:>0.10')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-900/60 hover:bg-amber-900/60 transition-colors shrink-0"
          >
            cost:&gt;0.10
          </button>
          <button
            onClick={() => setFilterTag('duration:>3s')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1c1c22] text-zinc-300 border border-[#2c2c32] hover:bg-[#272730] transition-colors shrink-0"
          >
            duration:&gt;3s
          </button>
          <button
            onClick={() => setFilterTag('model:gpt-4o')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1c1c22] text-zinc-300 border border-[#2c2c32] hover:bg-[#272730] transition-colors shrink-0"
          >
            model:gpt-4o
          </button>
          <button
            onClick={() => setFilterTag('agent:research')}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1c1c22] text-zinc-300 border border-[#2c2c32] hover:bg-[#272730] transition-colors shrink-0"
          >
            agent:research
          </button>
        </div>

        {/* Results List */}
        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Commands and search results"
          className="max-h-96 overflow-y-auto p-1.5 space-y-0.5"
        >
          {items.length === 0 ? (
            <EmptyState
              title="No matching results found"
              description="Try searching by command, shortcut, error, tool, or agent."
              className="py-10"
            />
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              const prevCategory = idx > 0 ? items[idx - 1].category : null;
              const showCategoryHeader = item.category !== prevCategory;

              return (
                <React.Fragment key={item.id}>
                  {showCategoryHeader && (
                    <div className="pt-2.5 pb-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      {item.category}
                    </div>
                  )}
                  <div
                    id={`item-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    className={`flex flex-col px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#18181c] text-white border border-[#3f3f48]'
                        : 'text-zinc-300 hover:bg-[#141418] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="font-medium truncate text-zinc-100">{item.label}</span>
                        {item.badge && (
                          <Badge
                            variant={item.badgeCategory ? 'category' : 'neutral'}
                            category={item.badgeCategory}
                            size="xs"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.detail && (
                          <span className="text-[10px] text-zinc-400 truncate max-w-[240px]">
                            {item.detail}
                          </span>
                        )}
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32] text-[10px] font-mono">
                            {item.shortcut}
                          </kbd>
                        )}
                      </div>
                    </div>
                    {item.snippet && (
                      <div className="mt-0.5 pl-5 text-[10px] text-zinc-400 truncate">
                        &quot;{item.snippet}&quot;
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer info & shortcut hints */}
        <div className="px-3.5 py-2 border-t border-[#202024] bg-[#09090b] flex items-center justify-between text-[10px] text-zinc-400">
          <div className="flex items-center gap-2.5">
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">Esc</kbd> Close</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">1-4</kbd> Switch View</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">&gt;</kbd> Actions</span>
          </div>
          <span className="text-zinc-300 font-medium font-mono">AetherTrace ⌘K</span>
        </div>
      </div>
    </div>
  );
};
