'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'sm',
  className = ''
}) => {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={`flex items-center justify-center gap-2 p-4 text-zinc-400 font-mono ${textSize} select-none ${className}`}>
      <Loader2 className={`${iconSize} animate-spin text-zinc-500`} />
      <span>{message}</span>
    </div>
  );
};
