import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import { subscribeTheme } from '../../utils/themeObserver'
import { TerminalSearchBar } from './TerminalSearchBar'
import './TerminalPane.css'

const BASE_XTERM_THEME: ITheme = {
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
}

const XTERM_THEME_OVERRIDES: Record<string, Partial<ITheme>> = {
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
}

function getXtermTheme(themeId: string): ITheme {
  const base = { ...BASE_XTERM_THEME, ...(XTERM_THEME_OVERRIDES[themeId] ?? {}) }
  // Read accent colour from CSS for selection highlight. DO NOT read --terminal-bg here:
  // that token is rgba (semi-transparent) for CSS glass effects, but xterm.js needs opaque
  // colours — otherwise ANSI-black cells (e.g. Codex TUI) get double-composited and appear
  // darker than the canvas background. Per-theme solid hex values above are the correct source.
  if (typeof document !== 'undefined') {
    const style = getComputedStyle(document.documentElement)
    const accentRgb = style.getPropertyValue('--accent-rgb').trim()
    if (accentRgb) {
      base.selectionBackground = `rgba(${accentRgb}, 0.20)`
    }
  }
  return base
}

// ─── Viewport sync helper ─────────────────────────────────────────────
type XtermCore = { viewport?: { syncScrollArea: () => void } }

function syncViewport(term: Terminal): void {
  const core = (term as unknown as { _core: XtermCore })._core
  core.viewport?.syncScrollArea()
}

/** Shared fit-and-resize logic — guards against zero dimensions and disposed terminals. */
function safeFitAndResize(
  container: HTMLDivElement | null,
  fit: FitAddon | null,
  term: Terminal | null,
  sessionId: string,
): void {
  if (!container || !fit || !term) return
  if (container.offsetWidth === 0 || container.offsetHeight === 0) return
  const prevCols = term.cols
  const prevRows = term.rows
  fit.fit()
  // Only sync viewport and resize PTY when dimensions actually changed.
  // Calling syncScrollArea unconditionally causes visible scroll jumps
  // because it recalculates the viewport position on every invocation,
  // and multiple observers (ResizeObserver, IntersectionObserver, visibility
  // effect) can trigger this function in quick succession.
  if (term.cols !== prevCols || term.rows !== prevRows) {
    // Force viewport scroll-area sync after fit — column-only changes can
    // leave the viewport stale, hiding the scrollbar (xterm.js #3504).
    syncViewport(term)
    if (term.cols > 0 && term.rows > 0) {
      window.agentDeck.pty.resize(sessionId, term.cols, term.rows)
    }
  }
}

/**
 * Write data to terminal while guarding against scroll-position jumps.
 * In long sessions, buffer growth can cause the viewport scrollTop to shift
 * even with overflow-anchor disabled — this detects jumps > 50px when the
 * user has scrolled up and restores their position after the write completes.
 */
function writeWithScrollGuard(term: Terminal, data: string): void {
  const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null
  if (!viewport) {
    term.write(data)
    return
  }
  const prevScrollTop = viewport.scrollTop
  const isAtBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5
  term.write(data, () => {
    // Only restore if user was scrolled up and the position jumped significantly
    if (!isAtBottom && Math.abs(viewport.scrollTop - prevScrollTop) > 50) {
      viewport.scrollTop = prevScrollTop
    }
  })
}

/** Validate scrollback: enforce minimum of 1000, default to 5000 if unset/invalid. */
function validScrollback(value: number | undefined): number {
  if (value === undefined || value === null) return 5000
  if (!Number.isFinite(value) || value < 1000) return 5000
  return value
}

// ─── Terminal cache ───────────────────────────────────────────────────
// When a TerminalPane unmounts because its session moved between pane slots
// (tab switch), the Terminal instance is cached here instead of being disposed.
// The next mount for the same sessionId reclaims it, preserving scrollback
// and full terminal state (cursor position, alternate buffer, colors, etc.).
interface CachedTerminal {
  term: Terminal
  fit: FitAddon
  webgl: WebglAddon | null
  search: SearchAddon | null
  hiddenBuffer: string[]
}
const terminalCache = new Map<string, CachedTerminal>()

// Module-level map for render-time access to SearchAddon instances.
// Using a module-scope Map (like terminalCache) avoids ESLint react-hooks/refs
// (can't read useRef.current in render) and react-hooks/immutability (can't
// mutate useMemo results). The Map is populated in useEffect and read in JSX.
const searchAddonMap = new Map<string, SearchAddon>()

interface TerminalPaneProps {
  sessionId: string
  focused?: boolean | undefined
  visible?: boolean | undefined
  projectPath?: string | undefined
  startupCommands?: string[] | undefined
  env?: Record<string, string> | undefined
  agent?: string | undefined
  agentFlags?: string | undefined
  scrollback?: number | undefined
}

export function TerminalPane({
  sessionId,
  focused,
  visible = true,
  projectPath,
  startupCommands,
  env,
  agent,
  agentFlags,
  scrollback,
}: TerminalPaneProps): React.JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const projectPathRef = useRef(projectPath)
  const startupRef = useRef(startupCommands)
  const envRef = useRef(env)
  const agentRef = useRef(agent)
  const agentFlagsRef = useRef(agentFlags)
  const scrollbackRef = useRef(scrollback)
  const visibleRef = useRef(visible)
  const hiddenBufferRef = useRef<string[]>([])
  const setSessionStatus = useAppStore((s) => s.setSessionStatus)
  const removeSession = useAppStore((s) => s.removeSession)

  useEffect(() => {
    if (!containerRef.current) return

    // Clear any orphaned exit timer from a previous mount cycle
    clearTimeout(exitTimeoutRef.current)
    exitTimeoutRef.current = undefined

    let term: Terminal
    let fit: FitAddon
    let webglAddon: WebglAddon | null = null
    let search: SearchAddon | null = null
    let isReattached = false
    // M12: StrictMode double-spawn protection
    let cancelled = false

    // ── Try to reclaim a cached terminal (tab switch back) ──
    const cached = terminalCache.get(sessionId)
    if (cached) {
      terminalCache.delete(sessionId)
      term = cached.term
      fit = cached.fit
      webglAddon = cached.webgl
      search = cached.search
      if (search) searchAddonMap.set(sessionId, search)
      // Restore any data buffered while this terminal was hidden
      if (cached.hiddenBuffer.length > 0) {
        hiddenBufferRef.current = cached.hiddenBuffer
      }
      isReattached = true
      // Move the xterm DOM tree into the new container
      if (term.element) {
        containerRef.current.appendChild(term.element)
      }
    } else {
      // ── Create fresh terminal ──
      term = new Terminal({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorInactiveStyle: 'none',
        allowProposedApi: true,
        theme: getXtermTheme(document.documentElement.dataset.theme ?? ''),
        scrollback: validScrollback(scrollbackRef.current),
      })

      // Copy/paste: Ctrl+Shift+C/V or Ctrl+C (with selection) / Ctrl+V
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') return true
        // Search: Ctrl+Shift+F
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
          e.preventDefault()
          setSearchOpen((v) => !v)
          return false
        }
        // Ctrl+Shift+C or Ctrl+C with selection → copy
        if (e.ctrlKey && e.key === 'c' && (e.shiftKey || term.hasSelection())) {
          navigator.clipboard.writeText(term.getSelection()).catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'terminal', 'Clipboard copy failed', {
              err: String(err),
            })
          })
          term.clearSelection()
          return false
        }
        // Ctrl+Shift+V or Ctrl+V → paste text or file paths
        if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
          e.preventDefault() // block native paste so onData doesn't fire a second time
          ;(async () => {
            // Try plain text first
            let text = ''
            try {
              text = await navigator.clipboard.readText()
            } catch {
              // Permission denied or no text — fall through to file paths
            }
            if (text) {
              window.agentDeck.pty.write(sessionId, text)
              return
            }
            // No text on clipboard — check for copied files
            const paths = await window.agentDeck.clipboard.readFilePaths()
            if (paths.length > 0) {
              const escaped = paths.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ')
              window.agentDeck.pty.write(sessionId, escaped)
            }
          })().catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'terminal', `Paste failed for ${sessionId}`, {
              err: String(err),
            })
          })
          return false
        }
        return true
      })

      fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)

      // Enable Unicode 11 for proper emoji & CJK character width
      try {
        const unicode11 = new Unicode11Addon()
        term.loadAddon(unicode11)
        term.unicode.activeVersion = '11'
      } catch (err: unknown) {
        window.agentDeck.log.send('warn', 'terminal', `Unicode11 addon failed for ${sessionId}`, {
          err: String(err),
        })
      }

      // Load search addon (cached across tab switches for find-in-terminal)
      try {
        search = new SearchAddon()
        term.loadAddon(search)
        searchAddonMap.set(sessionId, search)
      } catch (err: unknown) {
        search = null
        window.agentDeck.log.send('warn', 'terminal', `Search addon failed for ${sessionId}`, {
          err: String(err),
        })
      }

      // Load WebGL renderer for GPU-accelerated painting (fallback: canvas 2D)
      try {
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon?.dispose()
          webglAddon = null
        })
        term.loadAddon(webglAddon)
      } catch (err: unknown) {
        webglAddon = null
        window.agentDeck.log.send('warn', 'terminal', `WebGL addon failed for ${sessionId}`, {
          err: String(err),
        })
      }

      // Ensure font metrics are correct after JetBrains Mono loads.
      // If the terminal measures cell width before the custom font is available,
      // the renderer uses fallback font metrics, causing characters to overlap
      // once the real font renders. Re-assigning fontFamily forces xterm.js to
      // re-measure cell dimensions and rebuild the WebGL texture atlas cleanly.
      document.fonts.ready
        .then(() => {
          if (cancelled) return
          try {
            const ff = term.options.fontFamily ?? "'JetBrains Mono', monospace"
            term.options.fontFamily = ff
          } catch {
            /* terminal disposed before fonts loaded */
          }
        })
        .catch((err: unknown) => {
          window.agentDeck.log.send('debug', 'terminal', 'Font readiness check failed', {
            err: String(err),
          })
        })
    }

    // Use safeFitAndResize which guards syncViewport behind dimension-change check.
    // For reattached terminals, defer to rAF so the DOM has settled into its new
    // container and dimensions are accurate (not stale from the previous pane slot).
    if (isReattached) {
      requestAnimationFrame(() => {
        safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
      })
    } else {
      safeFitAndResize(containerRef.current, fit, term, sessionId)
    }
    termRef.current = term
    fitRef.current = fit

    // Sync xterm theme when data-theme attribute changes (single global observer)
    const unsubTheme = subscribeTheme((t) => {
      if (!cancelled) term.options.theme = getXtermTheme(t)
    })

    // Only spawn on first mount — reattached terminals already have a live PTY
    if (!isReattached) {
      const { cols, rows } = term
      window.agentDeck.pty
        .spawn(
          sessionId,
          cols,
          rows,
          projectPathRef.current,
          startupRef.current,
          envRef.current,
          agentRef.current,
          agentFlagsRef.current,
        )
        .then(() => {
          if (!cancelled) setSessionStatus(sessionId, 'running')
        })
        .catch((err: unknown) => {
          if (cancelled) return
          window.agentDeck.log.send('error', 'terminal', `PTY spawn failed for ${sessionId}`, {
            err: String(err),
          })
          setSessionStatus(sessionId, 'exited')
        })
    }

    // Buffer data received while hidden, flush when visible
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      if (visibleRef.current) {
        const buf = hiddenBufferRef.current
        if (buf.length > 0) {
          writeWithScrollGuard(term, buf.join(''))
          buf.length = 0
        }
        writeWithScrollGuard(term, data)
      } else {
        const buf = hiddenBufferRef.current
        buf.push(data)
        if (buf.length > 1000) {
          buf.splice(0, buf.length - 500)
        }
      }
    })

    // Filter OSC color query responses from xterm.js before forwarding to PTY.
    // Apps like Codex send OSC 10/11 to detect terminal colors; xterm.js responds
    // correctly, but some apps don't consume the response and display it as text.
    const OSC_RESPONSE_RE = /\x1b\]\d+;[^\x07\x1b]*(?:\x07|\x1b\\)/g
    const onDataDisposable = term.onData((data) => {
      const filtered = data.replace(OSC_RESPONSE_RE, '')
      if (filtered) window.agentDeck.pty.write(sessionId, filtered)
    })

    const unsubExit = window.agentDeck.pty.onExit(sessionId, () => {
      setSessionStatus(sessionId, 'exited')
      exitTimeoutRef.current = setTimeout(() => removeSession(sessionId), 800)
    })

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        try {
          safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
        } catch (err) {
          if (err instanceof Error && !err.message.includes('disposed')) {
            window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
              err: err.message,
            })
          }
        }
      }, 80)
    })
    ro.observe(containerRef.current)

    // Re-fit terminal when pane resize ends (divider drag / panel resize)
    const handlePaneResizeEnd = (): void => {
      requestAnimationFrame(() => {
        try {
          safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
        } catch (err) {
          if (err instanceof Error && !err.message.includes('disposed')) {
            window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
              err: err.message,
            })
          }
        }
      })
    }
    window.addEventListener('agentdeck:pane-resize-end', handlePaneResizeEnd)

    return () => {
      cancelled = true
      unsubTheme()
      clearTimeout(exitTimeoutRef.current)
      clearTimeout(resizeTimeout)
      unsubData()
      unsubExit()
      onDataDisposable.dispose()
      ro.disconnect()
      window.removeEventListener('agentdeck:pane-resize-end', handlePaneResizeEnd)

      // Null out refs so stale async callbacks (rAF, setTimeout) can't use them
      termRef.current = null
      fitRef.current = null

      // Guard against StrictMode double-invoke: only delete if this effect's
      // search instance is still the one in the map (prevents stale removal).
      if (searchAddonMap.get(sessionId) === search) {
        searchAddonMap.delete(sessionId)
      }

      const state = useAppStore.getState()
      if (state.sessions[sessionId]) {
        // Session still alive (tab switch) → cache terminal for reattachment.
        // Detach the xterm DOM tree so React doesn't destroy it with the container.
        if (term.element?.parentElement) {
          term.element.parentElement.removeChild(term.element)
        }
        terminalCache.set(sessionId, {
          term,
          fit,
          webgl: webglAddon,
          search,
          hiddenBuffer: hiddenBufferRef.current,
        })
      } else {
        // Session removed → dispose everything
        try {
          webglAddon?.dispose()
        } catch {
          /* WebGL context already lost */
        }
        try {
          term.dispose()
        } catch {
          /* host element already detached */
        }
        window.agentDeck.pty.kill(sessionId).catch((err: unknown) => {
          window.agentDeck.log.send('debug', 'pty', 'Kill failed', { err: String(err) })
        })
      }
    }
  }, [sessionId, setSessionStatus, removeSession])

  // Clear search decorations when search is dismissed via Ctrl+Shift+F toggle
  // (Escape already clears in the TerminalSearchBar component)
  useEffect(() => {
    if (!searchOpen) {
      searchAddonMap.get(sessionId)?.clearDecorations()
    }
  }, [searchOpen, sessionId])

  // Keep visibleRef in sync, re-fit on show, THEN flush buffered data.
  // IMPORTANT: visibleRef is deferred to true INSIDE the rAF, after fit+flush.
  // This prevents onData from writing new data before the hidden buffer is
  // flushed, which would cause out-of-order terminal output.
  useEffect(() => {
    if (!visible) {
      // Immediately start buffering when hidden
      visibleRef.current = false
      return
    }
    if (!termRef.current) {
      visibleRef.current = true
      return
    }
    // visible=true but defer visibleRef until after fit+flush
    requestAnimationFrame(() => {
      try {
        safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
      } catch (err) {
        if (err instanceof Error && !err.message.includes('disposed')) {
          window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
            err: err.message,
          })
        }
      }
      // Flush data that arrived while this pane was hidden — AFTER fit
      if (termRef.current && hiddenBufferRef.current.length > 0) {
        writeWithScrollGuard(termRef.current, hiddenBufferRef.current.join(''))
        hiddenBufferRef.current.length = 0
      }
      // NOW mark as visible so onData writes directly
      visibleRef.current = true
    })
  }, [visible, sessionId])

  // Sync xterm internal focus with pane focus state
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (focused) {
      term.focus()
    } else {
      term.blur()
    }
  }, [focused])

  // Re-fit terminal when container becomes visible (display:none → flex)
  // ResizeObserver won't fire if dimensions haven't changed.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          requestAnimationFrame(() => {
            try {
              safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
            } catch (err) {
              if (err instanceof Error && !err.message.includes('disposed')) {
                window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
                  err: err.message,
                })
              }
            }
          })
        }
      },
      { threshold: 0.01 },
    )
    io.observe(container)
    return () => io.disconnect()
  }, [sessionId])

  const searchAddon = searchAddonMap.get(sessionId)
  return (
    <div ref={containerRef} className="terminal-container">
      {searchAddon && (
        <TerminalSearchBar
          searchAddon={searchAddon}
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
