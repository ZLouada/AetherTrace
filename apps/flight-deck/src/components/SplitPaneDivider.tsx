'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface SplitPaneDividerProps {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  title?: string;
  direction?: 'horizontal' | 'vertical'; // vertical = vertical line that resizes horizontally
  disabled?: boolean;
}

export const SplitPaneDivider: React.FC<SplitPaneDividerProps> = ({
  onResize,
  onResizeEnd,
  onDoubleClick,
  className = '',
  title = 'Drag to resize panel (double-click to reset)',
  disabled = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    setIsDragging(true);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (onResizeEnd) {
        onResizeEnd();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize, onResizeEnd]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onResize(-16);
      onResizeEnd?.();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onResize(16);
      onResizeEnd?.();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDoubleClick?.();
    }
  };

  return (
    <div
      role="separator"
      tabIndex={disabled ? -1 : 0}
      aria-orientation="vertical"
      aria-label="Resize panel divider"
      title={title}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      className={`group relative z-20 flex items-center justify-center cursor-col-resize select-none shrink-0 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ea580c] ${
        disabled ? 'pointer-events-none opacity-40' : ''
      } ${className}`}
      style={{ width: '6px', margin: '0 -2px' }}
    >
      {/* Visual Line */}
      <div
        className={`h-full w-[1px] transition-colors duration-150 ${
          isDragging
            ? 'bg-[#ea580c]'
            : 'bg-[#202024] group-hover:bg-[#ea580c]/80'
        }`}
      />
    </div>
  );
};
