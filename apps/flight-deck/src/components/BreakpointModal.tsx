'use client';

import React, { useState, useEffect } from 'react';
import {
  PauseCircle,
  Plus,
  Trash2,
  Shield,
  Bot,
  Cpu,
  Sliders
} from 'lucide-react';
import {
  type BreakpointConfig,
  type BreakpointCondition,
  addBreakpointCondition,
  deleteBreakpointCondition,
  toggleBreakpointCondition
} from '@/lib/api';
import {
  Modal,
  Button,
  IconButton,
  Input,
  Select,
  Badge
} from '@/design-system';

interface BreakpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BreakpointConfig | null;
  onSaveConfig: (config: Partial<BreakpointConfig>) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const BreakpointModal: React.FC<BreakpointModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onRefresh
}) => {
  const [enabled, setEnabled] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agents, setAgents] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState('');
  const [models, setModels] = useState<string[]>([]);

  // New Condition Form
  const [condName, setCondName] = useState('');
  const [condTarget, setCondTarget] = useState<BreakpointCondition['target']>('all');
  const [condField, setCondField] = useState('tool_name');
  const [condOp, setCondOp] = useState<BreakpointCondition['operator']>('equals');
  const [condValue, setCondValue] = useState('');
  const [isAddingCond, setIsAddingCond] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setAgents(config.matchAgentNames || []);
      setModels(config.matchModels || []);
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleToggleGlobal = async () => {
    const next = !enabled;
    setEnabled(next);
    await onSaveConfig({ enabled: next });
  };

  const handleAddAgent = async () => {
    const trimmed = agentInput.trim();
    if (!trimmed || agents.includes(trimmed)) return;
    const next = [...agents, trimmed];
    setAgents(next);
    setAgentInput('');
    await onSaveConfig({ matchAgentNames: next });
  };

  const handleRemoveAgent = async (name: string) => {
    const next = agents.filter((a) => a !== name);
    setAgents(next);
    await onSaveConfig({ matchAgentNames: next });
  };

  const handleAddModel = async () => {
    const trimmed = modelInput.trim();
    if (!trimmed || models.includes(trimmed)) return;
    const next = [...models, trimmed];
    setModels(next);
    setModelInput('');
    await onSaveConfig({ matchModels: next });
  };

  const handleRemoveModel = async (model: string) => {
    const next = models.filter((m) => m !== model);
    setModels(next);
    await onSaveConfig({ matchModels: next });
  };

  const handleCreateCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!condField.trim()) return;

    setIsAddingCond(true);
    try {
      let parsedValue: string | number | boolean = condValue;
      if (condOp === 'greater_than' || condOp === 'less_than') {
        const num = Number(condValue);
        if (!isNaN(num)) parsedValue = num;
      } else if (condValue === 'true') {
        parsedValue = true;
      } else if (condValue === 'false') {
        parsedValue = false;
      }

      await addBreakpointCondition({
        name: condName.trim() || undefined,
        target: condTarget,
        field: condField.trim(),
        operator: condOp,
        value: condOp === 'exists' ? undefined : parsedValue,
        enabled: true
      });

      setCondName('');
      setCondField('tool_name');
      setCondOp('equals');
      setCondValue('');
      await onRefresh();
    } catch (err: any) {
      alert(`Failed to add condition: ${err.message}`);
    } finally {
      setIsAddingCond(false);
    }
  };

  const handleToggleCondition = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleBreakpointCondition(id, !currentEnabled);
      await onRefresh();
    } catch (err: any) {
      alert(`Failed to toggle condition: ${err.message}`);
    }
  };

  const handleDeleteCondition = async (id: string) => {
    try {
      await deleteBreakpointCondition(id);
      await onRefresh();
    } catch (err: any) {
      alert(`Failed to delete condition: ${err.message}`);
    }
  };

  const conditions = config?.conditions || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Breakpoint & Interception Rules"
      subtitle="Pause live executions mid-flight for inspection, mutation, or mock injection"
      icon={<PauseCircle className="w-4 h-4 text-zinc-300" />}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] text-zinc-500 font-mono">
            Zero-eval sandbox execution
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Master Enable Toggle */}
        <div className="flex items-center justify-between p-3 rounded bg-[#18181c] border border-[#2c2c32]">
          <div>
            <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-300" />
              Live Socket Interception
            </div>
            <div className="text-[11px] text-zinc-400">
              Hold matching requests open at proxy socket level until human resolution
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleGlobal}
            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-white' : 'bg-zinc-800'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                enabled ? 'translate-x-5 bg-black' : 'translate-x-1 bg-zinc-400'
              }`}
            />
          </button>
        </div>

        {/* Quick Filters: Agent Names & Model Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Agent Names */}
          <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
            <label className="text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
              <Bot className="w-3 h-3 text-zinc-400" />
              Break on Agent Names
            </label>
            <div className="flex gap-1.5">
              <Input
                placeholder="e.g. Coder, Researcher"
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAgent())}
              />
              <Button variant="secondary" size="xs" onClick={handleAddAgent}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[24px]">
              {agents.length === 0 ? (
                <span className="text-[10px] text-zinc-500 italic">No agent filters (matches all)</span>
              ) : (
                agents.map((name) => (
                  <Badge key={name} variant="neutral" size="xs">
                    {name}
                    <button onClick={() => handleRemoveAgent(name)} className="hover:text-rose-400 ml-1">
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Models */}
          <div className="p-2.5 rounded bg-[#111114] border border-[#2c2c32] space-y-2">
            <label className="text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
              <Cpu className="w-3 h-3 text-zinc-400" />
              Break on Models
            </label>
            <div className="flex gap-1.5">
              <Input
                placeholder="e.g. gpt-4o, claude-3-5"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddModel())}
              />
              <Button variant="secondary" size="xs" onClick={handleAddModel}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[24px]">
              {models.length === 0 ? (
                <span className="text-[10px] text-zinc-500 italic">No model filters (matches all)</span>
              ) : (
                models.map((model) => (
                  <Badge key={model} variant="neutral" size="xs">
                    {model}
                    <button onClick={() => handleRemoveModel(model)} className="hover:text-rose-400 ml-1">
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Conditional Breakpoints Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-zinc-300" />
              <h3 className="font-semibold text-zinc-200">Conditional Breakpoints</h3>
              <Badge variant="neutral" size="xs">
                {conditions.length} active
              </Badge>
            </div>
          </div>

          {/* Condition List */}
          {conditions.length === 0 ? (
            <div className="p-3 rounded bg-[#18181c] border border-[#2c2c32] text-center text-zinc-500 text-[11px]">
              No conditional rules configured. Create one below to intercept specific tools, latency thresholds, or errors.
            </div>
          ) : (
            <div className="space-y-1.5">
              {conditions.map((cond) => (
                <div
                  key={cond.id}
                  className={`flex items-center justify-between p-2.5 rounded border transition-all ${
                    cond.enabled
                      ? 'bg-[#18181c] border-[#2c2c32]'
                      : 'bg-[#111114] border-[#202024] opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={cond.enabled}
                      onChange={() => {
                        if (cond.id) handleToggleCondition(cond.id, Boolean(cond.enabled));
                      }}
                      className="rounded border-[#2c2c32] bg-[#111114] text-white focus:ring-0 focus:outline-none cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        {cond.name && (
                          <span className="text-zinc-200 font-semibold text-[11px]">
                            {cond.name}
                          </span>
                        )}
                        <Badge variant="neutral" size="xs">
                          {cond.target}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1">
                        <code className="text-zinc-200 bg-black/60 px-1 py-0.2 rounded border border-[#202024]">
                          {cond.field}
                        </code>
                        <span className="text-zinc-500">{cond.operator}</span>
                        {cond.value !== undefined && (
                          <code className="text-zinc-200 bg-black/60 px-1 py-0.2 rounded border border-[#202024]">
                            {String(cond.value)}
                          </code>
                        )}
                      </div>
                    </div>
                  </div>

                  <IconButton
                    label="Delete rule"
                    size="xs"
                    variant="danger"
                    onClick={() => {
                      if (cond.id) handleDeleteCondition(cond.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          {/* Add Condition Form */}
          <form onSubmit={handleCreateCondition} className="p-3 rounded bg-[#111114] border border-[#2c2c32] space-y-2.5">
            <div className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
              <Plus className="w-3 h-3 text-zinc-400" />
              Add Conditional Breakpoint Rule
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Rule Name (Optional)</label>
                <Input
                  placeholder="e.g. Catch Bash Executions"
                  value={condName}
                  onChange={(e) => setCondName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Target Span Type</label>
                <Select
                  value={condTarget}
                  onChange={(e) => setCondTarget(e.target.value as any)}
                >
                  <option value="all">All Spans</option>
                  <option value="tool_call">tool_call</option>
                  <option value="llm_call">llm_call</option>
                  <option value="http_call">http_call</option>
                  <option value="guardrail_block">guardrail_block</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Field Path</label>
                <Input
                  placeholder="tool_name, cost_usd, model"
                  value={condField}
                  onChange={(e) => setCondField(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Operator</label>
                <Select
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value as any)}
                >
                  <option value="equals">equals</option>
                  <option value="not_equals">not_equals</option>
                  <option value="contains">contains</option>
                  <option value="starts_with">starts_with</option>
                  <option value="greater_than">greater_than</option>
                  <option value="less_than">less_than</option>
                  <option value="exists">exists</option>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Value</label>
                <Input
                  placeholder={condOp === 'exists' ? 'N/A' : 'bash, 0.05, true'}
                  value={condValue}
                  disabled={condOp === 'exists'}
                  onChange={(e) => setCondValue(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isAddingCond || !condField.trim()}
                icon={<Plus className="w-3 h-3" />}
              >
                Add Rule
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
};
