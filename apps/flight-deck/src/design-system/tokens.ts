/**
 * AetherTrace Design System Tokens 2.0
 * Strict, centralized tokens for surfaces, borders, text, brand accent, event taxonomy, and execution states.
 *
 * Core Philosophy: Precise. Technical. Local. Fast. Controlled.
 * Foundation: near-black, black, white, neutral greys with AetherTrace Orange as primary brand accent.
 */

export const TOKENS = {
  surfaces: {
    canvas: '#09090b',          // Root background
    surfaceSubtle: '#0c0c0e',    // Subdued secondary surfaces
    surface: '#111114',          // Standard panels, sidebars, base surface
    surfaceElevated: '#18181c',  // Elevated cards, drawer headers, dropdowns
    surfaceHover: '#222228',     // Interactive hover state
    surfaceActive: '#272730'     // Interactive pressed / active state
  },
  borders: {
    subtle: '#202024',           // Hairline internal dividers, grid lines
    default: '#2c2c32',          // Standard panel borders, container boundaries
    strong: '#3f3f48',           // Elevated item outlines, active tab borders
    focus: '#ea580c',            // Keyboard focus ring
    focusNeutral: '#71717a',     // Neutral focus ring fallback
    accent: 'rgba(249, 115, 22, 0.40)' // Brand accent border
  },
  text: {
    primary: '#f4f4f5',          // High-contrast primary reading text
    secondary: '#a1a1aa',        // Descriptive sub-labels, secondary metadata
    muted: '#71717a',            // Keyboard hints, placeholders, tertiary text
    disabled: '#52525b',         // Inactive controls
    accent: '#ea580c',           // Accent brand text
    accentHover: '#f97316'       // Accent hover text
  },
  accent: {
    DEFAULT: '#ea580c',                 // AetherTrace Orange primary (Orange 600)
    hover: '#f97316',                   // Hover state (Orange 500)
    active: '#c2410c',                  // Pressed / active state (Orange 700)
    subtle: 'rgba(234, 88, 12, 0.12)',  // Subtle tinted background wash
    muted: '#9a3412',                   // Muted orange text/border
    border: 'rgba(249, 115, 22, 0.35)', // Restrained orange border
    focus: '#ea580c',                   // Focus ring outline
    contrast: '#ffffff'                 // Text on accent
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
      bg: '#431407',
      border: '#ea580c',
      text: '#ffedd5',
      dot: '#f97316',
      label: 'INTERCEPTED',
      badge: 'border-orange-600/70 bg-orange-950/80 text-orange-200'
    }
  },
  executionStates: {
    running: {
      bg: '#18181b',
      border: '#52525b',
      text: '#f4f4f5',
      dot: '#ffffff',
      label: 'RUNNING',
      badge: 'border-zinc-700 bg-zinc-900 text-zinc-100',
      pulse: true
    },
    completed: {
      bg: '#052e16',
      border: '#16a34a',
      text: '#bbf7d0',
      dot: '#22c55e',
      label: 'COMPLETED',
      badge: 'border-emerald-800 bg-emerald-950 text-emerald-300'
    },
    failed: {
      bg: '#450a0a',
      border: '#dc2626',
      text: '#fecaca',
      dot: '#ef4444',
      label: 'FAILED',
      badge: 'border-rose-800 bg-rose-950 text-rose-300'
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
      bg: '#431407',
      border: '#ea580c',
      text: '#ffedd5',
      dot: '#f97316',
      label: 'INTERCEPTED',
      badge: 'border-orange-600/70 bg-orange-950/80 text-orange-200'
    },
    replay: {
      bg: '#082f49',
      border: '#0284c7',
      text: '#bae6fd',
      dot: '#38bdf8',
      label: 'REPLAY',
      badge: 'border-sky-800 bg-sky-950 text-sky-300'
    },
    cached: {
      bg: '#18181b',
      border: '#3f3f46',
      text: '#a1a1aa',
      dot: '#71717a',
      label: 'CACHED',
      badge: 'border-zinc-700 bg-zinc-900 text-zinc-400'
    },
    forked: {
      bg: '#2e1065',
      border: '#7c3aed',
      text: '#ddd6fe',
      dot: '#a78bfa',
      label: 'FORKED',
      badge: 'border-purple-800 bg-purple-950 text-purple-300'
    },
    mocked: {
      bg: '#134e4a',
      border: '#0d9488',
      text: '#99f6e4',
      dot: '#2dd4bf',
      label: 'MOCKED',
      badge: 'border-teal-800 bg-teal-950 text-teal-300'
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
    0: '0px',
    0.5: '2px',
    1: '4px',
    1.5: '6px',
    2: '8px',
    2.5: '10px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px'
  },
  radii: {
    none: '0px',
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    full: '9999px'
  },
  motion: {
    duration: {
      instant: '0ms',
      fast: '100ms',
      normal: '150ms',
      slow: '250ms'
    },
    easing: {
      default: 'cubic-bezier(0.16, 1, 0.3, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)'
    }
  }
} as const;

export const tokens = TOKENS;

export type EventCategory = 'LLM' | 'TOOL' | 'AGENT' | 'HTTP' | 'USER' | 'SYSTEM' | 'RETRY' | 'ERROR';
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'paused' | 'intercepted' | 'replay' | 'cached' | 'forked' | 'mocked';
export type LineageOrigin = 'original' | 'cached_replay' | 'modified' | 'new_execution' | 'mocked' | 'forked';

export type EventCategoryKey = keyof typeof TOKENS.categories;
export type ExecutionOriginKey = keyof typeof TOKENS.origins;
export type ExecutionStateKey = keyof typeof TOKENS.executionStates;

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
    case 'replay':
      return TOKENS.executionStates.replay;
    case 'cached':
      return TOKENS.executionStates.cached;
    case 'forked':
      return TOKENS.executionStates.forked;
    case 'mocked':
      return TOKENS.executionStates.mocked;
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
