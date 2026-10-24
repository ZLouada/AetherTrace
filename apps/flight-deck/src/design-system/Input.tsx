'use client';

import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'mono' | 'ui';
  inputSize?: 'sm' | 'md';
  icon?: React.ReactNode;
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'mono',
      inputSize = 'sm',
      icon,
      hasError = false,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'h-7 text-xs px-2',
      md: 'h-8 text-xs px-2.5'
    }[inputSize];

    const fontClass = variant === 'mono' ? 'font-mono' : 'font-sans';
    const borderClass = hasError
      ? 'border-rose-600 focus:border-rose-500 focus:ring-rose-500/30'
      : 'border-[#2c2c32] focus:border-accent/70 focus:ring-accent/40';

    return (
      <div className={`relative flex items-center w-full ${disabled ? 'opacity-50' : ''}`}>
        {icon && (
          <span className="absolute left-2.5 text-zinc-500 pointer-events-none flex items-center justify-center">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={`w-full bg-[#111114] text-zinc-200 placeholder-zinc-500 rounded border ${borderClass} ${fontClass} ${sizeClasses} ${
            icon ? 'pl-8' : ''
          } outline-none transition-colors duration-fast focus:ring-1 ${className}`}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
