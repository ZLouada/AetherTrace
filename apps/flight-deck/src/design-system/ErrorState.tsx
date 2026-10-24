'use client';

import React from 'react';
import { AlertTriangle, AlertOctagon, RotateCcw, ShieldAlert, Bug } from 'lucide-react';
import { Button } from './Button';
import { Badge } from './Badge';

export type ErrorCategory = 'recoverable' | 'failed_operation' | 'trace_execution_error' | 'system_error';

export interface ErrorStateProps {
  category?: ErrorCategory;
  title: string;
  message?: string;
  detail?: string;
  action?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  category = 'failed_operation',
  title,
  message,
  detail,
  action,
  onRetry,
  retryLabel = 'Retry',
  size = 'md',
  className = ''
}) => {
  const categoryConfig = {
    recoverable: {
      icon: <RotateCcw className="w-5 h-5 text-amber-400" />,
      badge: <Badge variant="status" status="warning" size="xs">RECOVERABLE FAULT</Badge>,
      border: 'border-amber-800/40 bg-amber-950/20'
    },
    failed_operation: {
      icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
      badge: <Badge variant="status" status="failed" size="xs">OPERATION FAILED</Badge>,
      border: 'border-rose-900/40 bg-rose-950/20'
    },
    trace_execution_error: {
      icon: <Bug className="w-5 h-5 text-rose-400" />,
      badge: <Badge variant="category" category="ERROR" size="xs">TRACE EXECUTION ERROR</Badge>,
      border: 'border-rose-900/40 bg-rose-950/20'
    },
    system_error: {
      icon: <AlertOctagon className="w-5 h-5 text-red-500" />,
      badge: <Badge variant="status" status="failed" size="xs">SYSTEM ERROR</Badge>,
      border: 'border-red-900/50 bg-red-950/30'
    }
  }[category];

  const paddingClass = size === 'sm' ? 'p-3' : 'p-5';

  return (
    <div
      className={`rounded border ${categoryConfig.border} flex flex-col items-center justify-center text-center select-none ${paddingClass} ${className}`}
    >
      <div className="mb-2">{categoryConfig.icon}</div>
      <div className="mb-1.5">{categoryConfig.badge}</div>
      <h3 className="text-xs font-sans font-semibold text-zinc-200 mt-1">{title}</h3>
      {message && (
        <p className="text-[11px] font-sans text-zinc-400 mt-1 max-w-sm leading-relaxed">{message}</p>
      )}

      {detail && (
        <div className="mt-2.5 max-w-md w-full text-left bg-black/60 border border-[#2c2c32] rounded p-2 overflow-x-auto text-[10px] font-mono text-rose-300">
          <code>{detail}</code>
        </div>
      )}

      {(action || onRetry) && (
        <div className="mt-3 flex items-center gap-2">
          {onRetry && (
            <Button
              variant="secondary"
              size="xs"
              onClick={onRetry}
              icon={<RotateCcw className="w-3 h-3" />}
            >
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
};
