/**
 * Pure terminal utility functions extracted from TerminalPane for testability.
 * No React imports, no concrete xterm.js class dependencies — only `ITheme` type.
 */
import type { ITheme } from '@xterm/xterm'
import { getCachedAccentRgb } from './themeObserver'

// ─── Minimal interfaces ──────────────────────────────────────────────

/** Minimal terminal shape for writeWithScrollGuard (buffer-line scroll lock) */
export interface ScrollGuardTerminal {
  write: (data: string, callback?: () => void) => void
  scrollToLine: (line: number) => void
  buffer: {
    active: {
      viewportY: number
      baseY: number
    }
  }
}

/** Minimal terminal shape for safeFitAndResize */
export interface FittableTerminal {
  cols: number
  rows: number
}

/** Minimal fit addon shape */
export interface FittableAddon {
  fit: () => void
}

/** Side-effect callbacks injected by the caller */
export interface FitCallbacks {
  syncViewport: () => void
  resizePty: (cols: number, rows: number) => void
}

// ─── Constants ───────────────────────────────────────────────────────

export const BASE_XTERM_THEME: Readonly<ITheme> = Object.freeze({
  background: '#0d0e0f',
  foreground: '#b8b4ae',
  cursor: '#0d0e0f',
  cursorAccent: '#0d0e0f',
  selectionBackground: 'rgba(245, 166, 35, 0.2)',
  black: '#0d0e0f',
  red: '#e05c5c',
  green: '#4caf7d',
  yellow: '#f5a623',
  blue: '#5b9bd5',
  magenta: '#9b72cf',
  cyan: '#5b9bd5',
  white: '#b8b4ae',
  brightBlack: '#3d3b38',
  brightRed: '#e05c5c',
  brightGreen: '#4caf7d',
  brightYellow: '#f5a623',
  brightBlue: '#5b9bd5',
  brightMagenta: '#9b72cf',
  brightCyan: '#5b9bd5',
  brightWhite: '#f0ede8',
})

export const XTERM_THEME_OVERRIDES: Readonly<Record<string, Partial<ITheme>>> = Object.freeze({
  // Default = Tungsten (sodium amber on warm charcoal)
  '': {
    background: '#100d0b',
    foreground: '#f4ece0',
    cursor: '#100d0b',
    cursorAccent: '#100d0b',
    selectionBackground: 'rgba(245,166,35,0.22)',
    black: '#100d0b',
  },
  phosphor: {
    background: '#05080a',
    foreground: '#d7ffe5',
    cursor: '#05080a',
    cursorAccent: '#05080a',
    selectionBackground: 'rgba(74,255,144,0.22)',
    black: '#05080a',
  },
  dusk: {
    background: '#0d0812',
    foreground: '#ede4f5',
    cursor: '#0d0812',
    cursorAccent: '#0d0812',
    selectionBackground: 'rgba(196,156,255,0.22)',
    black: '#0d0812',
  },
})

/**
 * Filter OSC color query responses (e.g. OSC 10/11) that leak as visible text
 * in some agents (Codex/crossterm). Hoisted to module scope to avoid per-mount
 * regex compilation and to match the ANSI_RE pattern in pty-manager.ts.
 */
export const OSC_RESPONSE_RE = /\x1b\]\d+;[^\x07\x1b]*(?:\x07|\x1b\\)/g

// ─── Functions ───────────────────────────────────────────────────────

/**
 * Build a complete xterm.js ITheme by merging the base theme with per-theme
 * overrides and reading the current CSS accent colour for selection highlight.
 */
export function getXtermTheme(themeId: string): ITheme {
  const base = { ...BASE_XTERM_THEME, ...(XTERM_THEME_OVERRIDES[themeId] ?? {}) }
  // PERF-15: Use cached accent RGB from themeObserver instead of calling getComputedStyle.
  // Falls back to a fresh read on first call (before observer fires).
  if (typeof document !== 'undefined') {
    const accentRgb =
      getCachedAccentRgb() ||
      getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim()
    if (accentRgb) {
      base.selectionBackground = `rgba(${accentRgb}, 0.20)`
    }
  }
  return base
}

/** Validate scrollback: enforce minimum of 1000, default to 25000 if unset/invalid.
 * Default is generous because long agent transcripts (Claude Code multi-turn
 * conversations, codex review runs) easily exceed 5000 rows, and "select all
 * + copy" silently truncates when scrollback overflows.  */
export function validScrollback(value: number | undefined): number {
  if (value === undefined || value === null) return 25000
  if (!Number.isFinite(value) || value < 1000) return 25000
  return value
}

/**
 * Write data to terminal while preserving scroll position when user is scrolled up.
 * Uses xterm's buffer-line API (viewportY/baseY) + scrollToLine() instead of DOM
 * scrollTop heuristics — this is reliable even during rapid agent output bursts
 * because it works with xterm's internal scroll model, not against it.
 *
 * Pair with rAF-based write batching in the caller so that N chunks/frame
 * coalesce into a single write+restore cycle.
 */
export function writeWithScrollGuard(term: ScrollGuardTerminal, data: string): void {
  const buf = term.buffer.active
  const isScrolledUp = buf.viewportY < buf.baseY
  const lockedLine = buf.viewportY

  term.write(data, () => {
    if (isScrolledUp) {
      term.scrollToLine(lockedLine)
    }
  })
}

/** Shared fit-and-resize logic — guards against zero dimensions and disposed terminals. */
export function safeFitAndResize(
  container: { offsetWidth: number; offsetHeight: number } | null,
  fit: FittableAddon | null,
  term: FittableTerminal | null,
  callbacks: FitCallbacks,
): void {
  if (!container || !fit || !term) return
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return
  const prevCols = term.cols
  const prevRows = term.rows
  fit.fit()
  // Only sync viewport and resize PTY when dimensions actually changed.
  // Calling syncScrollArea unconditionally causes visible scroll jumps
  // because it recalculates the viewport position on every invocation,
  // and multiple observers (ResizeObserver, visibility effect, pane-resize-end)
  // can trigger this function in quick succession.
  if (term.cols !== prevCols || term.rows !== prevRows) {
    // Force viewport scroll-area sync after fit — column-only changes can
    // leave the viewport stale, hiding the scrollbar (xterm.js #3504).
    callbacks.syncViewport()
    if (term.cols > 0 && term.rows > 0) {
      callbacks.resizePty(term.cols, term.rows)
    }
  }
}

// ─── Logical-line selection ──────────────────────────────────────────

/** Minimal buffer-line shape we read for logical-selection extraction. */
export interface SelectionBufferLine {
  isWrapped: boolean
  translateToString: (trimRight: boolean, startColumn?: number, endColumn?: number) => string
}

/** Minimal terminal shape for getLogicalSelection — read-only buffer view. */
export interface SelectionTerminal {
  getSelectionPosition: () =>
    | { start: { x: number; y: number }; end: { x: number; y: number } }
    | undefined
  buffer: { active: { getLine: (y: number) => SelectionBufferLine | undefined } }
}

/** A tab span: starting col (inclusive) and how many cells it fills. */
export interface TabSpan {
  col: number
  width: number
}

/** Callback returning the tab spans recorded on the given xterm-buffer-y row. */
export type RowTabSpansProvider = (yBuffer: number) => readonly TabSpan[]

/**
 * Replace cell ranges that originated from a `\t` byte with literal `\t` in
 * the copied text. Only tab spans whose entire range is inside `[startCol,
 * endCol)` are substituted — spans that cross either boundary stay as
 * spaces (visual fidelity for partial-row selections).
 */
function substituteTabs(
  cellText: string,
  startCol: number,
  endCol: number,
  spans: readonly TabSpan[],
): string {
  if (spans.length === 0) return cellText
  const fullSpans = spans.filter((s) => s.col >= startCol && s.col + s.width <= endCol)
  if (fullSpans.length === 0) return cellText
  let out = ''
  let c = 0
  while (c < cellText.length) {
    const absCol = startCol + c
    const span = fullSpans.find((s) => s.col === absCol)
    if (span) {
      out += '\t'
      c += span.width
    } else {
      out += cellText[c] ?? ''
      c += 1
    }
  }
  return out
}

/**
 * Like xterm's `term.getSelection()`, but reconstructs *logical* lines from
 * the cell buffer:
 *
 *   - rows whose successor reports `isWrapped === true` are joined into a
 *     single line (undoing soft-wraps that xterm inserted to fit width)
 *   - trailing whitespace on each logical line is stripped (xterm leaves
 *     space-padded cells for unset positions; copying them produces
 *     spurious right-margin spaces in the clipboard)
 *
 * With `tabSpansForRow`, cell ranges that originated from a `\t` byte are
 * substituted back as `\t` in the output. The provider returns the tab
 * spans recorded by `TerminalGridMirror` for the given xterm row. Spans
 * that don't fit entirely inside the per-row selection (partial-row
 * selections that cut a tab in half) are not substituted — those cells
 * stay as spaces, matching what the user sees.
 */
export function getLogicalSelection(
  term: SelectionTerminal,
  tabSpansForRow?: RowTabSpansProvider,
): string {
  const sel = term.getSelectionPosition()
  if (!sel) return ''
  const buffer = term.buffer.active
  const startY = sel.start.y
  const endY = sel.end.y
  const startX = sel.start.x
  const endX = sel.end.x

  const out: string[] = []
  let logical = ''

  for (let y = startY; y <= endY; y++) {
    const line = buffer.getLine(y)
    if (!line) continue

    const colStart = y === startY ? startX : 0
    const colEnd = y === endY ? endX : undefined
    let cellText = line.translateToString(false, colStart, colEnd)

    if (tabSpansForRow) {
      const effectiveEndCol = colEnd ?? colStart + cellText.length
      cellText = substituteTabs(cellText, colStart, effectiveEndCol, tabSpansForRow(y))
    }

    logical += cellText

    // If the *next* row is a soft-wrap continuation of this one and is part
    // of the selection, keep accumulating; otherwise this logical line ends.
    const next = y < endY ? buffer.getLine(y + 1) : undefined
    if (!next?.isWrapped) {
      out.push(logical.replace(/[ \t]+$/, ''))
      logical = ''
    }
  }

  return out.join('\n')
}
