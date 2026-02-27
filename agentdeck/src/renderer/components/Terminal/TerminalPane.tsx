import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
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

interface TerminalPaneProps {
  sessionId: string
  focused?: boolean | undefined
  projectPath?: string | undefined
  startupCommands?: string[] | undefined
  env?: Record<string, string> | undefined
  agent?: string | undefined
  agentFlags?: string | undefined
}

export function TerminalPane({
  sessionId,
  focused,
  projectPath,
  startupCommands,
  env,
  agent,
  agentFlags,
}: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const projectPathRef = useRef(projectPath)
  const startupRef = useRef(startupCommands)
  const envRef = useRef(env)
  const agentRef = useRef(agent)
  const agentFlagsRef = useRef(agentFlags)
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
      // Ctrl+Shift+V or Ctrl+V → paste
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) window.agentDeck.pty.write(sessionId, text)
          })
          .catch(() => {})
        return false
      }
      return true
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Sync xterm theme when data-theme attribute changes
    const themeObserver = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme ?? ''
      term.options.theme = getXtermTheme(t)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

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
      .then(() => setSessionStatus(sessionId, 'running'))
      .catch((err: unknown) => {
        window.agentDeck.log.send('error', 'terminal', `PTY spawn failed for ${sessionId}`, {
          err: String(err),
        })
        setSessionStatus(sessionId, 'exited')
      })

    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      term.write(data)
    })

    const onDataDisposable = term.onData((data) => {
      window.agentDeck.pty.write(sessionId, data)
    })

    let exitTimeout: ReturnType<typeof setTimeout> | undefined
    const unsubExit = window.agentDeck.pty.onExit(sessionId, () => {
      setSessionStatus(sessionId, 'exited')
      exitTimeout = setTimeout(() => removeSession(sessionId), 800)
    })

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        try {
          if (fitRef.current && containerRef.current) {
            fitRef.current.fit()
            window.agentDeck.pty.resize(sessionId, term.cols, term.rows)
          }
        } catch {
          // terminal may have been disposed
        }
      }, 80)
    })
    ro.observe(containerRef.current)

    return () => {
      themeObserver.disconnect()
      clearTimeout(exitTimeout)
      clearTimeout(resizeTimeout)
      unsubData()
      unsubExit()
      onDataDisposable.dispose()
      ro.disconnect()
      term.dispose()
      const state = useAppStore.getState()
      if (!state.sessions[sessionId]) {
        window.agentDeck.pty.kill(sessionId)
      }
    }
  }, [sessionId, setSessionStatus, removeSession])

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

  return <div ref={containerRef} className="terminal-container" />
}
