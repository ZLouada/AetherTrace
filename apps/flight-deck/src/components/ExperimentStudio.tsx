import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Sliders,
  GitFork,
  Trash2,
  History,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Scale,
  RefreshCw,
  AlertTriangle,
  FileText,
  Cpu,
  Wrench,
  Check,
  ChevronRight
} from 'lucide-react';
import {
  Modal,
  Button,
  IconButton,
  Badge,
  Select,
  Input,
  Panel,
  PanelHeader,
  PanelBody,
  Divider,
  DataRow,
  EmptyState,
  LoadingState,
  TOKENS
} from '@/design-system';
import {
  fetchExperiments,
  fetchExperiment,
  createExperiment,
  deleteExperiment,
  createExperimentVariant,
  updateExperimentVariant,
  deleteExperimentVariant,
  replayExperimentVariant,
  runAllExperimentVariants,
  fetchExperimentComparison,
  fetchReplayHistory,
  type TraceRun,
  type TraceSpan,
  type ExperimentSummary,
  type ExperimentWithVariants,
  type ExperimentVariant,
  type ExperimentMutation,
  type ReplayMode,
  type MutationType,
  type MultiVariantComparisonResult,
  type MultiVariantScorecardItem,
  type ReplayHistoryItem
} from '@/lib/api';

interface ExperimentStudioProps {
  isOpen: boolean;
  onClose: () => void;
  runs: TraceRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onSelectSpan?: (spanId: string, runId?: string) => void;
  onOpenDiffModal: (baseId: string, targetId: string) => void;
  embedded?: boolean;
}

export const ExperimentStudio: React.FC<ExperimentStudioProps> = ({
  isOpen,
  onClose,
  runs,
  selectedRunId,
  onSelectRun,
  onSelectSpan,
  onOpenDiffModal,
  embedded = false
}) => {
  // Navigation / View Tabs
  const [activeTab, setActiveTab] = useState<'variants' | 'matrix' | 'history'>('variants');

  // Experiment selection & listing
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [activeExperiment, setActiveExperiment] = useState<ExperimentWithVariants | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Experiment form state
  const [isCreatingExp, setIsCreatingExp] = useState<boolean>(false);
  const [newExpName, setNewExpName] = useState<string>('');
  const [newExpDesc, setNewExpDesc] = useState<string>('');
  const [newExpSourceRunId, setNewExpSourceRunId] = useState<string>(selectedRunId || '');

  // Variant editing / creation state
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isCreatingVariant, setIsCreatingVariant] = useState<boolean>(false);
  const [variantName, setVariantName] = useState<string>('');
  const [variantDesc, setVariantDesc] = useState<string>('');
  const [variantReplayMode, setVariantReplayMode] = useState<ReplayMode>('mock_mutated');
  const [variantForkSpanId, setVariantForkSpanId] = useState<string>('');
  const [variantMutations, setVariantMutations] = useState<ExperimentMutation[]>([]);

  // Mutation addition state
  const [newMutationType, setNewMutationType] = useState<MutationType>('prompt');
  const [newMutationTargetSpan, setNewMutationTargetSpan] = useState<string>('');
  const [newMutationField, setNewMutationField] = useState<string>('messages');
  const [newMutationValue, setNewMutationValue] = useState<string>('');
  const [newMutationOriginal, setNewMutationOriginal] = useState<string>('');

  // Comparison matrix
  const [comparison, setComparison] = useState<MultiVariantComparisonResult | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState<boolean>(false);

  // History state
  const [historyItems, setHistoryItems] = useState<ReplayHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Live replay safety confirmation modal
  const [pendingLiveAction, setPendingLiveAction] = useState<(() => Promise<void>) | null>(null);

  // 1. Load Experiments List
  const loadExperiments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchExperiments();
      setExperiments(data.experiments);
      if (data.experiments.length > 0 && !selectedExperimentId) {
        setSelectedExperimentId(data.experiments[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  }, [selectedExperimentId]);

  // 2. Load Selected Experiment Details
  const loadActiveExperiment = useCallback(async (expId: string) => {
    try {
      const exp = await fetchExperiment(expId);
      setActiveExperiment(exp);
      if (exp.variants.length > 0 && !selectedVariantId) {
        setSelectedVariantId(exp.variants[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load experiment details');
    }
  }, [selectedVariantId]);

  // 3. Load Comparison Matrix
  const loadComparison = useCallback(async (expId: string) => {
    setIsLoadingComparison(true);
    try {
      const res = await fetchExperimentComparison(expId);
      setComparison(res.comparison);
    } catch (err: any) {
      console.error('Failed to load experiment comparison:', err);
    } finally {
      setIsLoadingComparison(false);
    }
  }, []);

  // 4. Load Replay History
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetchReplayHistory(50);
      setHistoryItems(res.history);
    } catch (err: any) {
      console.error('Failed to load replay history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      loadExperiments();
      if (selectedRunId) {
        setNewExpSourceRunId(selectedRunId);
      }
    }
  }, [isOpen, loadExperiments, selectedRunId]);

  // Load details whenever selected experiment changes
  useEffect(() => {
    if (selectedExperimentId) {
      loadActiveExperiment(selectedExperimentId);
      if (activeTab === 'matrix') {
        loadComparison(selectedExperimentId);
      }
    }
  }, [selectedExperimentId, loadActiveExperiment, activeTab, loadComparison]);

  // Load tab-specific data
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'matrix' && selectedExperimentId) {
      loadComparison(selectedExperimentId);
    }
  }, [activeTab, selectedExperimentId, loadHistory, loadComparison]);

  // Active selected variant
  const activeVariant = activeExperiment?.variants.find((v) => v.id === selectedVariantId) || null;

  // Handle Create Experiment
  const handleCreateExperiment = async () => {
    if (!newExpName.trim() || !newExpSourceRunId) return;
    try {
      const res = await createExperiment({
        name: newExpName.trim(),
        description: newExpDesc.trim() || undefined,
        sourceRunId: newExpSourceRunId
      });
      setIsCreatingExp(false);
      setNewExpName('');
      setNewExpDesc('');
      await loadExperiments();
      setSelectedExperimentId(res.experiment.id);
    } catch (err: any) {
      alert(`Error creating experiment: ${err.message}`);
    }
  };

  // Handle Delete Experiment
  const handleDeleteExperiment = async (expId: string) => {
    if (!confirm('Are you sure you want to delete this experiment and all its variants?')) return;
    try {
      await deleteExperiment(expId);
      setSelectedExperimentId(null);
      setActiveExperiment(null);
      await loadExperiments();
    } catch (err: any) {
      alert(`Error deleting experiment: ${err.message}`);
    }
  };

  // Handle Create Variant
  const handleCreateVariant = async () => {
    if (!selectedExperimentId || !variantName.trim()) return;
    try {
      const res = await createExperimentVariant(selectedExperimentId, {
        name: variantName.trim(),
        description: variantDesc.trim() || undefined,
        replayMode: variantReplayMode,
        forkSpanId: variantForkSpanId.trim() || undefined,
        mutations: variantMutations
      });
      setIsCreatingVariant(false);
      setVariantName('');
      setVariantDesc('');
      setVariantMutations([]);
      setVariantForkSpanId('');
      await loadActiveExperiment(selectedExperimentId);
      setSelectedVariantId(res.variant.id);
    } catch (err: any) {
      alert(`Error creating variant: ${err.message}`);
    }
  };

  // Handle Delete Variant
  const handleDeleteVariant = async (variantId: string) => {
    if (!selectedExperimentId) return;
    try {
      await deleteExperimentVariant(selectedExperimentId, variantId);
      if (selectedVariantId === variantId) {
        setSelectedVariantId(null);
      }
      await loadActiveExperiment(selectedExperimentId);
    } catch (err: any) {
      alert(`Error deleting variant: ${err.message}`);
    }
  };

  // Add Mutation to current working variant
  const handleAddMutation = () => {
    if (!newMutationTargetSpan.trim() && newMutationType !== 'model') {
      alert('Target span ID is required for this mutation type');
      return;
    }
    let parsedVal: any = newMutationValue;
    if (newMutationType === 'tool_args' || newMutationType === 'mock_tool' || newMutationType === 'custom_payload') {
      try {
        parsedVal = JSON.parse(newMutationValue);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    const mutation: ExperimentMutation = {
      type: newMutationType,
      target_span_id: newMutationTargetSpan.trim() || 'root',
      field: newMutationField.trim() || (newMutationType === 'model' ? 'model' : 'messages'),
      new_value: parsedVal,
      original_value: newMutationOriginal || null
    };

    setVariantMutations((prev) => [...prev, mutation]);
    setNewMutationValue('');
    setNewMutationOriginal('');
    setNewMutationTargetSpan('');
  };

  // Execute Single Variant Replay
  const handleReplayVariant = async (variant: ExperimentVariant, confirmLive = false) => {
    if (!selectedExperimentId) return;
    if (variant.replay_mode === 'live_replay' && !confirmLive) {
      setPendingLiveAction(() => () => handleReplayVariant(variant, true));
      return;
    }

    setIsExecuting(true);
    try {
      const res = await replayExperimentVariant(selectedExperimentId, variant.id, { confirmLive });
      await loadActiveExperiment(selectedExperimentId);
      onSelectRun(res.newRunId);
    } catch (err: any) {
      alert(`Replay failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute All Variants (Batch)
  const handleRunAll = async (confirmLive = false) => {
    if (!selectedExperimentId || !activeExperiment) return;
    const hasLive = activeExperiment.variants.some((v) => v.replay_mode === 'live_replay');
    if (hasLive && !confirmLive) {
      setPendingLiveAction(() => () => handleRunAll(true));
      return;
    }

    setIsExecuting(true);
    try {
      await runAllExperimentVariants(selectedExperimentId, { confirmLive });
      await loadActiveExperiment(selectedExperimentId);
      if (activeTab === 'matrix') {
        await loadComparison(selectedExperimentId);
      }
    } catch (err: any) {
      alert(`Run All failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const sourceRun = runs.find((r) => r.id === activeExperiment?.source_run_id) || null;

  const contentBody = (
    <>
      <div className={`flex flex-col ${embedded ? 'flex-1 h-full' : 'h-[80vh] w-full'} bg-[#09090b] text-zinc-100 font-mono text-xs overflow-hidden`}>
      {/* Subheader: Top bar with tabs and experiment switcher */}
        <div className="h-12 border-b border-[#202024] bg-[#111114] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-zinc-200">Experiment:</span>
            </div>

            {experiments.length > 0 && !isCreatingExp ? (
              <div className="w-64">
                <Select
                  value={selectedExperimentId || ''}
                  onChange={(e) => {
                    setSelectedExperimentId(e.target.value);
                    setSelectedVariantId(null);
                  }}
                  selectSize="sm"
                >
                  {experiments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.variant_count} vars)
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <Button
              variant="secondary"
              size="xs"
              onClick={() => setIsCreatingExp((p) => !p)}
              icon={<Plus className="w-3 h-3" />}
            >
              {isCreatingExp ? 'Cancel' : 'New Experiment'}
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-[#18181c] p-0.5 rounded border border-[#2c2c32]">
            <button
              onClick={() => setActiveTab('variants')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'variants' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Variants & Mutations
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'matrix' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Comparison Matrix
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'history' ? 'bg-[#27272a] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Replay History
            </button>
          </div>
        </div>

        {/* Create Experiment Quick Drawer */}
        {isCreatingExp && (
          <div className="border-b border-[#202024] bg-[#141418] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 text-sm">Create New Experiment</span>
              <span className="text-zinc-500 text-[11px]">Attach to a source execution run</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">Experiment Name</label>
                <Input
                  value={newExpName}
                  onChange={(e) => setNewExpName(e.target.value)}
                  placeholder="e.g. Prompt Optimization v2"
                  inputSize="sm"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">Source Run</label>
                <Select
                  value={newExpSourceRunId}
                  onChange={(e) => setNewExpSourceRunId(e.target.value)}
                  selectSize="sm"
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id.slice(0, 10)}...)
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">Description</label>
                <Input
                  value={newExpDesc}
                  onChange={(e) => setNewExpDesc(e.target.value)}
                  placeholder="Hypothesis or goal..."
                  inputSize="sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="xs" onClick={() => setIsCreatingExp(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="xs"
                onClick={handleCreateExperiment}
                disabled={!newExpName.trim() || !newExpSourceRunId}
              >
                Create Experiment
              </Button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* TAB 1: VARIANTS & MUTATIONS */}
          {activeTab === 'variants' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Variants List */}
              <div className="w-80 border-r border-[#202024] bg-[#0c0c0e] flex flex-col shrink-0">
                <div className="p-3 border-b border-[#202024] flex items-center justify-between">
                  <span className="font-semibold text-zinc-300 uppercase text-[10px] tracking-wider">
                    Variants ({activeExperiment?.variants.length || 0})
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => setIsCreatingVariant(true)}
                      icon={<Plus className="w-3 h-3" />}
                    >
                      Add Variant
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {!activeExperiment ? (
                    <EmptyState
                      title="No Experiment Selected"
                      description="Select an existing experiment or create a new one to begin."
                      className="py-12"
                    />
                  ) : activeExperiment.variants.length === 0 ? (
                    <EmptyState
                      title="No Variants Yet"
                      description="Add a variant to experiment with prompt, model, or tool modifications."
                      className="py-12"
                    />
                  ) : (
                    activeExperiment.variants.map((v) => {
                      const isSelected = v.id === selectedVariantId;
                      const mutCount = JSON.parse(v.mutations || '[]').length;
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVariantId(v.id)}
                          className={`p-3 rounded border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#18181c] border-emerald-500/50 shadow-sm'
                              : 'bg-[#111114] border-[#24242a] hover:border-[#35353d] hover:bg-[#141418]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-zinc-200 text-xs truncate max-w-[170px]">
                              {v.name}
                            </span>
                            <Badge
                              variant="status"
                              status={v.status}
                              size="xs"
                            >
                              {v.status}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 mb-2">
                            <span>{v.replay_mode}</span>
                            <span>·</span>
                            <span>{mutCount} mutation{mutCount !== 1 ? 's' : ''}</span>
                          </div>

                          {/* Quick Stats or Run ID */}
                          {v.replay_run_id ? (
                            <div className="flex items-center justify-between pt-1 border-t border-[#202024] text-[10px]">
                              <span className="text-zinc-500 font-mono">
                                Run: {v.replay_run_id.slice(0, 10)}...
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectSpan && v.fork_span_id) {
                                    onSelectSpan(v.fork_span_id, v.replay_run_id!);
                                  } else {
                                    onSelectRun(v.replay_run_id!);
                                  }
                                  onClose();
                                }}
                                className="text-[#ea580c] hover:underline flex items-center gap-0.5"
                                title="Inspect this variant run in Debugger"
                              >
                                Inspect in Debugger <ChevronRight className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-zinc-500 italic">Not executed yet</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Batch Execute Footer */}
                {activeExperiment && activeExperiment.variants.length > 0 && (
                  <div className="p-3 border-t border-[#202024] bg-[#111114] flex items-center justify-between">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => handleDeleteExperiment(activeExperiment.id)}
                      icon={<Trash2 className="w-3 h-3 text-red-400" />}
                    >
                      Delete Exp
                    </Button>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => handleRunAll(false)}
                      disabled={isExecuting}
                      icon={<Play className="w-3 h-3 fill-current" />}
                    >
                      {isExecuting ? 'Running...' : 'Run All Variants'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Right Column: Variant Detail / Mutation Studio */}
              <div className="flex-1 flex flex-col overflow-y-auto bg-[#09090b] p-5">
                {isCreatingVariant ? (
                  /* Create Variant Form */
                  <div className="max-w-2xl mx-auto w-full bg-[#111114] border border-[#24242a] rounded-lg p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-[#202024] pb-3">
                      <span className="font-semibold text-zinc-100 text-sm">Add New Variant</span>
                      <Badge variant="neutral" size="xs">Step 1: Configure</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                          Variant Name
                        </label>
                        <Input
                          value={variantName}
                          onChange={(e) => setVariantName(e.target.value)}
                          placeholder="e.g. Concise Prompting"
                          inputSize="sm"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                          Replay Safety Mode
                        </label>
                        <Select
                          value={variantReplayMode}
                          onChange={(e) => setVariantReplayMode(e.target.value as ReplayMode)}
                          selectSize="sm"
                        >
                          <option value="mock_mutated">mock_mutated (Upstream mock, Zero cost)</option>
                          <option value="cache_only">cache_only (Strict cache)</option>
                          <option value="live_replay">live_replay (Live calls, Real cost)</option>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                        Fork From Span ID (Optional — leave blank for root)
                      </label>
                      <Input
                        value={variantForkSpanId}
                        onChange={(e) => setVariantForkSpanId(e.target.value)}
                        placeholder="e.g. span_xxx (ancestors cached with 0ms & $0.00)"
                        inputSize="sm"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-400 text-[10px] uppercase font-bold block mb-1">
                        Description / Hypothesis
                      </label>
                      <Input
                        value={variantDesc}
                        onChange={(e) => setVariantDesc(e.target.value)}
                        placeholder="What are you testing?"
                        inputSize="sm"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-[#202024]">
                      <Button variant="ghost" size="xs" onClick={() => setIsCreatingVariant(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={handleCreateVariant}
                        disabled={!variantName.trim()}
                      >
                        Save Variant
                      </Button>
                    </div>
                  </div>
                ) : activeVariant ? (
                  /* Active Variant Detail View */
                  <div className="flex flex-col gap-6 max-w-4xl w-full mx-auto">
                    {/* Header Card */}
                    <div className="bg-[#111114] border border-[#24242a] rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-zinc-100 text-sm">{activeVariant.name}</h3>
                          <Badge
                            variant="status"
                            status={activeVariant.status}
                            size="xs"
                          >
                            {activeVariant.status}
                          </Badge>
                          <Badge variant="outline" size="xs">
                            {activeVariant.replay_mode}
                          </Badge>
                        </div>
                        {activeVariant.description && (
                          <p className="text-zinc-400 text-[11px]">{activeVariant.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => handleDeleteVariant(activeVariant.id)}
                          icon={<Trash2 className="w-3 h-3 text-red-400" />}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleReplayVariant(activeVariant)}
                          disabled={isExecuting}
                          icon={<Play className="w-3.5 h-3.5 fill-current" />}
                        >
                          {isExecuting ? 'Replaying...' : 'Replay Variant'}
                        </Button>
                      </div>
                    </div>

                    {/* Source Run & Variant Metrics Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-[#121216] border border-[#202024] p-3 rounded">
                        <span className="text-zinc-400 text-[10px] block uppercase">Source Run</span>
                        <span className="font-semibold text-zinc-200 text-xs">
                          {sourceRun ? sourceRun.name : activeVariant.source_run_id.slice(0, 12)}
                        </span>
                      </div>
                      <div className="bg-[#121216] border border-[#202024] p-3 rounded">
                        <span className="text-zinc-400 text-[10px] block uppercase">Replay Run ID</span>
                        <span className="font-semibold text-zinc-200 text-xs">
                          {activeVariant.replay_run_id ? activeVariant.replay_run_id.slice(0, 12) + '...' : '—'}
                        </span>
                      </div>
                      <div className="bg-[#121216] border border-[#202024] p-3 rounded">
                        <span className="text-zinc-400 text-[10px] block uppercase">Fork Span</span>
                        <span className="font-semibold text-zinc-200 text-xs">
                          {activeVariant.fork_span_id ? activeVariant.fork_span_id.slice(0, 12) + '...' : 'Root'}
                        </span>
                      </div>
                      <div className="bg-[#121216] border border-[#202024] p-3 rounded">
                        <span className="text-zinc-400 text-[10px] block uppercase">Completed</span>
                        <span className="font-semibold text-zinc-200 text-xs">
                          {activeVariant.completed_at
                            ? new Date(activeVariant.completed_at).toLocaleTimeString()
                            : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Mutation Studio Section */}
                    <div className="bg-[#111114] border border-[#24242a] rounded-lg p-4 flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-[#202024] pb-2">
                        <div className="flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-emerald-400" />
                          <span className="font-semibold text-zinc-200 text-xs uppercase tracking-wider">
                            Mutations Studio
                          </span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">
                          Defined modifications applied during replay
                        </span>
                      </div>

                      {/* Configured Mutations List */}
                      {(() => {
                        const mutations: ExperimentMutation[] = JSON.parse(activeVariant.mutations || '[]');
                        if (mutations.length === 0) {
                          return (
                            <div className="p-4 bg-[#09090b] rounded border border-dashed border-[#27272a] text-center text-zinc-500">
                              No mutations configured for this variant. Add one below to modify prompts, models, or tool responses.
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-2">
                            {mutations.map((m, idx) => (
                              <div
                                key={idx}
                                className="bg-[#0c0c0e] border border-[#202024] p-3 rounded flex items-start justify-between"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {m.type === 'prompt' && <FileText className="w-4 h-4 text-blue-400" />}
                                    {m.type === 'model' && <Cpu className="w-4 h-4 text-purple-400" />}
                                    {m.type === 'tool_args' && <Wrench className="w-4 h-4 text-amber-400" />}
                                    {m.type === 'mock_tool' && <Sparkles className="w-4 h-4 text-emerald-400" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="neutral" size="xs">
                                        {m.type}
                                      </Badge>
                                      {m.target_span_id && (
                                        <span className="text-zinc-400 text-[10px] font-mono">
                                          Span: {m.target_span_id}
                                        </span>
                                      )}
                                      <span className="text-zinc-500 text-[10px] font-mono">
                                        Field: {m.field}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono bg-[#141418] p-2 rounded border border-[#202024] text-zinc-300 max-w-xl overflow-x-auto whitespace-pre-wrap">
                                      {typeof m.new_value === 'string'
                                        ? m.new_value
                                        : JSON.stringify(m.new_value, null, 2)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Add Mutation Form */}
                      <div className="bg-[#141418] border border-[#24242a] p-3 rounded-lg flex flex-col gap-3">
                        <span className="font-semibold text-zinc-300 text-xs">Add Mutation to Variant</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="text-zinc-400 text-[10px] block mb-1">Mutation Type</label>
                            <Select
                              value={newMutationType}
                              onChange={(e) => {
                                const val = e.target.value as MutationType;
                                setNewMutationType(val);
                                if (val === 'model') setNewMutationField('model');
                                else if (val === 'prompt') setNewMutationField('messages');
                                else if (val === 'tool_args') setNewMutationField('arguments');
                                else if (val === 'mock_tool') setNewMutationField('output');
                              }}
                              selectSize="sm"
                            >
                              <option value="prompt">prompt (Prompt override)</option>
                              <option value="model">model (Swap model)</option>
                              <option value="tool_args">tool_args (Tool arguments)</option>
                              <option value="mock_tool">mock_tool (Mock tool output)</option>
                              <option value="custom_payload">custom_payload (JSON payload)</option>
                            </Select>
                          </div>
                          <div>
                            <label className="text-zinc-400 text-[10px] block mb-1">Target Span ID</label>
                            <Input
                              value={newMutationTargetSpan}
                              onChange={(e) => setNewMutationTargetSpan(e.target.value)}
                              placeholder="e.g. span_123"
                              inputSize="sm"
                            />
                          </div>
                          <div>
                            <label className="text-zinc-400 text-[10px] block mb-1">Target Field</label>
                            <Input
                              value={newMutationField}
                              onChange={(e) => setNewMutationField(e.target.value)}
                              placeholder="messages / model"
                              inputSize="sm"
                            />
                          </div>
                          <div>
                            <label className="text-zinc-400 text-[10px] block mb-1">New Value</label>
                            <Input
                              value={newMutationValue}
                              onChange={(e) => setNewMutationValue(e.target.value)}
                              placeholder="Text or JSON string"
                              inputSize="sm"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={async () => {
                              handleAddMutation();
                              if (!selectedExperimentId || !activeVariant) return;
                              const currentMuts = JSON.parse(activeVariant.mutations || '[]');
                              let parsedVal: any = newMutationValue;
                              if (newMutationType === 'tool_args' || newMutationType === 'mock_tool' || newMutationType === 'custom_payload') {
                                try {
                                  parsedVal = JSON.parse(newMutationValue);
                                } catch {}
                              }
                              const updatedMuts = [
                                ...currentMuts,
                                {
                                  type: newMutationType,
                                  target_span_id: newMutationTargetSpan.trim() || 'root',
                                  field: newMutationField.trim() || 'messages',
                                  original_value: null,
                                  new_value: parsedVal
                                }
                              ];
                              await updateExperimentVariant(selectedExperimentId, activeVariant.id, {
                                mutations: updatedMuts
                              });
                              await loadActiveExperiment(selectedExperimentId);
                              setNewMutationValue('');
                              setNewMutationTargetSpan('');
                            }}
                            disabled={!newMutationValue.trim()}
                            icon={<Plus className="w-3 h-3" />}
                          >
                            Save Mutation
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No Variant Selected"
                    description="Choose a variant on the left to configure mutations and run replays."
                    className="py-24"
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 2: COMPARISON MATRIX */}
          {activeTab === 'matrix' && (
            <div className="flex-1 overflow-y-auto p-6 bg-[#09090b]">
              <div className="max-w-5xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-100 text-sm">Multi-Variant Scorecard</h3>
                    <p className="text-zinc-400 text-xs">
                      Compare all executed variants against the baseline source run (Run ID: {activeExperiment?.source_run_id}).
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => selectedExperimentId && loadComparison(selectedExperimentId)}
                    icon={<RefreshCw className={`w-3 h-3 ${isLoadingComparison ? 'animate-spin' : ''}`} />}
                  >
                    Refresh Matrix
                  </Button>
                </div>

                {isLoadingComparison ? (
                  <LoadingState message="Computing multi-variant comparison matrix..." className="py-24" />
                ) : !comparison || comparison.scorecard.length === 0 ? (
                  <EmptyState
                    title="No Executed Variants Yet"
                    description="Run your variants first using 'Run All Variants' or replay individual variants to generate comparison metrics."
                    className="py-24"
                  />
                ) : (
                  <div className="bg-[#111114] border border-[#24242a] rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#202024] bg-[#16161b] text-zinc-400 text-[10px] uppercase tracking-wider">
                          <th className="p-3">Variant</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Cost ($)</th>
                          <th className="p-3">Cost Delta</th>
                          <th className="p-3">Duration</th>
                          <th className="p-3">Duration Delta</th>
                          <th className="p-3">Tokens</th>
                          <th className="p-3">Tokens Delta</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#202024]">
                        {comparison.scorecard.map((sc: MultiVariantScorecardItem) => {
                          const isCostDown = sc.costDeltaUsd <= 0;
                          const isLatencyDown = sc.durationDeltaMs <= 0;
                          return (
                            <tr key={sc.variantId} className="hover:bg-[#141418] transition-colors">
                              <td className="p-3 font-medium text-zinc-200">
                                <div>{sc.variantName}</div>
                                {sc.replayRunId && (
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    {sc.replayRunId.slice(0, 10)}...
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <Badge variant="status" status={sc.status} size="xs">
                                  {sc.status}
                                </Badge>
                              </td>
                              <td className="p-3 font-semibold text-zinc-100">
                                ${sc.costUsd.toFixed(4)}
                              </td>
                              <td className="p-3">
                                <span className={isCostDown ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                                  {isCostDown ? '' : '+'}${sc.costDeltaUsd.toFixed(4)} ({sc.costSavingsPercent.toFixed(1)}%)
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-zinc-100">
                                {sc.durationMs} ms
                              </td>
                              <td className="p-3">
                                <span className={isLatencyDown ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                                  {isLatencyDown ? '' : '+'}{sc.durationDeltaMs} ms
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-zinc-100">
                                {sc.tokenCount}
                              </td>
                              <td className="p-3">
                                <span className={sc.tokenDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {sc.tokenDelta <= 0 ? '' : '+'}{sc.tokenDelta}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {sc.replayRunId && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      onClick={() => {
                                        const forkSpanId = activeExperiment?.variants.find((v) => v.id === sc.variantId)?.fork_span_id;
                                        if (onSelectSpan && forkSpanId) {
                                          onSelectSpan(forkSpanId, sc.replayRunId || undefined);
                                        } else if (sc.replayRunId) {
                                          onSelectRun(sc.replayRunId);
                                        }
                                        onClose();
                                      }}
                                      icon={<ArrowRight className="w-3 h-3" />}
                                      title="Inspect variant run in Debugger"
                                    >
                                      Inspect
                                    </Button>
                                  )}
                                  {sc.replayRunId && activeExperiment?.source_run_id && (
                                    <Button
                                      variant="secondary"
                                      size="xs"
                                      onClick={() => {
                                        onOpenDiffModal(activeExperiment.source_run_id, sc.replayRunId!);
                                        onClose();
                                      }}
                                      icon={<Scale className="w-3 h-3" />}
                                      title="Compare against base run in Diff Arena"
                                    >
                                      Diff
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REPLAY HISTORY */}
          {activeTab === 'history' && (
            <div className="flex-1 overflow-y-auto p-6 bg-[#09090b]">
              <div className="max-w-4xl mx-auto flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-100 text-sm">Persistent Replay History</h3>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={loadHistory}
                    icon={<RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />}
                  >
                    Refresh
                  </Button>
                </div>

                {isLoadingHistory ? (
                  <LoadingState message="Loading replay history..." className="py-24" />
                ) : historyItems.length === 0 ? (
                  <EmptyState
                    title="No Replays Recorded"
                    description="Replays executed through the debugger or experiment studio will be listed here with full provenance."
                    className="py-24"
                  />
                ) : (
                  <div className="space-y-2">
                    {historyItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-[#111114] border border-[#24242a] p-3 rounded flex items-center justify-between hover:border-[#35353d] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <History className="w-4 h-4 text-zinc-400" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-200">{item.variantName}</span>
                              <Badge variant="status" status={item.status} size="xs">
                                {item.status}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              Run: {item.replayRunId.slice(0, 10)}... · {new Date(item.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right text-[11px]">
                            <div className="text-zinc-200 font-semibold">${item.costUsd.toFixed(4)}</div>
                            <div className="text-zinc-500">{item.tokens} tokens · {item.durationMs}ms</div>
                          </div>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              onSelectRun(item.replayRunId);
                              onClose();
                            }}
                            icon={<ArrowRight className="w-3 h-3" />}
                          >
                            Inspect in Debugger
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Safety Confirmation Modal for Live Replays */}
      {pendingLiveAction && (
        <Modal
          isOpen={true}
          onClose={() => setPendingLiveAction(null)}
          title="Security Warning: Live Replay Confirmation"
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200">
                You are about to execute a <strong>live_replay</strong>. This will make live outbound API calls to model providers or tools, and may incur real financial costs and state modifications.
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Are you sure you want to proceed with this live execution?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingLiveAction(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const act = pendingLiveAction;
                  setPendingLiveAction(null);
                  if (act) await act();
                }}
              >
                Confirm & Replay Live
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
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
              <FlaskConical className="w-4 h-4 text-[#ea580c]" />
              <span className="font-semibold text-sm text-zinc-100 uppercase tracking-wide">
                Experiment Studio
              </span>
              <Badge variant="neutral" size="xs">
                MUTATION LAB
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {activeExperiment && (
              <span className="text-zinc-400 text-[11px] hidden sm:inline">
                {activeExperiment.name} ({activeExperiment.variants.length} variant{activeExperiment.variants.length !== 1 ? 's' : ''})
              </span>
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
          <FlaskConical className="w-4 h-4 text-[#ea580c]" />
          <span>Experiment Studio</span>
          <Badge variant="neutral" size="xs">MUTATION LAB</Badge>
        </div>
      }
      subtitle="Replay, mutate prompts and parameters, and evaluate batch variants"
      maxWidth="5xl"
    >
      {contentBody}
    </Modal>
  );
};
