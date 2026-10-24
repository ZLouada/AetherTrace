'use client';

import React from 'react';

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
}

export const Panel: React.FC<PanelProps> = ({
  variant = 'default',
  children,
  className = '',
  ...props
}) => {
  const variantClass = {
    default: 'bg-[#111114] border-[#2c2c32]',
    elevated: 'bg-[#18181c] border-[#2c2c32]',
    bordered: 'bg-transparent border-[#202024]'
  }[variant];

  return (
    <div
      className={`rounded border flex flex-col overflow-hidden ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-3 py-2 border-b border-[#202024] bg-[#18181c] flex items-center justify-between shrink-0 select-none ${className}`}
      {...props}
    >
      {children || (
        <>
          <div className="flex flex-col min-w-0 pr-2">
            {title && <span className="text-xs font-sans font-semibold text-zinc-100 truncate">{title}</span>}
            {subtitle && <span className="text-[10px] font-mono text-zinc-400 truncate">{subtitle}</span>}
          </div>
          {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
        </>
      )}
    </div>
  );
};

export interface PanelBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export const PanelBody: React.FC<PanelBodyProps> = ({
  padded = true,
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex-1 overflow-auto ${padded ? 'p-3' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface PanelFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const PanelFooter: React.FC<PanelFooterProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-3 py-2 border-t border-[#202024] bg-[#141418] flex items-center justify-between shrink-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
