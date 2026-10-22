# AetherTrace Design System & Product UX Specification

## Mission & Product Positioning

**AetherTrace — The local debugger for AI agents.**  
*"Wireshark for AI Agents: the local-first visual debugger, live interceptor, and time-travel replay engine."*

The core developer loop:
```text
CAPTURE ➔ SEARCH ➔ OBSERVE ➔ INSPECT ➔ INTERCEPT ➔ PAUSE ➔ MODIFY ➔ REPLAY ➔ FORK ➔ DIFF ➔ REPRODUCE ➔ VERIFY
```

The objective of Phase 9 is to consolidate AetherTrace's capabilities into one coherent, professional, high-performance developer experience that looks and feels like serious developer infrastructure.

---

## 1. Visual Direction & Design Philosophy

### 1.1 Core Principles
- **Information Density**: Maximize signal-to-noise ratio; display dense technical data cleanly without overwhelming whitespace.
- **Visual Hierarchy**: Distinguish background, surfaces, elevated panels, and active states through subtle contrast and thin borders rather than heavy drop shadows.
- **Precision & Alignment**: Align every control, label, and timestamp to a predictable grid.
- **Monospace Discipline**: Use monospace typography exclusively for technical entities: identifiers, hashes, timestamps, costs, token counts, HTTP methods, model names, tool calls, and JSON payloads.
- **Keyboard-First Navigation**: Provide immediate keyboard shortcuts (`⌘K`, `T`, `B`, `D`, `C`, `E`, `Space`, `↑/↓`, `J/K`, `Esc`) for rapid interaction without context switching.
- **Trustworthy & Local-First**: Transparent telemetry, zero SaaS telemetry requirements, zero external tracking, offline-first.

### 1.2 Anti-Patterns Explicitly Avoided
- ❌ No purple/blue AI gradient hero cards
- ❌ No glassmorphism, background blurs, or neon glow borders
- ❌ No pill-shaped buttons or oversized border radii (> 8px for standard UI)
- ❌ No decorative animations that do not communicate execution state
- ❌ No artificial AI illustrations or marketing fluff

---

## 2. Design Tokens

### 2.1 Surfaces & Backgrounds
AetherTrace dark theme uses a four-level surface hierarchy:

| Token | Hex Value | Usage |
| :--- | :--- | :--- |
| `canvas` | `#09090b` | Root viewport background |
| `surface` | `#111114` | Primary panel backgrounds (Sidebar, Timeline, Modals) |
| `surfaceElevated` | `#18181c` | Cards, active panels, table headers, drawer containers |
| `surfaceHover` | `#222228` | Hover state for interactive items |
| `surfaceActive` | `#272730` | Active / pressed / selected item background |

### 2.2 Borders
| Token | Hex Value | Usage |
| :--- | :--- | :--- |
| `borderSubtle` | `#202024` | Internal card dividers, table borders, inactive containers |
| `borderDefault` | `#2c2c32` | Standard panel boundaries, input borders |
| `borderStrong` | `#3f3f48` | Focused items, active tabs, modal borders |
| `borderFocus` | `#71717a` | Keyboard focus ring outlines |

### 2.3 Typography & Text
| Token | Font Family | Weight | Size / Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `textPrimary` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | 500 / 600 | 13px / 18px | Headings, primary labels, run titles |
| `textSecondary` | Same | 400 | 12px / 16px | Descriptions, subheadings, secondary notes |
| `textMuted` | Same | 400 | 11px / 14px | Helper text, shortcuts, disabled elements |
| `monoTechnical` | `'JetBrains Mono', Menlo, Monaco, monospace` | 400 / 500 | 11px / 15px | IDs, tokens, costs, durations, code, JSON |

### 2.4 Semantic Event Taxonomy (Colors & Badges)
| Category | Border | Background | Text | Icon | Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LLM` | `#3f3f46` | `#18181b` | `#e4e4e7` | `Bot` | Large language model completions |
| `TOOL` | `#0284c7` | `#082f49` | `#bae6fd` | `Wrench` | Agent tool calls & executions |
| `AGENT` | `#7c3aed` | `#2e1065` | `#ddd6fe` | `Workflow` | Sub-agent / supervisor delegators |
| `HTTP` | `#0d9488` | `#134e4a` | `#99f6e4` | `Globe` | Raw upstream HTTP requests |
| `USER` | `#6366f1` | `#1e1b4b` | `#c7d2fe` | `User` | User prompts & conversation input |
| `SYSTEM` | `#64748b` | `#0f172a` | `#cbd5e1` | `Terminal` | System prompts & configuration |
| `RETRY` | `#d97706` | `#451a03` | `#fde68a` | `RotateCcw` | Retry attempts on rate limit / failure |
| `ERROR` | `#e11d48` | `#4c0519` | `#fecdd3` | `AlertTriangle` | Guardrail blocks, faults, HTTP errors |

### 2.5 Execution Lineage & Replay States
| State | Badge Style | Semantics |
| :--- | :--- | :--- |
| `ORIGINAL` | Neutral Zinc | Root session execution span |
| `CACHED` | Sky Blue Outline | Exact upstream match replayed from cache ($0.00 / 0ms) |
| `MODIFIED` | Amber Accent | Prompt, tool, or model mutated before replay |
| `FORKED` | Violet Accent | Branch created at specific span with new generation |
| `MOCKED` | Emerald Outline | Deterministic mock response returned without upstream call |
| `LIVE` | White / Green Ping | Re-executed against live upstream API with real cost |
| `BLOCKED` | Rose Warning | Intercepted by breakpoint or held for security confirmation |

---

## 3. Component Primitives Architecture

All UI components reside in `apps/flight-deck/src/design-system/`:

```text
apps/flight-deck/src/design-system/
├── tokens.ts              # Semantic token constants (surfaces, borders, text, categories)
├── Button.tsx             # Primary, secondary, ghost, danger, icon variants
├── IconButton.tsx         # Compact 28x28px / 24x24px icon action button
├── Badge.tsx              # Category, status, origin, and neutral badges
├── StatusIndicator.tsx    # Standardized status dot with live animation & label
├── Input.tsx              # Monospace / UI text input with clear focus state
├── Select.tsx             # Compact styled select control
├── Panel.tsx              # Panel, PanelHeader, PanelBody, PanelFooter
├── Modal.tsx              # Accessible dialog with focus management & escape key
├── Divider.tsx            # Subtle 1px separator (horizontal/vertical)
├── DataRow.tsx            # Key-value inspector data row with copy button
├── EmptyState.tsx         # Concise technical empty state
├── LoadingState.tsx       # Compact spinner / skeleton loader
├── Tooltip.tsx            # Keyboard-accessible hover tooltip
└── index.ts               # Barrel export
```

---

## 4. Surfaces & Layout Hierarchy

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: AetherTrace  ● RUNNING (38 tok, $0.0002)  |  ⌘K Search  |  Shield ●  Simulate │
├─────────────────┬───────────────────────────────────────────────┬──────────────────────┤
│ RUN SIDEBAR     │ EXECUTION GRAPH (React Flow)                  │ INSPECTOR DRAWER     │
│                 │                                               │                      │
│ [Search...    ] │    ┌─────────┐       ┌─────────┐              │ TOOL · web_search    │
│                 │    │ Planner │ ────➔ │ Coder   │              │                      │
│ Quick Views:    │    └─────────┘       └─────────┘              │ Status:    completed │
│ • All Runs      │                           │                   │ Latency:   182ms     │
│ • Errors (14)   │                           ▼                   │ Cost:      $0.0002   │
│ • High Cost     │                      ┌─────────┐              │ Tokens:    84        │
│                 │                      │ Review  │              │ ──────────────────── │
│ Runs List:      │                      └─────────┘              │ INPUT: {...}         │
│ ● CheckoutAgent │                                               │ OUTPUT: {...}        │
│   $0.042 · 124t │                                               │ ACTIONS: Replay/Fork │
├─────────────────┴───────────────────────────────────────────────┴──────────────────────┤
│ TIMELINE WATERFALL (Collapsible):  12:41:01 LLM  ───  12:41:02 TOOL  ───  12:41:04 ERR │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Interaction & Motion Rules

1. **Duration**: All interactive transitions must take between `100ms` and `200ms` (`ease-out`).
2. **Reduced Motion**: Respect `prefers-reduced-motion`:
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
3. **Focus States**: High-contrast, 2px outline on keyboard focus (`outline-zinc-500`).
4. **Keyboard Traps**: All modals capture focus on mount and restore previous focus on unmount. Esc key consistently closes top-most layer.
