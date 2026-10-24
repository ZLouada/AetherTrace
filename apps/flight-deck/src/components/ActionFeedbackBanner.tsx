'use client';

import React, { useEffect } from 'react';
import {
  Check,
  GitFork,
  RotateCcw,
  Scale,
  X,
  ArrowRight,
  Info
} from 'lucide-react';

export interface ActionFeedback {
  id: string;
  type: 'fork' | 'replay' | 'resolve' | 'copy' | 'info';
  title: string;
  message?: string;
  runId?: string;
  sourceRunId?: string;
  timestamp: number;
}

export interface ActionFeedbackBannerProps {
  feedback: ActionFeedback | null;
  onDismiss: () => void;
  onOpenRun?: (runId: string) => void;
  onCompareWithSource?: (sourceRunId: string, targetRunId: string) => void;
}

export const ActionFeedbackBanner: React.FC<ActionFeedbackBannerProps> = ({
  feedback,
  onDismiss,
  onOpenRun,
  onCompareWithSource
}) => {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  if (!feedback) return null;

  let Icon = Check;
  let borderColor = 'border-emerald-500/50';
  let badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';

  if (feedback.type === 'fork') {
    Icon = GitFork;
    borderColor = 'border-indigo-500/50';
    badgeColor = 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40';
  } else if (feedback.type === 'replay') {
    Icon = RotateCcw;
    borderColor = 'border-sky-500/50';
    badgeColor = 'bg-sky-950/80 text-sky-300 border-sky-500/40';
  } else if (feedback.type === 'info') {
    Icon = Info;
    borderColor = 'border-zinc-700';
    badgeColor = 'bg-[#18181c] text-zinc-300 border-zinc-700';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 max-w-md bg-[#111114] border ${borderColor} rounded shadow-2xl p-3 text-xs font-mono select-none animate-in slide-in-from-bottom-2 fade-in duration-200`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`p-1 rounded border shrink-0 mt-0.5 ${badgeColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-100 text-xs font-sans">
              {feedback.title}
            </div>
            {feedback.message && (
              <div className="text-zinc-400 text-[11px] mt-0.5 font-sans leading-tight">
                {feedback.message}
              </div>
            )}
            {feedback.runId && (
              <div className="mt-1 text-[10px] text-zinc-500 font-mono truncate">
                ID: <span className="text-zinc-300">{feedback.runId}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer transition-colors"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Action triggers */}
      {(feedback.runId || (feedback.sourceRunId && feedback.runId)) && (
        <div className="mt-2.5 pt-2 border-t border-[#27272a] flex items-center gap-2">
          {feedback.runId && onOpenRun && (
            <button
              onClick={() => {
                onOpenRun(feedback.runId!);
                onDismiss();
              }}
              className="px-2 py-1 rounded bg-[#202025] hover:bg-[#27272f] border border-[#3f3f46] text-zinc-200 text-[11px] font-sans font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Open Run</span>
              <ArrowRight className="w-3 h-3 text-zinc-400" />
            </button>
          )}

          {feedback.sourceRunId && feedback.runId && onCompareWithSource && (
            <button
              onClick={() => {
                onCompareWithSource(feedback.sourceRunId!, feedback.runId!);
                onDismiss();
              }}
              className="px-2 py-1 rounded bg-[#202025] hover:bg-[#27272f] border border-[#3f3f46] text-zinc-200 text-[11px] font-sans font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Scale className="w-3 h-3 text-sky-400" />
              <span>Compare with Source</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
