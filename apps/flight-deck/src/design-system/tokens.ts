/**
 * AetherTrace Design System Tokens
 * Strict, centralized tokens for surfaces, borders, text, event taxonomy, and execution states.
 */

export const TOKENS = {
  surfaces: {
    canvas: '#09090b',
    surface: '#111114',
    surfaceElevated: '#18181c',
    surfaceHover: '#222228',
    surfaceActive: '#272730'
  },
  borders: {
    subtle: '#202024',
    default: '#2c2c32',
    strong: '#3f3f48',
    focus: '#71717a'
  },
  text: {
    primary: '#f4f4f5',
    secondary: '#a1a1aa',
    muted: '#71717a',
    disabled: '#52525b'
  },
  intent: {
    success: {
      bg: '#052e16',
      border: '#16a34a',
      text: '#bbf7d0',
      dot: '#22c55e',
      label: 'COMPLETED',
      badge: 'border-emerald-800 bg-emerald-950 text-emerald-300'
    },
    warning: {
      bg: '#451a03',
      border: '#d97706',
      text: '#fde68a',
      dot: '#f59e0b',
      label: 'WARNING',
      badge: 'border-amber-800 bg-amber-950 text-amber-300'
    },
    error: {
      bg: '#450a0a',
      border: '#dc2626',
      text: '#fecaca',
      dot: '#ef4444',
      label: 'FAILED',
      badge: 'border-rose-800 bg-rose-950 text-rose-300'
    },
    info: {
      bg: '#082f49',
      border: '#0284c7',
      text: '#bae6fd',
      dot: '#38bdf8',
      label: 'INFO',
      badge: 'border-sky-800 bg-sky-950 text-sky-300'
    },
    running: {
      bg: '#18181b',
      border: '#52525b',
      text: '#f4f4f5',
      dot: '#ffffff',
      label: 'RUNNING',
      badge: 'border-zinc-700 bg-zinc-900 text-zinc-100',
      pulse: true
    },
    paused: {
      bg: '#451a03',
      border: '#b45309',
      text: '#fef3c7',
      dot: '#fbbf24',
      label: 'PAUSED',
      badge: 'border-amber-700 bg-amber-950 text-amber-200'
    },
    intercepted: {
      bg: '#4c0519',
      border: '#be123c',
      text: '#fecdd3',
      dot: '#f43f5e',
      label: 'INTERCEPTED',
      badge: 'border-rose-700 bg-rose-950 text-rose-200'
    }
  },
  categories: {
    LLM: {
      bg: '#18181b',
      border: '#3f3f46',
      text: '#e4e4e7',
      accent: '#71717a',
      label: 'LLM'
    },
    TOOL: {
      bg: '#082f49',
      border: '#0284c7',
      text: '#bae6fd',
      accent: '#38bdf8',
      label: 'TOOL'
    },
    AGENT: {
      bg: '#2e1065',
      border: '#7c3aed',
      text: '#ddd6fe',
      accent: '#a78bfa',
      label: 'AGENT'
    },
    HTTP: {
      bg: '#134e4a',
      border: '#0d9488',
      text: '#99f6e4',
      accent: '#2dd4bf',
      label: 'HTTP'
    },
    USER: {
      bg: '#1e1b4b',
      border: '#6366f1',
      text: '#c7d2fe',
      accent: '#818cf8',
      label: 'USER'
    },
    SYSTEM: {
      bg: '#0f172a',
      border: '#64748b',
      text: '#cbd5e1',
      accent: '#94a3b8',
      label: 'SYSTEM'
    },
    RETRY: {
      bg: '#451a03',
      border: '#d97706',
      text: '#fde68a',
      accent: '#f59e0b',
      label: 'RETRY'
    },
    ERROR: {
      bg: '#4c0519',
      border: '#e11d48',
      text: '#fecdd3',
      accent: '#f43f5e',
      label: 'ERROR'
    }
  },
  origins: {
    original: {
      bg: '#18181b',
      border: '#27272a',
      text: '#a1a1aa',
      label: 'ORIGINAL'
    },
    cached_replay: {
      bg: '#082f49',
      border: '#0369a1',
      text: '#7dd3fc',
      label: 'CACHED'
    },
    modified: {
      bg: '#451a03',
      border: '#b45309',
      text: '#fcd34d',
      label: 'MUTATED'
    },
    new_execution: {
      bg: '#064e3b',
      border: '#059669',
      text: '#6ee7b7',
      label: 'LIVE'
    },
    mocked: {
      bg: '#134e4a',
      border: '#0f766e',
      text: '#5eead4',
      label: 'MOCKED'
    },
    forked: {
      bg: '#2e1065',
      border: '#6d28d9',
      text: '#c4b5fd',
      label: 'FORKED'
    }
  },
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px'
  },
  radii: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    full: '9999px'
  }
} as const;

export const tokens = TOKENS;

export type EventCategory = 'LLM' | 'TOOL' | 'AGENT' | 'HTTP' | 'USER' | 'SYSTEM' | 'RETRY' | 'ERROR';
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'paused' | 'intercepted';
export type LineageOrigin = 'original' | 'cached_replay' | 'modified' | 'new_execution' | 'mocked' | 'forked';

export type EventCategoryKey = keyof typeof TOKENS.categories;
export type ExecutionOriginKey = keyof typeof TOKENS.origins;

export interface CategoryStyle {
  bg: string;
  border: string;
  text: string;
  accent: string;
  label: string;
}

export function getCategoryStyle(type: string): CategoryStyle {
  const norm = (type || '').toUpperCase();
  if (norm === 'TOOL_CALL' || norm === 'TOOL') return TOKENS.categories.TOOL;
  if (norm === 'LLM_CALL' || norm === 'LLM') return TOKENS.categories.LLM;
  if (norm === 'HTTP_CALL' || norm === 'HTTP') return TOKENS.categories.HTTP;
  if (norm === 'RETRY') return TOKENS.categories.RETRY;
  if (norm === 'GUARDRAIL_BLOCK' || norm === 'ERROR') return TOKENS.categories.ERROR;
  if (norm === 'USER_INPUT' || norm === 'USER') return TOKENS.categories.USER;
  if (norm === 'AGENT' || norm === 'AGENT_STATE' || norm === 'AGENT_DISPATCH') return TOKENS.categories.AGENT;
  if (norm === 'SYSTEM' || norm === 'SYSTEM_EVENT') return TOKENS.categories.SYSTEM;
  return TOKENS.categories.SYSTEM;
}

export interface StatusStyle {
  bg: string;
  border: string;
  text: string;
  dot: string;
  label: string;
  badge: string;
  pulse?: boolean;
}

export function getStatusStyle(status: string): StatusStyle {
  const norm = (status || '').toLowerCase();
  switch (norm) {
    case 'running':
      return TOKENS.intent.running;
    case 'paused':
      return TOKENS.intent.paused;
    case 'intercepted':
      return TOKENS.intent.intercepted;
    case 'completed':
    case 'passed':
      return TOKENS.intent.success;
    case 'failed':
    case 'breaker_tripped':
    case 'error':
      return TOKENS.intent.error;
    default:
      return {
        bg: '#18181b',
        border: '#27272a',
        text: '#a1a1aa',
        dot: '#71717a',
        label: 'Unknown',
        badge: 'border-zinc-800 bg-zinc-900 text-zinc-400',
        pulse: false
      };
  }
}

export interface OriginStyle {
  bg: string;
  border: string;
  text: string;
  label: string;
}

export function getOriginStyle(origin: string): OriginStyle {
  const norm = (origin || '').toLowerCase() as LineageOrigin;
  if (norm in TOKENS.origins) {
    return TOKENS.origins[norm];
  }
  return {
    bg: '#18181b',
    border: '#27272a',
    text: '#a1a1aa',
    label: 'ORIGINAL'
  };
}
