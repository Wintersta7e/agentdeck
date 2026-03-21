import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import { subscribeTheme } from '../../utils/themeObserver'
import {
  getXtermTheme,
  validScrollback,
  writeWithScrollGuard,
  safeFitAndResize,
  OSC_RESPONSE_RE,
  type FitCallbacks,
} from '../../utils/terminal-utils'
import { TerminalSearchBar } from './TerminalSearchBar'
import './TerminalPane.css'

// ─── Viewport sync helper ─────────────────────────────────────────────
type XtermCore = { viewport?: { syncScrollArea: () => void } }

function syncViewport(term: Terminal): void {
  const core = (term as unknown as { _core: XtermCore })._core
  core.viewport?.syncScrollArea()
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
  const viewportRef = useRef<HTMLElement | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const projectPathRef = useRef(projectPath)
  const startupRef = useRef(startupCommands)
  const envRef = useRef(env)
  const agentRef = useRef(agent)
  const agentFlagsRef = useRef(agentFlags)
  const scrollbackRef = useRef(scrollback)
  const visibleRef = useRef(visible)
  const fitPendingRef = useRef(false)
  const fitRafRef = useRef(0)
  const hiddenBufferRef = useRef<string[]>([])
  const fitCallbacksRef = useRef<FitCallbacks | null>(null)
  const setSessionStatus = useAppStore((s) => s.setSessionStatus)
  const removeSession = useAppStore((s) => s.removeSession)

  /**
   * Schedule a single coalesced fit in the next animation frame.
   * Multiple callers (mount, pane-resize-end, ResizeObserver) within the
   * same frame collapse into one fit call, preventing redundant
   * syncViewport invocations that cause scroll jumping.
   */
  const scheduleFit = useCallback(() => {
    if (fitPendingRef.current) return
    fitPendingRef.current = true
    fitRafRef.current = requestAnimationFrame(() => {
      fitPendingRef.current = false
      if (!fitCallbacksRef.current) return
      try {
        safeFitAndResize(
          containerRef.current,
          fitRef.current,
          termRef.current,
          fitCallbacksRef.current,
        )
      } catch (err) {
        if (err instanceof Error && !err.message.includes('disposed')) {
          window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
            err: err.message,
          })
        }
      }
    })
  }, [])

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

    // Prevent onData from writing before the visibility effect's rAF completes
    // fit+flush. Without this, visibleRef starts as true (from useRef init) and
    // PTY data arriving before the rAF could render out-of-order with cached data.
    visibleRef.current = false

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
      viewportRef.current =
        (term.element?.querySelector('.xterm-viewport') as HTMLElement | null) ?? null
      // Rebuild WebGL texture atlas for the new pane dimensions.
      // Cached terminals keep stale cell metrics from their previous pane slot.
      // Re-assigning fontFamily forces xterm.js to re-measure and rebuild.
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
              // Single-quote escaping (POSIX safe) — prevents injection via
              // filenames containing ", $, `, \, or ! on shared filesystems.
              const escaped = paths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ')
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
      viewportRef.current =
        (term.element?.querySelector('.xterm-viewport') as HTMLElement | null) ?? null

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

    // Build fit callbacks that close over this effect's `term` and `sessionId`
    const fitCallbacks: FitCallbacks = {
      syncViewport: () => syncViewport(term),
      resizePty: (cols, rows) => window.agentDeck.pty.resize(sessionId, cols, rows),
    }
    fitCallbacksRef.current = fitCallbacks

    // Use safeFitAndResize which guards syncViewport behind dimension-change check.
    // For reattached terminals, defer to rAF so the DOM has settled into its new
    // container and dimensions are accurate (not stale from the previous pane slot).
    if (isReattached) {
      scheduleFit()
    } else {
      safeFitAndResize(containerRef.current, fit, term, fitCallbacks)
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

    // Buffer data received while hidden, write directly when visible.
    // The visibility effect (fit→flush→visibleRef=true) handles the transition,
    // so there is no gap where onData could write before the hidden buffer is flushed.
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      if (visibleRef.current) {
        writeWithScrollGuard(term, data, viewportRef.current)
      } else {
        const buf = hiddenBufferRef.current
        buf.push(data)
        // Cap buffer to prevent unbounded memory growth.
        // 5000 chunks ≈ 5000 setImmediate batches ≈ several minutes of output.
        // Trim to 4000 to avoid re-trimming on every chunk at the boundary.
        if (buf.length > 5000) {
          buf.splice(0, buf.length - 4000)
        }
      }
    })

    // Filter OSC color query responses from xterm.js before forwarding to PTY.
    // Apps like Codex send OSC 10/11 to detect terminal colors; xterm.js responds
    // correctly, but some apps don't consume the response and display it as text.
    const onDataDisposable = term.onData((data) => {
      const filtered = data.replace(OSC_RESPONSE_RE, '')
      if (filtered) window.agentDeck.pty.write(sessionId, filtered)
    })

    const unsubExit = window.agentDeck.pty.onExit(sessionId, () => {
      setSessionStatus(sessionId, 'exited')
      exitTimeoutRef.current = setTimeout(() => {
        removeSession(sessionId)
        // Evict from cache if the PTY exited while the terminal was hidden
        // (unmounted and cached for reattachment). Without this, the cached
        // Terminal + WebGL context leak indefinitely.
        const stale = terminalCache.get(sessionId)
        if (stale) {
          terminalCache.delete(sessionId)
          try {
            stale.webgl?.dispose()
          } catch {
            /* WebGL context already lost */
          }
          try {
            stale.term.dispose()
          } catch {
            /* host element already detached */
          }
        }
      }, 800)
    })

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (!fitCallbacksRef.current) return
        try {
          safeFitAndResize(
            containerRef.current,
            fitRef.current,
            termRef.current,
            fitCallbacksRef.current,
          )
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
      scheduleFit()
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

      // Cancel any pending scheduleFit rAF and reset the coalescing flag so the
      // next mount cycle's scheduleFit is not blocked by a stale true value.
      cancelAnimationFrame(fitRafRef.current)
      fitPendingRef.current = false

      // Null out refs so stale async callbacks (rAF, setTimeout) can't use them
      termRef.current = null
      fitRef.current = null
      viewportRef.current = null
      fitCallbacksRef.current = null

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
  }, [sessionId, setSessionStatus, removeSession, scheduleFit])

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
    // visible=true but defer visibleRef until after fit+flush.
    // The rAF handle is captured so cleanup can cancel it if visibility
    // toggles back to false before it fires (prevents stale visibleRef=true).
    const rafId = requestAnimationFrame(() => {
      if (!fitCallbacksRef.current) return
      try {
        safeFitAndResize(
          containerRef.current,
          fitRef.current,
          termRef.current,
          fitCallbacksRef.current,
        )
      } catch (err) {
        if (err instanceof Error && !err.message.includes('disposed')) {
          window.agentDeck.log.send('warn', 'terminal', 'Unexpected resize error', {
            err: err.message,
          })
        }
      }
      // Flush data that arrived while this pane was hidden — AFTER fit.
      // Write chunks individually to avoid allocating a single huge string
      // (5000 chunks × 32KB = up to ~160MB with join('')).
      // Guard scroll position once around the entire flush rather than per-chunk
      // to avoid 5000 layout reflows from repeated scrollTop/scrollHeight reads.
      if (termRef.current && hiddenBufferRef.current.length > 0) {
        const vp = viewportRef.current
        const prevScrollTop = vp ? vp.scrollTop : 0
        const wasAtBottom = vp ? vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 5 : true
        for (const chunk of hiddenBufferRef.current) {
          termRef.current.write(chunk)
        }
        if (vp && !wasAtBottom && Math.abs(vp.scrollTop - prevScrollTop) > 50) {
          vp.scrollTop = prevScrollTop
        }
        hiddenBufferRef.current.length = 0
      }
      // NOW mark as visible so onData writes directly
      visibleRef.current = true
    })
    return () => cancelAnimationFrame(rafId)
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
