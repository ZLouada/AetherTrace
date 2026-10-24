'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  detail?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  detail,
  size = 'sm',
  className = ''
}) => {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 p-4 text-zinc-300 select-none ${className}`}>
      <div className={`flex items-center gap-2 ${textSize} font-sans`}>
        <Loader2 className={`${iconSize} animate-spin text-[#ea580c]`} />
        <span className="text-zinc-200 font-medium">{message}</span>
      </div>
      {detail && <span className="text-[11px] font-mono text-zinc-400">{detail}</span>}
    </div>
  );
};
