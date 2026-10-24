'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  ShieldAlert,
  RotateCcw,
  Zap,
  GitFork,
  Sliders,
  Radio
} from 'lucide-react';
import { getStatusStyle, TOKENS } from './tokens';

export interface StatusIndicatorProps {
  status: string;
  label?: string;
  size?: 'xs' | 'sm';
  showLabel?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  size = 'sm',
  showLabel = true,
  className = ''
}) => {
  const norm = status.toLowerCase();
  const displayLabel = label || norm.toUpperCase();

  const dotSize = size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';

  if (norm === 'running') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono font-medium text-zinc-100 ${textSize} ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className={`relative inline-flex rounded-full bg-white ${dotSize}`} />
        </span>
        {showLabel && <span>{displayLabel}</span>}
      </span>
    );
  }

  if (norm === 'intercepted') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono font-medium text-orange-300 ${textSize} ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
          <span className={`relative inline-flex rounded-full bg-orange-500 ${dotSize}`} />
        </span>
        {showLabel && <span>{label || 'INTERCEPTED'}</span>}
      </span>
    );
  }

  if (norm === 'paused') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-amber-300 ${textSize} ${className}`}>
        <Pause className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
        {showLabel && <span>{displayLabel}</span>}
      </span>
    );
  }

  if (norm === 'completed' || norm === 'passed') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-zinc-300 ${textSize} ${className}`}>
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        {showLabel && <span>{displayLabel}</span>}
      </span>
    );
  }

  if (norm === 'failed' || norm === 'error') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-rose-300 ${textSize} ${className}`}>
        <AlertTriangle className="w-3 h-3 text-rose-400" />
        {showLabel && <span>{displayLabel}</span>}
      </span>
    );
  }

  if (norm === 'breaker_tripped' || norm === 'guardrail_block') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-red-400 ${textSize} ${className}`}>
        <ShieldAlert className="w-3 h-3 text-red-500" />
        {showLabel && <span>{label || 'BREAKER'}</span>}
      </span>
    );
  }

  if (norm === 'replay') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-sky-300 ${textSize} ${className}`}>
        <RotateCcw className="w-2.5 h-2.5 text-sky-400" />
        {showLabel && <span>{label || 'REPLAY'}</span>}
      </span>
    );
  }

  if (norm === 'cached') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-zinc-400 ${textSize} ${className}`}>
        <Zap className="w-2.5 h-2.5 text-zinc-400" />
        {showLabel && <span>{label || 'CACHED'}</span>}
      </span>
    );
  }

  if (norm === 'forked') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-purple-300 ${textSize} ${className}`}>
        <GitFork className="w-2.5 h-2.5 text-purple-400" />
        {showLabel && <span>{label || 'FORKED'}</span>}
      </span>
    );
  }

  if (norm === 'mocked') {
    return (
      <span className={`inline-flex items-center gap-1 font-mono font-medium text-teal-300 ${textSize} ${className}`}>
        <Sliders className="w-2.5 h-2.5 text-teal-400" />
        {showLabel && <span>{label || 'MOCKED'}</span>}
      </span>
    );
  }

  const s = getStatusStyle(norm);

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono font-medium text-zinc-400 ${textSize} ${className}`}>
      <span className={`rounded-full ${dotSize}`} style={{ backgroundColor: s.dot }} />
      {showLabel && <span>{displayLabel}</span>}
    </span>
  );
};
