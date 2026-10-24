'use client';

import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: 'sm' | 'md';
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ selectSize = 'sm', hasError = false, children, className = '', disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-7 text-xs px-2 pr-7',
      md: 'h-8 text-xs px-2.5 pr-8'
    }[selectSize];

    const borderClass = hasError
      ? 'border-rose-600 focus:border-rose-500 focus:ring-rose-500/30'
      : 'border-[#2c2c32] focus:border-accent/70 focus:ring-accent/40';

    return (
      <div className={`relative inline-flex items-center w-full ${disabled ? 'opacity-50' : ''}`}>
        <select
          ref={ref}
          disabled={disabled}
          className={`w-full appearance-none bg-[#111114] text-zinc-200 rounded border ${borderClass} font-mono ${sizeClasses} outline-none transition-colors duration-fast focus:ring-1 cursor-pointer ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
      </div>
    );
  }
);

Select.displayName = 'Select';
