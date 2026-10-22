'use client';

import React, { useState, useEffect } from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ServerCrash,
  FileCode,
  Check
} from 'lucide-react';
import type { ChaosConfig } from '@/lib/api';
import { Modal, Button } from '@/design-system';

interface ChaosModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChaosConfig | null;
  onSave: (config: Partial<ChaosConfig>) => Promise<void>;
}

export const ChaosModal: React.FC<ChaosModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave
}) => {
  const [enabled, setEnabled] = useState(false);
  const [latencySpikeMs, setLatencySpikeMs] = useState(0);
  const [rateLimitRate, setRateLimitRate] = useState(0);
  const [upstream500Rate, setUpstream500Rate] = useState(0);
  const [malformedJsonRate, setMalformedJsonRate] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setLatencySpikeMs(config.latencySpikeMs || 0);
      setRateLimitRate(Math.round((config.rateLimitErrorRate || 0) * 100));
      setUpstream500Rate(Math.round((config.upstream500ErrorRate || 0) * 100));
      setMalformedJsonRate(Math.round((config.malformedJsonRate || 0) * 100));
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        enabled,
        latencySpikeMs,
        rateLimitErrorRate: rateLimitRate / 100,
        upstream500ErrorRate: upstream500Rate / 100,
        malformedJsonRate: malformedJsonRate / 100
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chaos Engineering Engine"
      subtitle="Inject artificial faults to test agent resilience & recovery"
      icon={<Flame className="w-4 h-4 text-zinc-300" />}
      maxWidth="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            isLoading={isSaving}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Arm Chaos Engine
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs font-mono">
        {/* Master Enable Toggle */}
        <div className="flex items-center justify-between p-3 rounded bg-[#18181c] border border-[#2c2c32]">
          <div>
            <div className="font-semibold text-zinc-200">Global Chaos Fault Injection</div>
            <div className="text-[11px] text-zinc-400">Probabilistically inject failures across all agent calls</div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
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

        {/* Latency Spike Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Artificial Latency Delay:
            </span>
            <span className="text-amber-400 font-semibold">{latencySpikeMs} ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="10000"
            step="250"
            value={latencySpikeMs}
            onChange={(e) => setLatencySpikeMs(Number(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer bg-zinc-800 rounded h-1.5"
          />
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>0ms (Off)</span>
            <span>2500ms</span>
            <span>5000ms</span>
            <span>10000ms</span>
          </div>
        </div>

        {/* 429 Rate Limit Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              Synthetic HTTP 429 Rate Limit:
            </span>
            <span className="text-amber-500 font-semibold">{rateLimitRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={rateLimitRate}
            onChange={(e) => setRateLimitRate(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer bg-zinc-800 rounded h-1.5"
          />
        </div>

        {/* Upstream 500/502 Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 flex items-center gap-1.5">
              <ServerCrash className="w-3.5 h-3.5 text-rose-400" />
              Synthetic HTTP 502 Upstream Failure:
            </span>
            <span className="text-rose-400 font-semibold">{upstream500Rate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={upstream500Rate}
            onChange={(e) => setUpstream500Rate(Number(e.target.value))}
            className="w-full accent-rose-400 cursor-pointer bg-zinc-800 rounded h-1.5"
          />
        </div>

        {/* Corrupt JSON Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-zinc-400" />
              Malformed / Corrupted JSON Rate:
            </span>
            <span className="text-zinc-200 font-semibold">{malformedJsonRate}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={malformedJsonRate}
            onChange={(e) => setMalformedJsonRate(Number(e.target.value))}
            className="w-full accent-white cursor-pointer bg-zinc-800 rounded h-1.5"
          />
        </div>

        <div className="p-2.5 rounded bg-[#18181c] border border-[#2c2c32] text-[11px] text-zinc-400 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
          <span>
            Tip: You can test faults on specific calls using the{' '}
            <code className="text-white bg-black/60 px-1 py-0.2 rounded border border-zinc-800">X-Chaos-Inject</code> header (e.g.{' '}
            <code className="text-white bg-black/60 px-1 py-0.2 rounded border border-zinc-800">rate_limit</code>,{' '}
            <code className="text-white bg-black/60 px-1 py-0.2 rounded border border-zinc-800">corrupt_json</code>).
          </span>
        </div>
      </div>
    </Modal>
  );
};
