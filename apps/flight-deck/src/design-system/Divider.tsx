'use client';

import React from 'react';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  className = ''
}) => {
  if (orientation === 'vertical') {
    return <span className={`inline-block w-[1px] h-3.5 bg-[#202024] mx-1.5 self-center ${className}`} />;
  }
  return <div className={`w-full h-[1px] bg-[#202024] my-2 ${className}`} />;
};
