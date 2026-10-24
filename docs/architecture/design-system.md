# AetherTrace Design System 2.0 Specification
**The Visual and Interaction Foundation for Wireshark for AI Agents**

---

## Mission & Product Positioning

**AetherTrace — The local debugger for AI agents.**  
*"Wireshark for AI Agents: the local-first visual debugger, live interceptor, and time-travel replay engine."*

The core developer loop:
```text
CAPTURE ➔ SEARCH ➔ OBSERVE ➔ INSPECT ➔ INTERCEPT ➔ PAUSE ➔ MODIFY ➔ REPLAY ➔ FORK ➔ DIFF ➔ EVALUATE ➔ OPTIMIZE
```

AetherTrace v0.3 introduces **Design System 2.0**: a refined, technical visual and interaction foundation inspired by the density, hierarchy, and keyboard-first precision of tools like Linear, Raycast, and developer devtools, while maintaining AetherTrace's distinct technical identity.

---

## AetherTrace Design Principles

1. **The interface is an instrument, not a dashboard.**  
   Every control exists to observe, measure, intercept, or modify agent execution with millisecond and micro-dollar precision. No decorative vanity metrics or idle charts.
2. **Information hierarchy beats decoration.**  
   Structural clarity is achieved through surface contrast, thin borders, and monospace data alignment rather than heavy shadows, blurred glass, or floating cards.
3. **Complexity is revealed progressively.**  
   High-density overviews present critical signals at a glance (status dot, latency, tokens, cost), revealing deep payloads, causal graphs, and assertion trees on demand.
4. **Keyboard interaction is first-class.**  
   Every primary inspection, navigation, and interception action is accessible via keyboard shortcuts and the Command Palette (`⌘K`). Focus states are sharp, unmistakable, and accessible.
5. **Orange is meaningful, not decorative.**  
   AetherTrace Orange (`#ea580c` / `#f97316`) is the brand's primary accent. It is reserved for active navigation, selection rings, primary execution triggers, live held breakpoints, and key interactive moments. Most of the interface remains neutral.
6. **Borders and spacing create structure.**  
   Hairline 1px borders (`#202024`, `#2c2c32`) and disciplined spacing establish workspace boundaries without boxing every element into redundant cards.
7. **Motion communicates state.**  
   Transitions are fast (100–150ms) and functional (panel toggling, selection focus, breakpoint pulses). No gratuitous parallax, floating, or bouncing animations. Respects `prefers-reduced-motion`.
8. **Existing functionality must remain stable.**  
   Visual evolution must never break time-travel replay, breakpoint interception, mutation lineage, or deterministic evaluation assertions.

---

## 1. Design Philosophy

AetherTrace is an engineering workstation for observing and controlling nondeterministic LLM agent loops. Its visual language communicates:

> **Precise. Technical. Local. Fast. Controlled.**

The visual foundation is anchored in near-black, black, white, and neutral zinc greys. Colored accents are strictly semantic, providing clear visual differentiation between LLM completions, tool calls, supervisor dispatches, HTTP network requests, and retries.

---

## 2. Color Tokens

All colors are centralized in `apps/flight-deck/src/design-system/tokens.ts` and extended via `apps/flight-deck/tailwind.config.ts`.

### 2.1 Surfaces & Canvas
| Token | Hex Value | Semantic Usage |
|:---|:---|:---|
| `canvas` | `#09090b` | Root viewport canvas, graph canvas background |
| `surfaceSubtle` | `#0c0c0e` | Recessed containers, gutter backgrounds |
| `surface` | `#111114` | Primary base panels (Run Sidebar, DAG chrome, Modals) |
| `surfaceElevated` | `#18181c` | Active cards, drawer headers, dropdown menus |
| `surfaceHover` | `#222228` | Interactive hover state for rows and list items |
| `surfaceActive` | `#272730` | Pressed, active, or selected item background |

### 2.2 Borders
| Token | Value | Semantic Usage |
|:---|:---|:---|
| `borderSubtle` | `#202024` | Hairline dividers, subtle gridlines, inactive item borders |
| `borderDefault` | `#2c2c32` | Standard panel boundaries, card borders, inputs |
| `borderStrong` | `#3f3f48` | Elevated boundaries, active tab borders |
| `borderFocus` | `#ea580c` | Keyboard focus ring outline (AetherTrace Orange) |
| `borderAccent` | `rgba(249, 115, 22, 0.40)` | Brand accent border for selected and held items |

### 2.3 Brand Accent Scale (AetherTrace Orange)
| Token | Value | Semantic Usage |
|:---|:---|:---|
| `accent.DEFAULT` | `#ea580c` | Primary brand accent (Orange 600) — primary buttons, active tabs |
| `accent.hover` | `#f97316` | Hover state (Orange 500) — interactive button hover |
| `accent.active` | `#c2410c` | Pressed state (Orange 700) — click state |
| `accent.subtle` | `rgba(234, 88, 12, 0.12)` | Tinted wash for selected rows and badges |
| `accent.muted` | `#9a3412` | Muted accent text and secondary borders |
| `accent.border` | `rgba(249, 115, 22, 0.35)` | Restrained accent border |
| `accent.contrast` | `#ffffff` | High-contrast text on accent backgrounds |

### 2.4 Text Hierarchy
| Token | Hex Value | Semantic Usage |
|:---|:---|:---|
| `text.primary` | `#f4f4f5` | High-contrast headings, active labels, primary values |
| `text.secondary` | `#a1a1aa` | Subheadings, descriptive text, table cells |
| `text.muted` | `#71717a` | Helper text, keyboard hints, disabled elements |
| `text.disabled` | `#52525b` | Inactive controls, placeholder text |
| `text.accent` | `#ea580c` | Accent highlighted text |

---

## 3. Typography

AetherTrace enforces a **two-tier typography contract**:

1. **Interface Chrome (`font-sans`)**:
   - Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
   - Applied to: Navigation bar, tabs, button labels, modal headers, section titles, documentation.
   - Provides clean optical rhythm, high legibility, and modern application chrome.
2. **Technical Data & Code (`font-mono`)**:
   - Font stack: `'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace`
   - Applied to: Span IDs, run hashes, timestamps, token counts, USD costs, JSON payloads, tool arguments, HTTP status codes, code blocks.
   - Preserves character alignment and rapid visual scanning of numeric telemetry.

---

## 4. Spacing Scale

Spacing uses predictable 4px base units with valid micro-spacing utilities:

| Token | Pixels | Tailwind Utility | Semantic Usage |
|:---|:---|:---|:---|
| `0` | 0px | `p-0`, `m-0` | Reset |
| `0.5` | 2px | `py-0.5`, `px-0.5` | Compact badge vertical padding, tight borders |
| `1` | 4px | `p-1`, `gap-1` | Micro gap between icon and label |
| `1.5` | 6px | `px-1.5`, `py-1.5` | Badge horizontal padding, compact buttons |
| `2` | 8px | `p-2`, `gap-2` | Standard internal control padding |
| `2.5` | 10px | `px-2.5`, `py-2.5` | Button padding, drawer item padding |
| `3` | 12px | `p-3`, `gap-3` | Standard card padding, header bar height |
| `4` | 16px | `p-4`, `gap-4` | Modal padding, large panel spacing |
| `6` | 24px | `p-6`, `gap-6` | Studio workspace spacing |
| `8` | 32px | `p-8`, `gap-8` | Section separation |

> **Rule**: Invalid utilities such as `py-0.2` are strictly prohibited. Micro-spacing must use valid tokens (`py-0.5`).

---

## 5. Border System

Borders provide clean spatial separation without the heavy cognitive overhead of drop shadows:

- **Subtle (`border-[#202024]`)**: Table row separators, internal split lines, inactive tabs.
- **Default (`border-[#2c2c32]`)**: Container boundaries, sidebar edges, card outlines.
- **Strong (`border-[#3f3f48]`)**: Selected nodes, elevated popovers.
- **Accent (`border-accent/40` or `ring-accent`)**: Active selection, held breakpoints, focused inputs.

---

## 6. Radius Scale

Restrained corner radii maintain a disciplined, professional developer aesthetic:

| Token | Pixels | Usage |
|:---|:---|:---|
| `none` | 0px | Full-bleed workspace panels, dividers |
| `xs` | 2px | Badges, micro keyboard keys (`<kbd>`) |
| `sm` | 4px | Buttons, inputs, selects, dropdown items |
| `md` | 6px | Span nodes, panel cards, popovers |
| `lg` | 8px | Modals, major workspace containers |
| `full` | 9999px | Status indicator dots, circular avatars |

---

## 7. Shadows

Shadows are used sparingly for spatial elevation, preferring surface luminance contrast:

- **Default UI**: `shadow-none` (rely on `border-[#2c2c32]`).
- **Elevated Menus / Dropdowns**: `shadow-md` (`0 4px 6px -1px rgba(0, 0, 0, 0.5)`).
- **Modals / Command Palette**: `shadow-2xl` (`0 25px 50px -12px rgba(0, 0, 0, 0.8)`).
- **Prohibited**: Soft colorful drop shadows, neon glow halos, or blurred card elevations.

---

## 8. Motion System

Motion is purposeful, subtle, and fast.

| Token | Duration | Usage |
|:---|:---|:---|
| `instant` | 0ms | View changes, tab switches |
| `fast` | 100ms | Button hovers, badge transitions, toggle states |
| `normal` | 150ms | Dropdown appearance, drawer sliding |
| `slow` | 250ms | Modal entry/exit dialogs |

- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (snappy ease-out).
- **Accessibility**: Automatically suppressed when `prefers-reduced-motion: reduce` is enabled.

---

## 9. Focus States

Keyboard accessibility is a first-class citizen in AetherTrace:

```css
:focus-visible {
  outline: 2px solid #ea580c !important;
  outline-offset: 1px !important;
}
```

Every interactive primitive (`Button`, `IconButton`, `Input`, `Select`, `DataRow` copy target) includes explicit `:focus-visible` styling, ensuring immediate visual feedback during keyboard navigation without intrusive mouse outlines.

---

## 10. Semantic Event Taxonomy

Event categories provide restrained, semantic color coding:

| Category | Border | Background | Text | Icon | Semantic Meaning |
|:---|:---|:---|:---|:---|:---|
| `LLM` | `#3f3f46` | `#18181b` | `#e4e4e7` | `Bot` | Large Language Model generation |
| `TOOL` | `#0284c7` | `#082f49` | `#bae6fd` | `Wrench` | External tool / function call execution |
| `AGENT` | `#7c3aed` | `#2e1065` | `#ddd6fe` | `Workflow` | Sub-agent delegator / dispatch boundary |
| `HTTP` | `#0d9488` | `#134e4a` | `#99f6e4` | `Globe` | Raw upstream HTTP network request |
| `USER` | `#6366f1` | `#1e1b4b` | `#c7d2fe` | `User` | User prompt / conversation input |
| `SYSTEM` | `#64748b` | `#0f172a` | `#cbd5e1` | `Terminal` | System configuration / runtime event |
| `RETRY` | `#d97706` | `#451a03` | `#fde68a` | `RotateCcw` | Automatic retry on rate limit or fault |
| `ERROR` | `#e11d48` | `#4c0519` | `#fecdd3` | `AlertTriangle` | Guardrail block, failure, or exception |

---

## 11. Execution & Lineage States

Execution states track the exact operational condition of runs and spans:

| State | Accent Color | Visual Representation | Semantics |
|:---|:---|:---|:---|
| `RUNNING` | `#ffffff` | Pulsing white dot | Live span executing against upstream engine |
| `COMPLETED` | `#22c55e` | Emerald Check | Execution completed with status 200 / valid result |
| `FAILED` | `#ef4444` | Red Alert | Execution threw exception or guardrail block |
| `PAUSED` | `#fbbf24` | Amber Pause icon | Execution manually paused by operator |
| `INTERCEPTED` | `#ea580c` | Flashing Orange dot | Held at breakpoint awaiting operator decision |
| `REPLAY` | `#38bdf8` | Sky RotateCcw | Exact replay re-executed from trace cache |
| `CACHED` | `#71717a` | Slate Zap icon | Deterministic cache hit ($0.00 / 0ms latency) |
| `FORKED` | `#a78bfa` | Purple GitFork | Mutated variant execution on a new lineage branch |
| `MOCKED` | `#2dd4bf` | Teal Sliders | Mocked response injected without upstream LLM call |

---

## 12. Component Hierarchy & Primitives

All primitives reside in `apps/flight-deck/src/design-system/`:

```text
apps/flight-deck/src/design-system/
├── tokens.ts              # Semantic token constants (surfaces, borders, text, categories)
├── Button.tsx             # Primary, accent, secondary, tertiary/ghost, destructive
├── IconButton.tsx         # Compact 20px/28px/32px icon action button with focus ring
├── Badge.tsx              # Category, status, origin, neutral, and accent badges
├── StatusIndicator.tsx    # Accessible status indicator for all 9 execution states
├── Input.tsx              # Form input with tokenized focus ring and font modes
├── Select.tsx             # Form select with tokenized focus ring
├── Panel.tsx              # Structural panel with Header, Body, and Footer
├── Modal.tsx              # Clean dialog modal with solid bg-black/80 scrim (no blur)
├── Divider.tsx            # Hairline 1px horizontal / vertical divider
├── DataRow.tsx            # Key-value inspector row with copy feedback and focus
├── EmptyState.tsx         # Context-aware empty state with action and size options
├── LoadingState.tsx       # Minimalist loading state with spinner and detail text
├── ErrorState.tsx         # Structured error primitive (recoverable, failed, trace, system)
├── Tooltip.tsx            # Fast, restrained tooltip with keyboard focus support
└── index.ts               # Clean public barrel export
```

### 12.1 Button Hierarchy
- **Primary (`variant="primary"`)**: High-contrast white button (`bg-white text-black font-semibold`). Used for prominent single actions.
- **Accent (`variant="accent"`)**: AetherTrace Orange button (`bg-accent text-white border border-accent-border`). Used for main execution triggers ("Run Experiment", "Resolve Breakpoint").
- **Secondary (`variant="secondary"`)**: Dark surface button (`bg-[#18181c] text-zinc-200 border border-[#2c2c32]`). Used for standard workspace actions.
- **Tertiary / Ghost (`variant="ghost"` | `variant="tertiary"`)**: Transparent button with subtle hover. Used for toolbars and auxiliary actions.
- **Destructive (`variant="destructive"` | `variant="danger"`)**: Red warning button (`bg-rose-950/70 text-rose-200 border border-rose-800`). Used for aborting and deleting.

---

## 13. Accessibility Rules

1. **Contrast Compliance**:
   - Primary text (`#f4f4f5`) on `#111114` achieves **15.8:1** (exceeds WCAG AAA).
   - Secondary text (`#a1a1aa`) on `#111114` achieves **5.8:1** (exceeds WCAG AA 4.5:1).
   - Micro-text must not fall below `#a1a1aa` for critical labels.
2. **Keyboard Navigation**:
   - Focus rings must be visible via `:focus-visible`.
   - Modals must support Escape dismissal and trap focus.
   - All interactive icons must provide descriptive `aria-label` and `title` attributes.
3. **Screen Readers**:
   - Status indicators expose text labels or ARIA descriptions.
   - Error states specify their error classification in DOM text.

---

## 14. Usage Examples

### Primary & Accent Buttons
```tsx
import { Button } from '@/design-system';
import { Play, RotateCcw } from 'lucide-react';

// Brand Action
<Button variant="accent" icon={<Play className="w-3.5 h-3.5" />}>
  Replay Variant
</Button>

// Standard Workspace Action
<Button variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />}>
  Reset Filters
</Button>
```

### Status Indicator for Breakpoint
```tsx
import { StatusIndicator } from '@/design-system';

<StatusIndicator status="intercepted" label="HELD AT BREAKPOINT" size="sm" />
```

### Error State
```tsx
import { ErrorState } from '@/design-system';

<ErrorState
  category="recoverable"
  title="Upstream Rate Limit Exceeded"
  message="Provider returned HTTP 429 Too Many Requests."
  detail="Retry-After: 3.5s • model: gpt-4o"
  onRetry={() => handleRetry()}
/>
```

---

## 15. Anti-Patterns Explicitly Avoided

- ❌ **No Glassmorphism**: Never use `backdrop-blur` or translucent glass cards. Use solid dark surfaces (`bg-[#111114]`, `bg-black/80`).
- ❌ **No Invalid Micro-Classes**: Never write `py-0.2` or non-standard Tailwind fractions. Use tokenized `py-0.5`.
- ❌ **No Orange Clutter**: Do not make every card or border orange. Orange is reserved for active selection, focus, held state, and brand triggers.
- ❌ **No Negative-Margin Layout Hacks**: Never use `-m-6` to break out of modal padding. Use clean modular components with appropriate padding props.
- ❌ **No Universal Monospace**: Do not apply `font-mono` to standard UI labels, buttons, or dialog text. Monospace is strictly reserved for code, telemetry, hashes, timestamps, and numbers.

---

## 16. Step 04: Run Sidebar & Timeline 2.0 Specification

### 16.1 Run Sidebar 2.0 Architecture
The Run Sidebar serves as the high-density execution navigator for AetherTrace:
- **Density & Sizing**: Row height standardized at ~46px, eliminating card wrapping, large paddings, and card drop-shadows.
- **Visual Hierarchy**:
  1. Semantic status dot (`StatusIndicator`) matching execution state (`running`, `completed`, `failed`, `paused`, `breaker_tripped`).
  2. Human-readable run name truncated with `font-medium text-xs text-zinc-200`.
  3. Relative timestamp (`Just now`, `2m ago`, `1h ago`, date).
  4. Truncated Run ID + Lineage Badges (`Replay`, `Fork`, `Mutated`) + Error indicator (`Fail`).
  5. Monospace metrics: Token count, micro-dollar spend (`$0.0240`), duration (`600ms`), and span count.
- **Chronological Sections**: Automatic grouping into `Today`, `Yesterday`, and `Earlier` with sticky date headers.
- **Search & Filtering**:
  - Filter chips: `All`, `Live`, `Done`, `Errors` (instant failure triage), `Forks`, `Replays`.
  - Semantic query parser: supports `status:error`, `cost:>0.01`, `tokens:>100`, `branch:<name>`, and text matching.
  - Shortcut activation: `/` or `⌘F` focuses the search bar; `Escape` clears and blurs.
- **Keyboard Navigation**:
  - `ArrowDown` / `ArrowUp`: cycles runs in the filtered list.
  - `Enter`: selects the focused run.
  - Global `Alt+[` / `Alt+]` (or `Alt+↑` / `Alt+↓`): steps through runs from anywhere in the app.

### 16.2 Timeline 2.0 Architecture
The Execution Timeline is a millisecond-aware waterfall instrument for understanding temporal latency and agent concurrency:
- **Dynamic Millisecond Axis Ruler**:
  - Automatically calculates optimal tick intervals (e.g., 50ms, 100ms, 250ms, 500ms, 1s) based on total run duration.
  - Renders major tick labels and faint vertical grid lines across all tracks.
- **Zoom & Navigation**:
  - Multi-tier zoom: `100%`, `150%`, `200%`, `300%`, `500%`, `1000%`.
  - Zoom controls: `-`, zoom percentage indicator, `+`, and instant `Fit to Execution (100%)`.
  - Min-width clamping: micro-spans (1ms–10ms) are clamped to minimum 8px width so they never collapse into hairline invisible pixels.
- **Dual Density Modes**:
  - `Compact Mode` (24px track rows): maximum vertical density for large traces.
  - `Detailed Mode` (32px track rows): displays inline cost, latency, and agent labels inside track bars.
- **Two-Way Synchronization**:
  - **DAG ➔ Timeline**: Hovering over any node in the React Flow canvas immediately highlights the corresponding span row and bar in the Timeline (`hoveredSpanId`).
  - **Timeline ➔ DAG**: Hovering over any span row in the Timeline highlights the corresponding node in the DAG canvas.
  - **Selection Synchronization**: Clicking any span bar or row in Timeline selects the span in DAG, centers it, and immediately opens and populates the Event Inspector.
  - **Multi-Selection**: Supports `Shift+Click` and `Cmd/Ctrl+Click` across timeline spans, preserving aggregate telemetry in the Inspector.
  - **Auto-Scroll**: Selecting a span automatically scrolls its row into view smoothly.
- **Synchronized Playhead Cursor Guide**:
  - Mouse movement over the waterfall canvas projects a vertical guide line across all tracks.
  - Displays a floating timestamp badge (`+Xms`) at the cursor head.
- **Execution Taxonomies & Markers**:
  - Color-coded by semantic category (`LLM`, `TOOL`, `HTTP`, `RETRY`, `GUARDRAIL/ERROR`, `USER`).
  - Distinguishes execution origins: cached replay (sky blue), modified replay (amber), new execution (emerald).
  - Explicit badges for Critical Path (`Zap` icon), Pinned spans (`Pin` icon), Errors (`AlertTriangle` icon), and Retries (`RotateCcw` icon).

### 16.3 DAG & SpanNode 2.0 Architecture
The execution graph is the primary visual centerpiece answering *"What happened in the agent execution flow?"*:
- **Dual-Density Node Architecture (Finding 7.1)**:
  - **Compact Mode** (`220px × 48px`): High-density node for scanning complex multi-agent traces (20+ spans) without canvas explosion. Displays status dot, category icon, agent name, model/operation, latency, and cost pill.
  - **Detailed Mode** (`320px × auto`): Rich card view featuring header chrome, snippet preview, token usage breakdown, critical path highlight, and lineage badges.
  - **Density Switcher**: Canvas overlay control provides 1-click toggling between `Compact` and `Detailed` density, with automatic defaulting to compact for large graphs (>20 spans).
- **Layout Stability & Decoupled State (Finding 7.2)**:
  - **Structural vs Visual Separation**: Dagre coordinate calculation `(x, y)` runs strictly when graph topology changes (spans, filter, agent group collapse/expand, orientation `TB`/`LR`, or density).
  - **Zero-Lag Interactive Updates**: Span selection (`selectedSpanId`), hover (`hoveredSpanId`), pinning (`pinnedSpanIds`), multi-selection (`selectedSpanIds`), and critical path focus update node visual data in-place without re-running Dagre layout and without viewport jumping or unwanted `fitView` triggers.
- **SpanNode Visual Anatomy**:
  - **Header Bar**: Status dot (emerald = success, rose = error, amber = retry/breakpoint, sky = cache hit), Category badge (`LLM`, `TOOL`, `HTTP`, `RETRY`, `AGENT`, `USER`, `ERROR`), agent name, model badge, pin marker.
  - **Body Preview**: Syntax-formatted prompt snippet, tool invocation `tool_name(args)`, or error reason.
  - **Token Usage Strip**: Formatted as `prompt in -> completion out = total` with `(est)` heuristic indicator. Omitted for tool and system spans to eliminate misleading zero values.
  - **Footer Strip**: Latency (with `0ms` for cache hits), Cost USD, Lineage Badges (`Replay`, `Fork`, `Cached`, `Modified`, `Held`, `Chaos`), Critical Path (`⚡ Critical`).
- **AgentGroupNode 2.0**:
  - Container-level grouping for collapsed multi-agent hierarchies.
  - Aggregated wall time, total cost, breakdown chips (LLM, Tools, Retries, Errors).
  - Clean `ChevronRight` / `ChevronDown` "Expand Spans" action button.
- **Visual State Rings**:
  - **Selected**: `border-[#ea580c] ring-2 ring-[#ea580c] bg-[#18181c] shadow-[0_0_18px_rgba(234,88,12,0.25)]`.
  - **Hovered**: `border-[#ea580c] ring-1 ring-[#ea580c]/60 bg-[#16161a]`.
  - **Multi-Selected**: `border-indigo-400 ring-2 ring-indigo-500/50 bg-[#16161f]`.
  - **Pinned**: Amber pin badge / corner indicator with `(P)`.
  - **Intercepted**: Pulsing amber border with `Held` badge.

### 16.4 Inspector 2.0 Unified Debugging Document Architecture
The Inspector is the deep diagnostic instrument answering *"Why did it happen, and what exactly occurred inside this span?"*:
- **Unified Document Architecture (Finding 8.1 & 8.2)**:
  - Consolidates 4 previously fragmented tabs (`Overview`, `Intelligence`, `Fork IDE`, `JSON`) into a single, cohesive vertical debugging document.
  - Quick-jump navigation pills (`Overview`, `Payload`, `Intelligence`, `Fork IDE`, `JSON`) allow instant section jumping or filtering without hiding essential diagnostics behind tab barriers.
- **Sticky Header**:
  - Semantic status dot, category badge with icon, agent name, target model/tool.
  - Monospace span ID snippet with 1-click clipboard copy.
  - Pin button (`P`) with filled amber icon when pinned.
  - Inspector close button (`Esc`).
- **Multi-Selection Aggregated Card**:
  - Automatically activates when multiple spans are selected (`selectedSpans.length > 1`).
  - Displays combined cost, total latency, aggregated token count, and error count.
  - Interactive chip list of all selected spans for rapid single-span jumping.
  - One-click "Clear Selection" action.
- **Live Breakpoint Interception Card**:
  - Activates when execution is paused by a breakpoint rule or human operator hold.
  - Live payload JSON mutation editor with syntax styling.
  - Synthetic mock response text input ($0.00 cost simulation).
  - Action triggers: `Forward` (resume execution), `Mock ($0)` (inject synthetic response), `Abort` (terminate invocation).
- **Primary Metric Strip**:
  - High-density 4-tile grid:
    1. **Duration**: e.g., `124ms` or `0ms (cache)`.
    2. **Cost USD**: formatted with micro-dollar precision (`$0.000420`).
    3. **Tokens**: prompt/completion split, omitting meaningless zeroes for non-LLM events.
    4. **Origin / Status**: `Original`, `Replay`, `Fork`, `Cached`, `Modified`, `Failed`.
- **Execution Metadata & Lineage**:
  - Telemetry Source badge (OpenTelemetry OTLP, LangChain Adapter, Python SDK, AetherTrace SDK).
  - Parent Span link with clickable `[ ]` navigation jump (`[` shortcut).
  - Git commit SHA and branch provenance with dirty-tree warning badges.
- **Event-Specific Payload Sections**:
  - **LLM Spans**: Formatted prompt messages with role pills (`system`, `user`, `assistant`), message index, copy buttons, and completion output with syntax styling.
  - **Tool Calls**: Tool name badge, input arguments (syntax block with copy), and output result (syntax block with copy).
  - **HTTP Calls**: Method badge, URL, headers, and request/response payloads.
  - **Errors & Guardrails**: Distinct red alert card with failure explanation, guardrail rule breached, and stack trace.
  - **Retries**: Attempt number, retry reason, backoff delay.
- **Child Spans Navigation**:
  - Interactive table of direct child spans (`]`).
  - Shows status dot, agent name, span type, latency, and cost.
  - Clicking any child immediately updates DAG, Timeline, and Inspector to inspect that child span.
- **Causal Intelligence & Bottlenecks**:
  - Critical Path status: duration and percentage of run wall time.
  - Upstream Root Causes: "Caused by" relationships with click-to-focus source span.
  - Downstream Impact: "Triggered downstream" relationships with click-to-focus target span.
  - Active tool chains, retry chains, and parallel execution groups.
- **Time-Travel Fork Studio**:
  - Target model selector (`gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet`, `claude-3-5-haiku`).
  - Agent name override.
  - Structured prompt messages JSON editor with validation error reporting.
  - Primary "Fork & Execute From Here" trigger running cached replay up to fork point.
- **Raw JSON Inspector**:
  - Collapsible full JSON payload of the span with 1-click "Copy JSON" button.

### 16.5 Studio & Command UX 2.0 Specification
Step 06 unifies the secondary workspaces and command-driven workflows into a cohesive workstation experience:

#### 16.5.1 Unified Studio Header Contract
All secondary workspaces (`Diff Arena`, `Experiment Studio`, `Evaluation Studio`) adhere to a standardized Studio Header contract to eliminate modal fragmentation and preserve orientation:
- **Left Region — Navigation & Identity**:
  - **Back Button**: Prominent `← Back to Debugger` button (`px-2.5 py-1 text-xs font-mono text-zinc-300 hover:text-white bg-[#18181c] hover:bg-[#222228] border border-[#27272a] rounded`) with subtle `(Esc)` hint.
  - **Separator**: Vertical `h-4 w-px bg-[#27272a]`.
  - **Studio Icon & Title**: Distinct icon (`GitCompare`, `FlaskConical`, `Target`) paired with uppercase bold tracking title (`DIFF ARENA`, `EXPERIMENT STUDIO`, `EVALUATION STUDIO`).
  - **Studio Badge**: Semantic intent pill (`COMPARISON ENGINE`, `MUTATION LAB`, `ASSERTION RUNNER`) in muted zinc badge.
- **Center Region — Run & Execution Context**:
  - Displays high-contrast context pills identifying the active runs under analysis:
    - *Diff Arena*: `Baseline Run [ID]` ➔ `Candidate Run [ID]`.
    - *Experiment Studio*: Active experiment name + variant count pill.
    - *Evaluation Studio*: Target run name + evaluation pass/fail rate badge (`X% Passed`).
- **Right Region — Quick Actions & Dismissal**:
  - Secondary workspace-specific actions (e.g., `New Experiment`, `Run Assertions`, `Export Diff`).
  - Global `ESC TO EXIT` hint pill (`text-[10px] font-mono text-zinc-300 border border-[#27272a] px-2 py-0.5 rounded`).

#### 16.5.2 Diff Arena 2.0 Architecture
- **Dense Technical Scorecard**:
  - Visual delta comparison grid displaying Baseline vs Candidate metrics:
    - **Wall Time**: e.g., `1,240ms` vs `820ms` (`-33.8%` emerald badge).
    - **Total Cost**: e.g., `$0.0420` vs `$0.0180` (`-57.1%` emerald badge).
    - **Token Count**: prompt/completion breakdown with delta badge.
    - **Span Count & Error Count**: structural divergence summary.
- **Side-by-Side Step Accordion**:
  - Paired step rows showing aligned spans across execution paths.
  - Semantic difference flags (`MATCH`, `CHANGED`, `ADDED`, `REMOVED`).
  - **Inspect in Debugger Action**: Direct trigger on each step item (`onSelectSpan(step.spanId, runId)`) that transitions the developer directly to the Debugger workspace with the relevant span focused in both DAG and Inspector.

#### 16.5.3 Experiment Studio 2.0 Architecture
- **Active Experiment Selector & Mutation Lab**:
  - Selector banner switching between saved experiment configurations.
  - Mutation controls for prompting changes, model swaps, and temperature adjustments.
- **Variant Cards & Comparison Matrix**:
  - High-density matrix displaying metrics across all experiment variants (Baseline, Mutation A, Mutation B).
  - Explicit action buttons:
    - `Inspect in Debugger`: Jump to variant run and target span in the core debugger.
    - `Diff`: Load the variant into Diff Arena against baseline with 1 click.
- **Replay History**:
  - Chronological list of past replay iterations with latency, cost, and direct inspection links.

#### 16.5.4 Evaluation Studio 2.0 Architecture
- **Assertion DSL Runner**:
  - Monospace assertion editor supporting declarative assertions (`assert latency < 2000ms`, `assert cost < 0.05`, `assert tool.error_rate == 0`).
  - Real-time compilation and evaluation results.
- **Assertions Checklist & Culprit Span Inspection**:
  - Passed and Failed assertions listed with explicit failure reasons.
  - Culprit span links with interactive `[Inspect Span]` buttons routing directly to the offending span in the Debugger.
- **Causal Root Cause Triage**:
  - Algorithmic failure attribution highlighting likely root causes.
  - Direct navigation jump to the culprit span for instantaneous triage.

#### 16.5.5 Command Palette 2.0 Architecture & Intent Hierarchy
- **Intent-Driven Grouping**:
  - Replaces flat list with clearly demarcated intent sections:
    1. **Navigation**: Quick workspace jumps (`Debugger` [1], `Diff Arena` [2], `Experiments` [3], `Evaluations` [4]).
    2. **Debugger & Canvas**: Layout and visualization controls (`Auto-Layout Graph` [G], `Toggle Breakpoint Hold` [B], `Simulate Chaos Failure` [C], `Fit View`, `Toggle Density`).
    3. **Span Actions**: Context-sensitive operations on the currently selected span (`Pin Span` [P], `Focus Critical Path`, `Fork & Replay` [T], `Deselect Span` [Esc]).
    4. **Execution & Tools**: Global execution triggers (`Export Trace JSON`, `Copy Run ID`, `Filter Errors`).
    5. **Runs**: Quick run switcher items.
    6. **Saved Searches**: Filter presets for rapid filtering.
- **Visual Styling**:
  - Sticky category headers with thin border dividers (`border-b border-[#27272a] bg-[#141418] text-zinc-300 font-mono text-[10px] uppercase`).
  - Keyboard shortcut badges rendered in monospace zinc keycaps (`px-1.5 py-0.5 rounded bg-[#27272a] text-zinc-300 font-mono text-[10px]`).
  - Dedicated search input with `Search commands, spans, runs... (Esc to close)` placeholder.

#### 16.5.6 Cross-Workspace Navigation & Causal Span Routing
- **Elimination of Modal vs Embedded Duplication**:
  - Unified routing so that TopBar, AppSidebar, Command Palette, and Studio Headers all manipulate `activeView` (`debugger` | `diff` | `experiments` | `evaluations`).
  - Zero modal layering or duplicate state instances.
- **Causal Span Router (`handleSelectSpanFromStudio`)**:
  - Signature: `(spanId: string, runId?: string) => void`.
  - Behavior:
    1. If `runId` is provided and differs from `selectedRunId`, loads the target run and its spans asynchronously.
    2. Sets `selectedSpanId = spanId` and `isInspectorOpen = true`.
    3. Switches `activeView = 'debugger'`.
    4. Automatically scrolls and highlights the span in DAG and Timeline.

---

### 16.6 Debugger Interaction Model 2.0

Step 07 transforms AetherTrace into a coherent, keyboard-first, reactive debugging workstation where inspecting, pausing, modifying, replaying, and evaluating agent executions follows an unambiguous state machine.

#### 16.6.1 Selection State Matrix & Visual Ring Precedence
To prevent visual ambiguity when multiple visual states collide, AetherTrace establishes strict ring and border precedence across all nodes and timeline spans:

| State | Border / Ring Style | Badge Indicator | Precedence Level |
|---|---|---|---|
| **Breakpoint Intercepted** | `border-amber-500/80 ring-1 ring-amber-500/60` (animate-pulse) | `PAUSED` (amber) | 1 (Highest) |
| **Active Selected** | `border-accent-orange ring-1 ring-accent-orange shadow-sm` | Contextual selection | 2 |
| **Multi-Selected** | `border-indigo-500 ring-1 ring-indigo-500/70 bg-indigo-500/5` | Multi-select badge | 3 |
| **Pinned Reference** | `border-amber-500/60 ring-1 ring-amber-500/30` | `PINNED` (amber pin icon) | 4 |
| **Critical Path** | `border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]` | `⚡ Critical` | 5 |
| **Hover State** | `border-zinc-600 bg-zinc-800/40` | None | 6 (Lowest) |

- **Canvas Deselection**: Clicking empty canvas background (`onPaneClick`) immediately clears selections (`selectedSpan = null`, `selectedAgent = null`, `selectedSpanIds = empty`).
- **Dagre Layout Decoupling**: Visual interactions (hover, selection, pinning, breakpoint interception) only mutate node data in-place without triggering Dagre coordinate recalculations, ensuring 0ms layout latency.

#### 16.6.2 Breakpoint HUD 2.0 & Live Interception Flow
When an agent execution is held at a breakpoint or waiting for human review (`pendingBreakpoints` active or `response_payload` containing `awaiting_human: true`):
- **Breakpoint HUD Banner**:
  - Renders prominently at the top of the canvas (`role="alert"`).
  - Displays pause reason, intercepted agent name, target model, and an instant `[Inspect Span]` link.
  - Houses 3 direct action controls with keyboard shortcuts:
    - `Continue` (`Space`) — Resumes upstream execution.
    - `Mock Response` (`M`) — Injects synthetic `$0.00` JSON response.
    - `Abort` (`Esc`) — Immediately halts execution and frees proxy hold.
- **DAG Node Visualization**: The intercepted node exhibits a pulsing amber glow, `PAUSED` pill badge, and `Intercepted by Breakpoint` description.

#### 16.6.3 ReplayContextBanner & ActionFeedbackBanner Lineage Flow
Navigating between parent runs, replayed traces, and forked variants is continuous and explicit:
- **`ReplayContextBanner`**:
  - Automatically rendered above the DAG whenever `parent_run_id` or `run_type === 'replay' | 'fork'` is active.
  - Displays `REPLAY EXECUTION` or `FORK EXECUTION` pill badge.
  - Provides a clickable `Source: <parent_run_id>` link button to jump directly to the origin execution.
  - Identifies branch point span (`branched at span <span_id>`).
  - Houses a direct `[Compare with Source]` button that launches the Diff Arena with base and target runs pre-populated.
- **`ActionFeedbackBanner`**:
  - Floating toast notification anchored in the bottom-right viewport.
  - Triggered on fork creation, replay execution, or clipboard copying.
  - Provides inline action buttons (`[Open Run]`, `[Compare with Source]`) and dismiss controls.

#### 16.6.4 Timeline Paused Playhead & RAF-Throttled Scrubbing
- **Paused Playhead Marker**:
  - When execution is paused at a span, the Timeline ruler renders an amber `PAUSED` pill badge.
  - A vertical amber guideline extends down across all tracks at the exact pause offset.
- **`requestAnimationFrame` Throttling**:
  - Mouse movement across tracks is throttled via `requestAnimationFrame` to eliminate DOM re-render overhead.

#### 16.6.5 Workstation Keyboard Registry & 4-Tier Escape Hierarchy
The workstation enforces a predictable, conflict-free shortcut hierarchy:

```text
[Global]
  ⌘K / Ctrl+K     Open Command Palette
  ⌘B / Ctrl+B     Toggle Run Sidebar collapse
  Alt+[ / Alt+↑   Navigate to previous run
  Alt+] / Alt+↓   Navigate to next run
  1 - 4           Switch Workspaces (1: Debugger, 2: Diff, 3: Experiments, 4: Evaluations)
  T               Toggle Execution Timeline
  I               Toggle Inspector drawer
  B               Toggle Breakpoints configuration
  D               Open Diff Arena
  C               Open Chaos Engineering modal
  X               Open Experiment Studio
  E               Toggle Evaluation Studio

[Breakpoint HUD]
  Space           Continue intercepted execution / Resume paused run
  M               Inject mock response and continue
  Esc             Abort intercepted execution

[Span Navigation]
  J / ↓           Select next span
  K / ↑           Select previous span
  [               Navigate to parent span
  ]               Navigate to child span
  P               Toggle Pin on selected span
  F               Cycle filter (all -> pinned -> agents -> llms -> tools -> retries -> errors)

[4-Tier Escape Hierarchy]
  Tier 1: Close active modal / Command Palette / dialog (if open).
  Tier 2: Return to Debugger workspace (if activeView !== 'debugger').
  Tier 3: Close Inspector and clear span selection (if selectedSpan != null).
  Tier 4: Neutral workstation idle state.
```

---

### 16.7 Workstation Cohesion, Accessibility & Final UX Hardening (Step 08)

Step 08 finalizes the AetherTrace v0.3.0 UI/UX modernization by enforcing accessibility compliance (WCAG 2.1 AA), keyboard focus containment, visual token hygiene, and performance benchmark stability across all workspaces.

#### 16.7.1 Focus Trapping & Restoration Contracts
To adhere to WAI-ARIA modal dialogue practices:
- **Focus Restoration**:
  - `Modal.tsx` and `CommandPalette.tsx` capture `previousActiveElement = document.activeElement` on open.
  - On modal closure or unmount, focus is automatically restored to the stored active element, preventing focus loss to the document root.
- **Tab Focus Trapping**:
  - `Modal.tsx` intercepts `Tab` and `Shift+Tab` keyboard events.
  - When reaching the last focusable element in the modal, pressing `Tab` cycles focus to the first focusable control.
  - Pressing `Shift+Tab` on the first element wraps focus to the last element in the modal.
  - Unrendered or invisible controls (`offsetParent === null`) are excluded from the cycle.

#### 16.7.2 Semantic HTML & ARIA Attributes Matrix
All primary workstation components now carry explicit ARIA semantics:
- **`DagCanvas`**: `role="region"`, `aria-label="Execution Graph Canvas"`.
- **`Timeline`**: `role="region"`, `aria-label="Execution Timeline"`. Span rows carry `role="button"`, `tabIndex={0}`, `aria-selected`, and descriptive `aria-label`.
- **`SpanNode` & `AgentGroupNode`**: `role="treeitem"`, `aria-selected`, `tabIndex={0}`, with dynamic screen-reader labels describing agent name, type, execution status, latency, and cost.
- **`CommandPalette`**: `role="dialog"`, `aria-modal="true"`, `aria-label="Command Palette"`, with search input as `role="combobox"` pointing to results list as `role="listbox"`, and items as `role="option"`.
- **`RunSidebar`**: `aria-label="Runs Navigator"`, run entries carry `role="button"`, `tabIndex={0}`, `aria-selected`.

#### 16.7.3 Contrast Governance (WCAG 2.1 AA)
- Prior to Step 08, several secondary metadata and labels used `text-zinc-500` (#71717a) on dark backgrounds (#09090b / #111114), resulting in a contrast ratio of ~3.2:1 (failing the 4.5:1 AA requirement).
- All secondary labels, form instructions, metadata counts, and shortcut markers have been systematically elevated to `text-zinc-400` (#a1a1aa, 5.8:1 contrast ratio) or `text-zinc-300` (#d4d4d8, 8.9:1 contrast ratio).
- Essential state indicators (error badges, critical path badges, execution origin indicators) use high-contrast foreground tokens paired with dark semantic tinted borders and backgrounds.

#### 16.7.4 Elimination of Invalid Classes & Layout Breakout Hacks
- **0 Invalid Classes**: The invalid fraction `py-0.2` has been completely eliminated from the codebase; standard valid token `py-0.5` is enforced.
- **0 Negative Margins**: Negative margin breakout hacks (`-m-6`, `-m-4`) used previously in modal views have been completely removed in favor of `embedded={true}` (`flex-1 h-full`) layout composition.
- **0 Glassmorphism**: Complete absence of `backdrop-blur` or semi-transparent frosted styling. Solid, clean technical backgrounds (`#09090b`, `#111114`, `#16161a`) ensure maximum information density and instant rendering performance.

#### 16.7.5 Performance Benchmarks & Dagre Decoupling
Performance scaling benchmarks verified via automated test script (`scripts/step08-ux-hardening-test.ts`):
- **100 Spans**: Compact layout: ~157ms | Detailed layout: ~167ms (100 nodes, 99 edges).
- **1,000 Spans**: Compact layout: ~825ms | Detailed layout: ~860ms (1,000 nodes, 999 edges).
- **10,000 Spans**: Compact layout: ~23.4s | Detailed layout: ~24.2s (10,000 nodes, 9,999 edges).
- **Decoupled Visual Mutations**: Hovering, selecting, multi-selecting, or pinning nodes triggers zero Dagre recalculation and 0ms layout latency.



