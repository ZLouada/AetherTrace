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
  X
} from 'lucide-react';
import {
  searchTraces,
  fetchSavedSearches,
  type TraceRun,
  type TraceSpan,
  type SearchResult,
  type SavedSearch
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
  onPauseRun: () => void;
  onResumeRun: () => void;
  onReplaySpan: () => void;
  onForkSpan: () => void;
  onToggleBreakpoints: () => void;
  onToggleTimeline: () => void;
  onOpenDiffModal: () => void;
  onOpenChaosModal: () => void;
  onExportTrace: () => void;
}

interface PaletteItem {
  id: string;
  category: 'Actions' | 'Errors' | 'Tools' | 'Spans' | 'Runs' | 'Saved Searches';
  label: string;
  detail?: string;
  snippet?: string;
  badge?: string;
  badgeCategory?: 'LLM' | 'TOOL' | 'ERROR' | 'HTTP' | 'AGENT';
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
  onPauseRun,
  onResumeRun,
  onReplaySpan,
  onForkSpan,
  onToggleBreakpoints,
  onToggleTimeline,
  onOpenDiffModal,
  onOpenChaosModal,
  onExportTrace
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setRemoteResults([]);
      fetchSavedSearches()
        .then((res) => setSavedSearches(res.savedSearches || []))
        .catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

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

    // 1. Actions Category
    const isCommandMode = q.startsWith('>');
    const filterTerm = isCommandMode ? q.slice(1).trim() : q;

    const actionList: PaletteItem[] = [];

    if (!q || isCommandMode || 'pause resume execution'.includes(filterTerm)) {
      if (activeRun?.status === 'running') {
        actionList.push({
          id: 'action-pause',
          category: 'Actions',
          label: 'Pause Execution',
          detail: 'Halt current active run',
          icon: Pause,
          run: onPauseRun
        });
      } else {
        actionList.push({
          id: 'action-resume',
          category: 'Actions',
          label: 'Resume Execution',
          detail: 'Resume paused run',
          icon: Play,
          run: onResumeRun
        });
      }
    }

    if (selectedSpan) {
      if (!q || isCommandMode || 'replay from here'.includes(filterTerm)) {
        actionList.push({
          id: 'action-replay',
          category: 'Actions',
          label: `Replay From ${selectedSpan.agent_name}`,
          detail: `Cached prefix up to span ${selectedSpan.id.slice(0, 8)}`,
          icon: RotateCcw,
          run: onReplaySpan
        });
      }

      if (!q || isCommandMode || 'fork time-travel branch'.includes(filterTerm)) {
        actionList.push({
          id: 'action-fork',
          category: 'Actions',
          label: `Fork From ${selectedSpan.agent_name}`,
          detail: `Branch new execution at span ${selectedSpan.id.slice(0, 8)}`,
          icon: GitFork,
          run: onForkSpan
        });
      }
    }

    if (!q || isCommandMode || 'timeline waterfall'.includes(filterTerm)) {
      actionList.push({
        id: 'action-timeline',
        category: 'Actions',
        label: 'Toggle Execution Timeline',
        detail: 'View waterfall timing chart (T)',
        icon: Clock,
        run: onToggleTimeline
      });
    }

    if (!q || isCommandMode || 'breakpoints intercept'.includes(filterTerm)) {
      actionList.push({
        id: 'action-breakpoints',
        category: 'Actions',
        label: 'Toggle Breakpoints Interception',
        detail: 'Pause outbound LLM calls mid-flight (B)',
        icon: Sliders,
        run: onToggleBreakpoints
      });
    }

    if (!q || isCommandMode || 'diff arena compare runs'.includes(filterTerm)) {
      actionList.push({
        id: 'action-diff',
        category: 'Actions',
        label: 'Open Run Diff Arena',
        detail: 'Side-by-side model & prompt comparison (D)',
        icon: Scale,
        run: onOpenDiffModal
      });
    }

    if (!q || isCommandMode || 'chaos engineering faults'.includes(filterTerm)) {
      actionList.push({
        id: 'action-chaos',
        category: 'Actions',
        label: 'Open Chaos Engineering Engine',
        detail: 'Inject 429 rate limits, 500s, or latencies (C)',
        icon: FlaskConical,
        run: onOpenChaosModal
      });
    }

    if (!q || isCommandMode || 'export trace bundle pcap'.includes(filterTerm)) {
      actionList.push({
        id: 'action-export',
        category: 'Actions',
        label: 'Export Trace (.trace.json)',
        detail: 'Download portable execution bundle (E)',
        icon: Download,
        run: onExportTrace
      });
    }

    if (isCommandMode) {
      return actionList.filter((a) => !filterTerm || a.label.toLowerCase().includes(filterTerm));
    }

    // 2. Saved Searches (shown on empty query)
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

    // 3. Remote Server Search Results
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
    return [...actionList, ...resultItems];
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
    onExportTrace,
    onSelectSpan,
    onSelectRun,
    onSelectSearchResult
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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-start justify-center pt-16 p-4 animate-in fade-in duration-100"
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
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search runs, spans, errors, tools, models (e.g. status:error, cost:>0.10, or >action)..."
            className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
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
          <span className="text-[10px] text-zinc-500 mr-1 shrink-0">Filters:</span>
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
        <div className="max-h-96 overflow-y-auto p-1.5 space-y-0.5">
          {items.length === 0 ? (
            <EmptyState
              title="No matching results found"
              description="Try searching by error message, tool name, agent, or remove filter predicates."
              className="py-10"
            />
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className={`flex flex-col px-2.5 py-2 rounded cursor-pointer transition-colors ${
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
                    {item.detail && (
                      <span className="text-[10px] text-zinc-500 shrink-0 truncate max-w-[240px]">
                        {item.detail}
                      </span>
                    )}
                  </div>
                  {item.snippet && (
                    <div className="mt-0.5 pl-5 text-[10px] text-zinc-400 truncate">
                      &quot;{item.snippet}&quot;
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & shortcut hints */}
        <div className="px-3.5 py-2 border-t border-[#202024] bg-[#09090b] flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-2.5">
            <span><kbd className="px-1 py-0.2 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.2 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">↵</kbd> Select</span>
            <span><kbd className="px-1 py-0.2 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">Esc</kbd> Close</span>
            <span><kbd className="px-1 py-0.2 rounded bg-[#18181c] text-zinc-300 border border-[#2c2c32]">&gt;</kbd> Actions</span>
          </div>
          <span className="text-zinc-400 font-medium">AetherTrace ⌘K</span>
        </div>
      </div>
    </div>
  );
};
