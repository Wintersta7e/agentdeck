import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import { subscribeTheme } from '../../utils/themeObserver'
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
  },
  violet: {
    background: '#0a0a12',
    foreground: '#b0aacc',
    cursor: '#0a0a12',
    cursorAccent: '#0a0a12',
    selectionBackground: 'rgba(167,139,250,0.20)',
  },
  ice: {
    background: '#0c0d10',
    foreground: '#a8afc4',
    cursor: '#0c0d10',
    cursorAccent: '#0c0d10',
    selectionBackground: 'rgba(96,165,250,0.20)',
  },
  parchment: {
    background: '#1a1510',
    foreground: '#f0ede8',
    cursor: '#1a1510',
    cursorAccent: '#1a1510',
    selectionBackground: 'rgba(200,120,0,0.25)',
  },
  fog: {
    background: '#0f1f33',
    foreground: '#e4eaf2',
    cursor: '#0f1f33',
    cursorAccent: '#0f1f33',
    selectionBackground: 'rgba(37,99,235,0.25)',
  },
  lavender: {
    background: '#1a1030',
    foreground: '#ece8f4',
    cursor: '#1a1030',
    cursorAccent: '#1a1030',
    selectionBackground: 'rgba(109,40,217,0.25)',
  },
  stone: {
    background: '#1a1916',
    foreground: '#f2f1ef',
    cursor: '#1a1916',
    cursorAccent: '#1a1916',
    selectionBackground: 'rgba(13,148,136,0.25)',
  },
}

function getXtermTheme(themeId: string): ITheme {
  return { ...BASE_XTERM_THEME, ...(XTERM_THEME_OVERRIDES[themeId] ?? {}) }
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
  fit.fit()
  // Force viewport scroll-area sync after fit — column-only changes can leave
  // the viewport stale, hiding the scrollbar (xterm.js #3504).
  const core = (term as unknown as { _core: { viewport?: { syncScrollArea: () => void } } })._core
  core.viewport?.syncScrollArea()
  if (term.cols > 0 && term.rows > 0) {
    window.agentDeck.pty.resize(sessionId, term.cols, term.rows)
  }
}

interface TerminalPaneProps {
  sessionId: string
  focused?: boolean | undefined
  visible?: boolean | undefined
  projectPath?: string | undefined
  startupCommands?: string[] | undefined
  env?: Record<string, string> | undefined
  agent?: string | undefined
  agentFlags?: string | undefined
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
}: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const projectPathRef = useRef(projectPath)
  const startupRef = useRef(startupCommands)
  const envRef = useRef(env)
  const agentRef = useRef(agent)
  const agentFlagsRef = useRef(agentFlags)
  const visibleRef = useRef(visible)
  const hiddenBufferRef = useRef<string[]>([])
  const setSessionStatus = useAppStore((s) => s.setSessionStatus)
  const removeSession = useAppStore((s) => s.removeSession)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorInactiveStyle: 'none',
      theme: getXtermTheme(document.documentElement.dataset.theme ?? ''),
      scrollback: 5000,
    })

    // Copy/paste: Ctrl+Shift+C/V or Ctrl+C (with selection) / Ctrl+V
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      // Ctrl+Shift+C or Ctrl+C with selection → copy
      if (e.ctrlKey && e.key === 'c' && (e.shiftKey || term.hasSelection())) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
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
        })().catch(() => {})
        return false
      }
      return true
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    // Load WebGL renderer for GPU-accelerated painting (fallback: canvas 2D)
    let webglAddon: WebglAddon | null = null
    try {
      webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose()
        webglAddon = null
      })
      term.loadAddon(webglAddon)
    } catch {
      webglAddon = null
    }

    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Sync xterm theme when data-theme attribute changes (single global observer)
    const unsubTheme = subscribeTheme((t) => {
      term.options.theme = getXtermTheme(t)
    })

    // M12: StrictMode double-spawn protection
    let cancelled = false

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

    // Buffer data received while hidden, flush when visible
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      if (visibleRef.current) {
        const buf = hiddenBufferRef.current
        if (buf.length > 0) {
          term.write(buf.join(''))
          buf.length = 0
        }
        term.write(data)
      } else {
        const buf = hiddenBufferRef.current
        buf.push(data)
        if (buf.length > 1000) {
          buf.splice(0, buf.length - 500)
        }
      }
    })

    const onDataDisposable = term.onData((data) => {
      window.agentDeck.pty.write(sessionId, data)
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
        } catch {
          // terminal may have been disposed
        }
      }, 80)
    })
    ro.observe(containerRef.current)

    // Re-fit terminal when pane resize ends (divider drag / panel resize)
    const handlePaneResizeEnd = (): void => {
      requestAnimationFrame(() => {
        try {
          safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
        } catch {
          // terminal disposed
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
      // Dispose terminal + addons inside try/catch — React 19 runs useEffect
      // cleanup after DOM removal, so xterm's internal refs may already be stale.
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
      // Null out refs so stale async callbacks (rAF, setTimeout) can't use them
      termRef.current = null
      fitRef.current = null
      // Only kill PTY if the session was removed from the store.
      // When a session merely moves between pane slots (e.g. opening a second tab
      // in single-pane layout), its TerminalPane unmounts/remounts but the PTY
      // must stay alive. The pty-manager's spawn() is a no-op for existing sessions.
      const state = useAppStore.getState()
      if (!state.sessions[sessionId]) {
        window.agentDeck.pty.kill(sessionId).catch(() => {})
      }
    }
  }, [sessionId, setSessionStatus, removeSession])

  // Keep visibleRef in sync, flush buffered data, and re-fit on show
  useEffect(() => {
    visibleRef.current = visible
    if (visible && termRef.current) {
      // Flush data that arrived while this pane was hidden
      if (hiddenBufferRef.current.length > 0) {
        termRef.current.write(hiddenBufferRef.current.join(''))
        hiddenBufferRef.current.length = 0
      }
      // Re-fit + viewport sync after the pane is visible again — the viewport
      // goes stale while display:none (offsetParent is null, scroll events are
      // ignored, scroll-area height is not updated).
      requestAnimationFrame(() => {
        try {
          safeFitAndResize(containerRef.current, fitRef.current, termRef.current, sessionId)
        } catch {
          // terminal disposed
        }
      })
    }
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
            } catch {
              // terminal disposed
            }
          })
        }
      },
      { threshold: 0.01 },
    )
    io.observe(container)
    return () => io.disconnect()
  }, [sessionId])

  return <div ref={containerRef} className="terminal-container" />
}
