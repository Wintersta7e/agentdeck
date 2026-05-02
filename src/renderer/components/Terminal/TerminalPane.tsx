import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../../store/appStore'
import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_DEFAULT_FONT_SIZE,
  HIDDEN_BUFFER_HIGH_WATER,
  HIDDEN_BUFFER_TRIM_TARGET,
} from '../../../shared/constants'
import { subscribeTheme } from '../../utils/themeObserver'
import { safeWrite } from '../../utils/pty-write'
import {
  getXtermTheme,
  validScrollback,
  writeWithScrollGuard,
  safeFitAndResize,
  OSC_RESPONSE_RE,
  type FitCallbacks,
  type ScrollGuardTerminal,
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
  const [showWatermark, setShowWatermark] = useState(true)
  const [copyFlash, setCopyFlash] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
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
  // Write batching: coalesce PTY data chunks into one write per animation frame.
  // Prevents scroll guard race conditions during rapid agent output bursts.
  // LEAK-10: Track copy flash timer so it can be cancelled on unmount
  const copyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const writeBufferRef = useRef<string[]>([])
  const writeRafRef = useRef(0)
  const applySessionStatus = useAppStore((s) => s.applySessionStatus)
  const setWorktreePath = useAppStore((s) => s.setWorktreePath)
  const clearWorktreePath = useAppStore((s) => s.clearWorktreePath)
  // Look up projectId from session (stable per sessionId lifetime)
  const projectId = useAppStore((s) => s.sessions[sessionId]?.projectId ?? '')
  const projectIdRef = useRef(projectId)

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

    let term: Terminal
    let fit: FitAddon
    let webglAddon: WebglAddon | null = null
    let unicode11Addon: Unicode11Addon | null = null
    let search: SearchAddon | null = null
    let isReattached = false
    // M12: StrictMode double-spawn protection
    let cancelled = false
    // Capture write buffer ref for cleanup (avoids react-hooks/exhaustive-deps warning).
    // The array reference stays stable — we push/splice in place, never reassign.
    const writeBuffer = writeBufferRef.current
    // Capture projectId for cleanup (CDX-2 worktree release on implicit exit)
    const capturedProjectId = projectIdRef.current

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
      // Rebuild WebGL texture atlas for the new pane dimensions.
      // Cached terminals keep stale cell metrics from their previous pane slot.
      // Re-assigning fontFamily forces xterm.js to re-measure and rebuild.
      document.fonts.ready
        .then(() => {
          if (cancelled) return
          try {
            const ff = term.options.fontFamily ?? TERMINAL_FONT_FAMILY
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
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: TERMINAL_DEFAULT_FONT_SIZE,
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
          navigator.clipboard
            .writeText(term.getSelection())
            .then(() => {
              setCopyFlash(true)
              clearTimeout(copyFlashTimerRef.current)
              copyFlashTimerRef.current = setTimeout(() => setCopyFlash(false), 1200)
            })
            .catch((err: unknown) => {
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
              safeWrite(sessionId, text)
              return
            }
            // No text on clipboard — check for copied files
            const paths = await window.agentDeck.clipboard.readFilePaths()
            if (paths.length > 0) {
              // Single-quote escaping (POSIX safe) — prevents injection via
              // filenames containing ", $, `, \, or ! on shared filesystems.
              const escaped = paths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ')
              safeWrite(sessionId, escaped)
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
      // LEAK-11: Store reference so it can be disposed in session-removed path
      try {
        unicode11Addon = new Unicode11Addon()
        term.loadAddon(unicode11Addon)
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
            const ff = term.options.fontFamily ?? TERMINAL_FONT_FAMILY
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

    // Track spawn time so the exit handler can detect quick exits (< 2s = likely failure)
    let spawnTimestamp = 0

    // Only spawn on first mount — reattached terminals already have a live PTY
    if (!isReattached) {
      const doSpawn = async (): Promise<void> => {
        if (cancelled) return

        // Resolve worktree path for project sessions (bare terminals use projectPath directly)
        let spawnPath = projectPathRef.current
        const pid = projectIdRef.current
        if (pid) {
          try {
            const result = await window.agentDeck.worktree.acquire(pid, sessionId)
            if (cancelled) {
              // Tab closed while acquire was in-flight — discard the orphaned worktree
              if (result.isolated) {
                window.agentDeck.worktree.discard(sessionId).catch((err: unknown) => {
                  window.agentDeck.log.send('warn', 'terminal', 'Orphan worktree cleanup failed', {
                    sessionId,
                    err: String(err),
                  })
                })
              }
              return
            }
            setWorktreePath(sessionId, result)
            spawnPath = result.path
          } catch (err: unknown) {
            if (cancelled) return
            window.agentDeck.log.send(
              'error',
              'terminal',
              `Worktree acquire failed for ${sessionId}`,
              { err: String(err) },
            )
            try {
              term.write(
                '\r\n\x1b[31m Failed to acquire worktree. Falling back to project path.\x1b[0m\r\n',
              )
            } catch {
              /* terminal disposed */
            }
            // Fall back to original project path
          }
        }

        if (cancelled) return
        spawnTimestamp = Date.now()
        const { cols, rows } = term

        // Pull session launch config (prompt, branch, branchMode) once at
        // spawn time. These come from NewSessionScreen's handleLaunch.
        const launchSession = useAppStore.getState().sessions[sessionId]
        const SAFE_BRANCH_RE = /^[a-zA-Z0-9_/.-]+$/
        const branchCmds: string[] = []
        if (
          launchSession?.branchMode === 'existing' &&
          launchSession.initialBranch &&
          SAFE_BRANCH_RE.test(launchSession.initialBranch)
        ) {
          branchCmds.push(`git checkout ${launchSession.initialBranch}`)
        } else if (
          launchSession?.branchMode === 'new' &&
          launchSession.initialBranch &&
          SAFE_BRANCH_RE.test(launchSession.initialBranch)
        ) {
          branchCmds.push(`git checkout -b ${launchSession.initialBranch}`)
        }
        const mergedStartup =
          branchCmds.length > 0
            ? [...branchCmds, ...(startupRef.current ?? [])]
            : startupRef.current

        try {
          await window.agentDeck.pty.spawn(
            sessionId,
            cols,
            rows,
            spawnPath,
            mergedStartup,
            envRef.current,
            agentRef.current,
            agentFlagsRef.current,
          )
          if (cancelled) return
          // Bind cost tracking (best-effort, fire-and-forget)
          window.agentDeck.cost
            .bind(sessionId, {
              agent: agentRef.current ?? '',
              projectPath: projectPathRef.current ?? '',
              cwd: spawnPath ?? projectPathRef.current ?? '',
              spawnAt: spawnTimestamp,
            })
            .catch(() => {
              /* cost tracking is best-effort */
            })
          applySessionStatus(sessionId, 'running')

          // Pipe the launch prompt into the agent's stdin after a short grace
          // period so the agent has time to print its greeting. Only runs once
          // per session — the useEffect guards against reattach re-spawns.
          if (launchSession?.initialPrompt) {
            const promptToSend = launchSession.initialPrompt
            setTimeout(() => {
              if (cancelled) return
              safeWrite(sessionId, promptToSend + '\n')
            }, 2000)
          }
        } catch (err: unknown) {
          if (cancelled) return
          window.agentDeck.log.send('error', 'terminal', `PTY spawn failed for ${sessionId}`, {
            err: String(err),
          })
          try {
            term.write('\r\n\x1b[31m Session failed to start. Is WSL running?\x1b[0m\r\n')
          } catch {
            /* terminal disposed */
          }
          applySessionStatus(sessionId, 'error', 'spawn-failure')
        }
      }
      doSpawn().catch((err: unknown) => {
        window.agentDeck.log.send('error', 'terminal', `Spawn sequence failed for ${sessionId}`, {
          err: String(err),
        })
      })
    }

    // Buffer data received while hidden, batch visible writes per animation frame.
    // The visibility effect (fit→flush→visibleRef=true) handles the transition,
    // so there is no gap where onData could write before the hidden buffer is flushed.
    //
    // Write batching: instead of calling writeWithScrollGuard on every PTY chunk,
    // we accumulate chunks and flush once per rAF. This coalesces N chunks/frame
    // into a single write+scroll-restore cycle, preventing the scroll guard race
    // condition that causes viewport jumping during rapid agent output.
    const unsubData = window.agentDeck.pty.onData(sessionId, (data) => {
      setShowWatermark(false)
      if (visibleRef.current) {
        writeBufferRef.current.push(data)
        if (!writeRafRef.current) {
          writeRafRef.current = requestAnimationFrame(() => {
            writeRafRef.current = 0
            const batched = writeBufferRef.current.join('')
            writeBufferRef.current.length = 0
            if (termRef.current) {
              writeWithScrollGuard(termRef.current as ScrollGuardTerminal, batched)
            }
          })
        }
      } else {
        const buf = hiddenBufferRef.current
        buf.push(data)
        // Cap buffer to prevent unbounded memory growth.
        // Trim to HIDDEN_BUFFER_TRIM_TARGET to avoid re-trimming on every chunk at the boundary.
        if (buf.length > HIDDEN_BUFFER_HIGH_WATER) {
          buf.splice(0, buf.length - HIDDEN_BUFFER_TRIM_TARGET)
        }
      }
    })

    // Filter OSC color query responses from xterm.js before forwarding to PTY.
    // Apps like Codex send OSC 10/11 to detect terminal colors; xterm.js responds
    // correctly, but some apps don't consume the response and display it as text.
    const onDataDisposable = term.onData((data) => {
      const filtered = data.replace(OSC_RESPONSE_RE, '')
      if (filtered) safeWrite(sessionId, filtered)
    })

    const QUICK_EXIT_MS = 2000
    const unsubExit = window.agentDeck.pty.onExit(sessionId, (exitCode) => {
      // PTY spawn failures are emitted from main as pty:exit with exitCode=-1
      // (see pty-manager.ts:143-156 catch block), not as spawn-promise
      // rejections. Route those through the 'spawn-failure' reason so
      // applySessionStatus normalizes to status='error' + approvalState='idle'
      // instead of the default 'pty-exit' path that would leave the session
      // as 'exited' + approvalState='review'.
      const isSpawnFailure = exitCode === -1
      const isQuickExit = spawnTimestamp > 0 && Date.now() - spawnTimestamp < QUICK_EXIT_MS

      // Show a visible error message for spawn failures or suspiciously quick exits
      if (isSpawnFailure || isQuickExit) {
        try {
          term.write('\r\n\x1b[31m Session failed to start. Is WSL running?\x1b[0m\r\n')
        } catch {
          /* terminal disposed */
        }
      }

      const reason = isSpawnFailure ? 'spawn-failure' : 'pty-exit'
      applySessionStatus(sessionId, 'exited', reason)

      // Evict from cache if the PTY exited while the terminal was hidden
      // (unmounted and cached for reattachment). Without this, the cached
      // Terminal + WebGL context leak indefinitely. The session itself
      // persists in the store so the user can review before closing the tab.
      const stale = terminalCache.get(sessionId)
      if (stale) {
        terminalCache.delete(sessionId)
        searchAddonMap.delete(sessionId)
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
      // LEAK-10: Cancel copy flash timer on unmount
      clearTimeout(copyFlashTimerRef.current)

      // Cancel pending write batch rAF and flush any buffered data into the
      // terminal before caching (rAF won't fire after cleanup, so unflushed
      // chunks would be lost). term.write() works on xterm's internal buffer
      // even after the DOM element is detached.
      cancelAnimationFrame(writeRafRef.current)
      writeRafRef.current = 0
      if (writeBuffer.length > 0) {
        try {
          term.write(writeBuffer.join(''))
        } catch {
          /* terminal disposed */
        }
        writeBuffer.length = 0
      }

      // Null out refs so stale async callbacks (rAF, setTimeout) can't use them
      termRef.current = null
      fitRef.current = null
      fitCallbacksRef.current = null

      // Guard against StrictMode double-invoke: only delete if this effect's
      // search instance is still the one in the map (prevents stale removal).
      if (searchAddonMap.get(sessionId) === search) {
        searchAddonMap.delete(sessionId)
      }

      const state = useAppStore.getState()
      const storedSession = state.sessions[sessionId]
      if (storedSession && storedSession.status !== 'exited') {
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
        // CDX-4/CDX-2: Clean up worktree resources for project sessions that exited
        // without going through the explicit close flow (PTY exits on its own).
        // Use `keep` instead of `discard` for isolated worktrees to prevent data loss —
        // the user may have uncommitted work. The explicit close flow prompts Keep/Discard.
        const wt = useAppStore.getState().worktreePaths[sessionId]
        if (wt?.isolated) {
          window.agentDeck.worktree.keep(sessionId).catch((err: unknown) => {
            window.agentDeck.log.send('warn', 'worktree', 'Implicit exit keep failed', {
              sessionId,
              err: String(err),
            })
          })
        } else if (capturedProjectId) {
          window.agentDeck.worktree
            .releasePrimary(capturedProjectId, sessionId)
            .catch((err: unknown) => {
              window.agentDeck.log.send(
                'debug',
                'worktree',
                'Implicit exit releasePrimary failed',
                {
                  sessionId,
                  err: String(err),
                },
              )
            })
        }
        clearWorktreePath(sessionId)
        window.agentDeck.cost.unbind(sessionId).catch((err: unknown) => {
          window.agentDeck.log.send('debug', 'cost', 'unbind failed', {
            sessionId,
            err: String(err),
          })
        })
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
  }, [sessionId, applySessionStatus, scheduleFit, setWorktreePath, clearWorktreePath])

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
      // Uses writeWithScrollGuard with join so the buffer-line scroll lock
      // captures viewportY once and restores after the full flush completes.
      if (termRef.current && hiddenBufferRef.current.length > 0) {
        try {
          writeWithScrollGuard(
            termRef.current as ScrollGuardTerminal,
            hiddenBufferRef.current.join(''),
          )
        } catch (err) {
          if (err instanceof Error && !err.message.includes('disposed')) {
            window.agentDeck.log.send('warn', 'terminal', 'Hidden buffer flush failed', {
              err: err.message,
            })
          }
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

  // ── Context menu dismiss ──────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    function handleClick(e: MouseEvent): void {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [ctxMenu])

  const [ctxHasSelection, setCtxHasSelection] = useState(false)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxHasSelection(termRef.current?.hasSelection() ?? false)
    setCtxMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 220),
    })
  }, [])

  const handleCtxAction = useCallback(
    (action: 'copy' | 'paste' | 'selectAll' | 'clear' | 'search') => {
      setCtxMenu(null)
      const term = termRef.current
      if (!term) return
      switch (action) {
        case 'copy':
          if (term.hasSelection()) {
            navigator.clipboard
              .writeText(term.getSelection())
              .then(() => {
                setCopyFlash(true)
                clearTimeout(copyFlashTimerRef.current)
                copyFlashTimerRef.current = setTimeout(() => setCopyFlash(false), 1200)
              })
              .catch(() => {})
          }
          break
        case 'paste':
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text) safeWrite(sessionId, text)
            })
            .catch(() => {})
          break
        case 'selectAll':
          term.selectAll()
          break
        case 'clear':
          // 1. Wipe the visible screen + scrollback via ANSI sequences
          // 2. Then clear xterm.js internal scrollback buffer
          // 3. Then send Ctrl+L to the PTY so the running agent redraws
          //    its UI on the now-clean screen
          term.write('\x1b[2J\x1b[3J\x1b[H')
          term.clear()
          safeWrite(sessionId, '\x0c')
          break
        case 'search':
          setSearchOpen(true)
          break
      }
    },
    [sessionId],
  )

  const searchAddon = searchAddonMap.get(sessionId)

  return (
    <div ref={containerRef} className="terminal-container" onContextMenu={handleContextMenu}>
      {showWatermark && (
        <div className="term-watermark">
          <div className="term-watermark-label">{agent ?? 'Terminal'}</div>
          <div className="term-watermark-status">Starting\u2026</div>
        </div>
      )}
      {copyFlash && <div className="term-copy-flash">Copied!</div>}
      {searchAddon && (
        <TerminalSearchBar
          searchAddon={searchAddon}
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {ctxMenu &&
        createPortal(
          <div
            ref={ctxMenuRef}
            className="term-context-menu"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            <button
              className="term-ctx-item"
              disabled={!ctxHasSelection}
              onClick={() => handleCtxAction('copy')}
            >
              Copy
              <span className="term-ctx-hint">Ctrl+Shift+C</span>
            </button>
            <button className="term-ctx-item" onClick={() => handleCtxAction('paste')}>
              Paste
              <span className="term-ctx-hint">Ctrl+V</span>
            </button>
            <button className="term-ctx-item" onClick={() => handleCtxAction('selectAll')}>
              Select All
            </button>
            <div className="term-ctx-sep" />
            <button className="term-ctx-item" onClick={() => handleCtxAction('clear')}>
              Clear Scrollback
            </button>
            <div className="term-ctx-sep" />
            <button className="term-ctx-item" onClick={() => handleCtxAction('search')}>
              Search
              <span className="term-ctx-hint">Ctrl+Shift+F</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
