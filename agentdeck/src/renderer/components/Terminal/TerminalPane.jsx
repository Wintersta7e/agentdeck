import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import './TerminalPane.css'

export function TerminalPane({ sessionId }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  const setSessionStatus = useAppStore((s) => s.setSessionStatus)

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
        brightWhite: '#f0ede8'
      },
      scrollback: 5000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Spawn PTY with terminal dimensions
    const { cols, rows } = term
    window.agentDeck.pty.spawn(sessionId, cols, rows)
    setSessionStatus(sessionId, 'running')

    // Stream PTY output into terminal
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      term.write(data)
    })

    // Forward keystrokes to PTY
    const onDataDisposable = term.onData((data) => {
      window.agentDeck.pty.write(sessionId, data)
    })

    // Handle PTY exit
    const unsubExit = window.agentDeck.pty.onExit(sessionId, () => {
      setSessionStatus(sessionId, 'exited')
    })

    // Resize PTY when container changes size
    let resizeTimeout
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (fitRef.current && containerRef.current) {
          fit.fit()
          window.agentDeck.pty.resize(sessionId, term.cols, term.rows)
        }
      }, 80)
    })
    ro.observe(containerRef.current)

    return () => {
      clearTimeout(resizeTimeout)
      unsubData()
      unsubExit()
      onDataDisposable.dispose()
      ro.disconnect()
      term.dispose()
      window.agentDeck.pty.kill(sessionId)
    }
  }, [sessionId])

  return <div ref={containerRef} className="terminal-container" />
}
