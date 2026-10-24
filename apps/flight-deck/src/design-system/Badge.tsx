'use client';

import React from 'react';
import { TOKENS, getCategoryStyle, getStatusStyle } from './tokens';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'category' | 'status' | 'origin' | 'outline' | 'accent';
  category?: string;
  status?: string;
  origin?: keyof typeof TOKENS.origins;
  size?: 'xs' | 'sm';
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  category,
  status,
  origin,
  size = 'xs',
  icon,
  children,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-0.5 text-xs gap-1.5'
  }[size];

  let styleClasses = 'bg-[#18181c] text-zinc-300 border border-[#2c2c32]';

  if (variant === 'accent') {
    styleClasses = 'bg-accent/15 text-orange-200 border border-accent/40';
  } else if (variant === 'category' && category) {
    const s = getCategoryStyle(category);
    return (
      <span
        className={`inline-flex items-center font-mono font-medium rounded select-none ${sizeClasses} ${className}`}
        style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text, borderWidth: '1px' }}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{children || category.toUpperCase()}</span>
      </span>
    );
  } else if (variant === 'status' && status) {
    const s = getStatusStyle(status);
    return (
      <span
        className={`inline-flex items-center font-mono font-medium rounded select-none ${sizeClasses} ${className}`}
        style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text, borderWidth: '1px' }}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{children || status.toUpperCase()}</span>
      </span>
    );
  } else if (variant === 'origin' && origin && TOKENS.origins[origin]) {
    const o = TOKENS.origins[origin];
    return (
      <span
        className={`inline-flex items-center font-mono font-medium rounded select-none ${sizeClasses} ${className}`}
        style={{ backgroundColor: o.bg, borderColor: o.border, color: o.text, borderWidth: '1px' }}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{children || origin.replace('_', ' ').toUpperCase()}</span>
      </span>
    );
  } else if (variant === 'outline') {
    styleClasses = 'bg-transparent text-zinc-400 border border-[#2c2c32]';
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded select-none ${sizeClasses} ${styleClasses} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
};
