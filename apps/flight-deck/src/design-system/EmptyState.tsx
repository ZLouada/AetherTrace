'use client';

import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  badge,
  title,
  description,
  action,
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-10'
  }[size];

  const titleSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${sizeClasses} ${className}`}>
      {icon && <div className="text-zinc-400 mb-2.5 flex items-center justify-center">{icon}</div>}
      {badge && <div className="mb-2">{badge}</div>}
      <h3 className={`${titleSize} font-sans font-medium text-zinc-200`}>{title}</h3>
      {description && <p className="text-xs font-sans text-zinc-400 mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
};
