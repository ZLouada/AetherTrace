'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '7xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'xl',
  className = ''
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '7xl': 'max-w-7xl'
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px] animate-in fade-in duration-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={`w-full ${maxWidthClasses} bg-[#111114] border border-[#2c2c32] rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${className}`}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-[#202024] bg-[#18181c] flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {icon && <span className="text-zinc-300 shrink-0">{icon}</span>}
            <div className="min-w-0">
              <h2 className="text-sm font-mono font-semibold text-zinc-100 truncate">{title}</h2>
              {subtitle && <p className="text-[11px] font-mono text-zinc-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <IconButton label="Close modal (Esc)" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-[#202024] bg-[#141418] flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
