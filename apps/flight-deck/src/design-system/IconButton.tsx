'use client';

import React, { forwardRef } from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'xs' | 'sm' | 'md';
  variant?: 'ghost' | 'secondary' | 'danger' | 'outline' | 'accent';
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'sm', variant = 'ghost', label, children, className = '', ...props }, ref) => {
    const sizeClasses = {
      xs: 'w-5 h-5 text-[10px]',
      sm: 'w-7 h-7 text-xs',
      md: 'w-8 h-8 text-sm'
    }[size];

    const variantClasses = {
      ghost: 'bg-transparent text-zinc-400 hover:text-white hover:bg-[#18181c] border border-transparent',
      secondary: 'bg-[#18181c] text-zinc-300 hover:bg-[#222228] hover:text-white border border-[#2c2c32]',
      danger: 'bg-transparent text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 border border-transparent',
      outline: 'bg-transparent text-zinc-300 hover:text-white hover:bg-[#18181c] border border-[#2c2c32]',
      accent: 'bg-accent/20 text-orange-300 hover:text-white hover:bg-accent/30 border border-accent/40'
    }[variant];

    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={`inline-flex items-center justify-center rounded transition-colors duration-fast select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
