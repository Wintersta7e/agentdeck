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
  '': {},
  cyan: {
    background: '#080b14',
    foreground: '#a8b5cc',
    cursor: '#080b14',
    cursorAccent: '#080b14',
    selectionBackground: 'rgba(0,212,255,0.20)',
    black: '#080b14',
  },
  violet: {
    background: '#0a0a12',
    foreground: '#b0aacc',
    cursor: '#0a0a12',
    cursorAccent: '#0a0a12',
    selectionBackground: 'rgba(167,139,250,0.20)',
    black: '#0a0a12',
  },
  ice: {
    background: '#0c0d10',
    foreground: '#a8afc4',
    cursor: '#0c0d10',
    cursorAccent: '#0c0d10',
    selectionBackground: 'rgba(96,165,250,0.20)',
    black: '#0c0d10',
  },
  parchment: {
    background: '#1a1510',
    foreground: '#f0ede8',
    cursor: '#1a1510',
    cursorAccent: '#1a1510',
    selectionBackground: 'rgba(200,120,0,0.25)',
    black: '#1a1510',
  },
  fog: {
    background: '#0f1f33',
    foreground: '#e4eaf2',
    cursor: '#0f1f33',
    cursorAccent: '#0f1f33',
    selectionBackground: 'rgba(37,99,235,0.25)',
    black: '#0f1f33',
  },
  lavender: {
    background: '#1a1030',
    foreground: '#ece8f4',
    cursor: '#1a1030',
    cursorAccent: '#1a1030',
    selectionBackground: 'rgba(109,40,217,0.25)',
    black: '#1a1030',
  },
  stone: {
    background: '#1a1916',
    foreground: '#f2f1ef',
    cursor: '#1a1916',
    cursorAccent: '#1a1916',
    selectionBackground: 'rgba(13,148,136,0.25)',
    black: '#1a1916',
  },
  tungsten: {
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

/** Validate scrollback: enforce minimum of 1000, default to 5000 if unset/invalid. */
export function validScrollback(value: number | undefined): number {
  if (value === undefined || value === null) return 5000
  if (!Number.isFinite(value) || value < 1000) return 5000
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
