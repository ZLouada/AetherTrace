import React, { useState, useEffect } from 'react';
import {
  Flame,
  X,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ServerCrash,
  FileCode,
  Check
} from 'lucide-react';
import type { ChaosConfig } from '@/lib/api';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#0d121f] border border-purple-500/40 rounded-xl shadow-[0_0_40px_rgba(168,85,247,0.25)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 bg-[#111827] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-950/80 border border-purple-600/60 flex items-center justify-center">
              <Flame className="w-4 h-4 text-purple-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2 font-mono">
                Chaos Engineering Engine
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                  v0.2.0
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">Inject artificial faults to test agent resilience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-5 text-xs font-mono">
          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900/80 border border-gray-800">
            <div>
              <div className="font-semibold text-gray-200">Global Chaos Fault Injection</div>
              <div className="text-[11px] text-gray-400">Probabilistically inject failures across all agent calls</div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                enabled ? 'bg-purple-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Latency Spike Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                Artificial Latency Delay:
              </span>
              <span className="text-yellow-400 font-bold">{latencySpikeMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="10000"
              step="250"
              value={latencySpikeMs}
              onChange={(e) => setLatencySpikeMs(Number(e.target.value))}
              className="w-full accent-yellow-400 cursor-pointer bg-gray-800 rounded-lg h-1.5"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>0ms (Off)</span>
              <span>2500ms</span>
              <span>5000ms</span>
              <span>10000ms</span>
            </div>
          </div>

          {/* 429 Rate Limit Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-300 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
                Synthetic HTTP 429 Rate Limit:
              </span>
              <span className="text-orange-400 font-bold">{rateLimitRate}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={rateLimitRate}
              onChange={(e) => setRateLimitRate(Number(e.target.value))}
              className="w-full accent-orange-400 cursor-pointer bg-gray-800 rounded-lg h-1.5"
            />
          </div>

          {/* Upstream 500/502 Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-300 flex items-center gap-1.5">
                <ServerCrash className="w-3.5 h-3.5 text-red-400" />
                Synthetic HTTP 502 Upstream Failure:
              </span>
              <span className="text-red-400 font-bold">{upstream500Rate}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={upstream500Rate}
              onChange={(e) => setUpstream500Rate(Number(e.target.value))}
              className="w-full accent-red-400 cursor-pointer bg-gray-800 rounded-lg h-1.5"
            />
          </div>

          {/* Corrupt JSON Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-300 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-purple-400" />
                Malformed / Corrupted JSON Rate:
              </span>
              <span className="text-purple-400 font-bold">{malformedJsonRate}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={malformedJsonRate}
              onChange={(e) => setMalformedJsonRate(Number(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer bg-gray-800 rounded-lg h-1.5"
            />
          </div>

          <div className="p-2.5 rounded bg-purple-950/30 border border-purple-800/40 text-[11px] text-purple-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <span>
              Tip: You can also test faults on specific calls without changing global rates using the{' '}
              <code className="text-white bg-black/40 px-1 py-0.5 rounded">X-Chaos-Inject</code> header (e.g.{' '}
              <code className="text-white bg-black/40 px-1 py-0.5 rounded">rate_limit</code>,{' '}
              <code className="text-white bg-black/40 px-1 py-0.5 rounded">corrupt_json</code>).
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 bg-[#111827] flex items-center justify-end gap-3 font-mono text-xs">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all active:scale-95 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Arm Chaos Engine'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
