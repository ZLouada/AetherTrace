'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center select-none font-mono ${className}`}>
      {icon && <div className="text-zinc-500 mb-2">{icon}</div>}
      <h3 className="text-xs font-semibold text-zinc-300">{title}</h3>
      {description && <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};
