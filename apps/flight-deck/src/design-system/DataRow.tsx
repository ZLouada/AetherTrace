'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface DataRowProps {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
  copyable?: boolean;
  className?: string;
}

export const DataRow: React.FC<DataRowProps> = ({
  label,
  value,
  copyValue,
  copyable = false,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = copyValue || (typeof value === 'string' ? value : String(value));
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#18181c] transition-colors duration-fast text-xs font-mono group ${className}`}>
      <span className="text-zinc-400 shrink-0 select-none mr-2">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 justify-end">
        <span className="text-zinc-200 truncate select-text">{value}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-zinc-400 hover:text-white transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
};
