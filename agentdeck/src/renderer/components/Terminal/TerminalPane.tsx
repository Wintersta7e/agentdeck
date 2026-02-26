import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import './TerminalPane.css'

interface TerminalPaneProps {
  sessionId: string
  projectPath?: string | undefined
  startupCommands?: string[] | undefined
  env?: Record<string, string> | undefined
  agent?: string | undefined
  agentFlags?: string | undefined
}

export function TerminalPane({
  sessionId,
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
      theme: {
        background: '#0d0e0f',
        foreground: '#b8b4ae',
        cursor: '#f5a623',
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
      },
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

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
        console.error('PTY spawn failed:', err)
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
      clearTimeout(exitTimeout)
      clearTimeout(resizeTimeout)
      unsubData()
      unsubExit()
      onDataDisposable.dispose()
      ro.disconnect()
      term.dispose()
      window.agentDeck.pty.kill(sessionId)
    }
  }, [sessionId, setSessionStatus, removeSession])

  return <div ref={containerRef} className="terminal-container" />
}
