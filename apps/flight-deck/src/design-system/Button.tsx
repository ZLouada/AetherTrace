'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'destructive' | 'outline' | 'accent';
  size?: 'xs' | 'sm' | 'md';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'sm',
      isLoading = false,
      icon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center font-sans font-medium rounded transition-colors duration-fast select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeClasses = {
      xs: 'px-1.5 py-0.5 text-[10px] gap-1',
      sm: 'px-2.5 py-1 text-xs gap-1.5',
      md: 'px-3 py-1.5 text-xs gap-2'
    }[size];

    const variantClasses = {
      primary:
        'bg-white text-black hover:bg-zinc-200 active:bg-zinc-300 font-semibold shadow-xs',
      accent:
        'bg-accent text-white hover:bg-accent-hover active:bg-accent-active border border-accent-border font-semibold shadow-xs',
      secondary:
        'bg-[#18181c] text-zinc-200 hover:bg-[#222228] hover:text-white border border-[#2c2c32] active:bg-[#272730]',
      ghost:
        'bg-transparent text-zinc-400 hover:text-white hover:bg-[#18181c] border border-transparent',
      tertiary:
        'bg-transparent text-zinc-400 hover:text-white hover:bg-[#18181c] border border-transparent',
      danger:
        'bg-rose-950/70 text-rose-200 hover:bg-rose-900 border border-rose-800 active:bg-rose-900',
      destructive:
        'bg-rose-950/70 text-rose-200 hover:bg-rose-900 border border-rose-800 active:bg-rose-900',
      outline:
        'bg-transparent text-zinc-300 hover:text-white hover:bg-[#18181c] border border-[#2c2c32]'
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
