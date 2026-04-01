/**
 * CostTracker — watches agent JSONL log files and pushes usage updates.
 *
 * For each bound PTY session, the tracker discovers the agent's log file
 * (by polling candidate directories), then tails it every 3 seconds,
 * parsing token-usage data via the matching LogAdapter and forwarding
 * cumulative totals to the renderer over IPC.
 */
import type { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { toWslPath } from './wsl-utils'
import { createLogger } from './logger'
import type { LogAdapter, TokenUsage } from './log-adapters'
import { ZERO_USAGE } from './log-adapters'

const log = createLogger('cost-tracker')

// ── Constants ───────────────────────────────────────────────────────

/** How often to poll for the log file during discovery (ms). */
const DISCOVERY_INTERVAL_MS = 2000

/** How long to keep looking for a log file before giving up (ms). */
const DISCOVERY_TIMEOUT_MS = 30_000

/** How often to poll the log file for new content once bound (ms). */
const TAIL_INTERVAL_MS = 3000

/** Timeout for individual WSL exec calls (ms). */
const WSL_TIMEOUT_MS = 5000

// ── Types ───────────────────────────────────────────────────────────

interface BoundSession {
  sessionId: string
  adapter: LogAdapter
  projectPath: string
  cwd: string
  spawnAt: number
  discoveryStartedAt: number
  filePath: string | null
  offset: number
  partialLine: string
  usage: TokenUsage
  pollTimer: ReturnType<typeof setTimeout> | null
}

export interface CostTracker {
  bindSession(
    sessionId: string,
    opts: {
      agent: string
      projectPath: string
      cwd: string
      spawnAt: number
    },
  ): void
  unbindSession(sessionId: string): void
  destroy(): void
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Single-quote a path for safe use inside bash -lc commands. */
function sq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/**
 * Run a command inside WSL bash and return stdout.
 * Resolves with stdout on success; rejects on error.
 */
function wslExec(cmd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // R2-20: Use '--' separator consistent with all other WSL exec calls in the codebase
    execFile('wsl.exe', ['--', 'bash', '-lc', cmd], { timeout: WSL_TIMEOUT_MS }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

// ── Factory ─────────────────────────────────────────────────────────

export function createCostTracker(mainWindow: BrowserWindow, adapters: LogAdapter[]): CostTracker {
  const sessions = new Map<string, BoundSession>()

  // ── Discovery ───────────────────────────────────────────────────

  function startDiscovery(session: BoundSession): void {
    const rawDirs = session.adapter.getLogDirs(session.projectPath)
    const pattern = session.adapter.getFilePattern()

    // R4-01: Resolve ~ to the actual WSL home directory BEFORE building
    // shell commands. sq() wraps in single quotes which prevents $HOME
    // expansion — so we must resolve it in Node, not in bash.
    const resolveHome = wslExec('echo "$HOME"')
      .then((out) => out.trim())
      .catch(() => '')

    resolveHome
      .then((home) => {
        if (!sessions.has(session.sessionId)) return
        const dirs = rawDirs.map((d) => (d.startsWith('~') && home ? home + d.slice(1) : d))
        runDiscoveryLoop(session, dirs, pattern)
      })
      .catch(() => {
        // If home resolution fails, try dirs as-is (non-~ paths still work)
        if (!sessions.has(session.sessionId)) return
        const dirs = rawDirs.filter((d) => !d.startsWith('~'))
        if (dirs.length > 0) {
          runDiscoveryLoop(session, dirs, pattern)
        }
      })
  }

  function runDiscoveryLoop(session: BoundSession, dirs: string[], pattern: string): void {
    function discoveryPoll(): void {
      // Session may have been unbound while we were waiting
      if (!sessions.has(session.sessionId)) return

      // Timeout guard — uses the session-level start time so re-entries
      // from tryMatchCandidates share the same deadline
      if (Date.now() - session.discoveryStartedAt > DISCOVERY_TIMEOUT_MS) {
        log.warn('Discovery timed out for session', {
          sessionId: session.sessionId,
          dirs,
          pattern,
        })
        return
      }

      // Build find commands with resolved paths (no $HOME needed)
      const findParts = dirs.map(
        (d) =>
          `find ${sq(d)} -name ${sq(pattern)} -newermt @${Math.floor((session.spawnAt - 2000) / 1000)} 2>/dev/null`,
      )
      const findCmd = findParts.join('; ')

      wslExec(findCmd)
        .then((stdout) => {
          if (!sessions.has(session.sessionId)) return

          const candidates = stdout
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)

          if (candidates.length === 0) {
            // Nothing yet — schedule next discovery poll
            // R2-02: Re-check session existence before scheduling to avoid TOCTOU timer leak
            if (!sessions.has(session.sessionId)) return
            session.pollTimer = setTimeout(discoveryPoll, DISCOVERY_INTERVAL_MS)
            return
          }

          // Try each candidate: read first 3 lines and check matchSession
          return tryMatchCandidates(session, candidates, 0)
        })
        .catch((err) => {
          if (!sessions.has(session.sessionId)) return
          log.debug('Discovery find failed (will retry)', {
            sessionId: session.sessionId,
            err: String(err),
          })
          // R2-02: Re-check before scheduling
          if (!sessions.has(session.sessionId)) return
          session.pollTimer = setTimeout(discoveryPoll, DISCOVERY_INTERVAL_MS)
        })
    }

    // Start first discovery poll
    session.pollTimer = setTimeout(discoveryPoll, DISCOVERY_INTERVAL_MS)
  }

  function tryMatchCandidates(
    session: BoundSession,
    candidates: string[],
    index: number,
  ): Promise<void> {
    if (!sessions.has(session.sessionId)) return Promise.resolve()
    if (index >= candidates.length) {
      // No match in this batch — schedule another discovery poll
      // R2-02: Re-check before scheduling
      if (!sessions.has(session.sessionId)) return Promise.resolve()
      session.pollTimer = setTimeout(() => {
        startDiscovery(session)
      }, DISCOVERY_INTERVAL_MS)
      return Promise.resolve()
    }

    const candidate = candidates[index]
    if (!candidate) {
      return tryMatchCandidates(session, candidates, index + 1)
    }

    return wslExec(`head -n 3 ${sq(candidate)}`)
      .then((headOutput): Promise<void> | void => {
        if (!sessions.has(session.sessionId)) return

        const firstLines = headOutput.split('\n').filter(Boolean)
        if (session.adapter.matchSession(firstLines, session.cwd, session.spawnAt)) {
          // Match found — bind and start tailing
          session.filePath = candidate
          log.info('Discovered log file for session', {
            sessionId: session.sessionId,
            filePath: candidate,
          })
          startTailing(session)
        } else {
          // Try next candidate
          return tryMatchCandidates(session, candidates, index + 1)
        }
      })
      .catch(() => {
        if (!sessions.has(session.sessionId)) return
        // head failed for this candidate — try next
        return tryMatchCandidates(session, candidates, index + 1)
      })
  }

  // ── Tailing ─────────────────────────────────────────────────────

  function startTailing(session: BoundSession): void {
    function tailPoll(): void {
      if (!sessions.has(session.sessionId)) return
      if (!session.filePath) return

      // Get file size and new content in one call.
      // tail -c +N is 1-indexed: +1 reads from byte 0, so we use offset+1.
      const cmd = `stat -c %s ${sq(session.filePath)} && tail -c +${session.offset + 1} ${sq(session.filePath)}`

      wslExec(cmd)
        .then((stdout) => {
          if (!sessions.has(session.sessionId)) return

          // First line is the file size from stat, rest is content
          const newlineIdx = stdout.indexOf('\n')
          if (newlineIdx === -1) {
            session.pollTimer = setTimeout(tailPoll, TAIL_INTERVAL_MS)
            return
          }

          const statLine = stdout.slice(0, newlineIdx).trim()
          const fileSize = parseInt(statLine, 10)
          const content = stdout.slice(newlineIdx + 1)

          // Truncation detection: file shrank since last read
          if (!isNaN(fileSize) && fileSize < session.offset) {
            log.debug('File truncated, resetting offset', {
              sessionId: session.sessionId,
              oldOffset: session.offset,
              newSize: fileSize,
            })
            session.offset = 0
            session.partialLine = ''
            // Re-poll immediately to read from the start
            session.pollTimer = setTimeout(tailPoll, 0)
            return
          }

          // No new content
          if (!content) {
            session.pollTimer = setTimeout(tailPoll, TAIL_INTERVAL_MS)
            return
          }

          // Update offset by actual bytes read
          const contentBytes = Buffer.byteLength(content, 'utf8')
          session.offset += contentBytes

          // Split on newlines, keeping the last incomplete part in partialLine
          const text = session.partialLine + content
          const lines = text.split('\n')
          session.partialLine = lines.pop() ?? ''

          let usageChanged = false
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            const result = session.adapter.parseUsage(trimmed, session.usage)
            if (result !== null) {
              session.usage = result
              usageChanged = true
            }
          }

          if (usageChanged && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cost:update', {
              sessionId: session.sessionId,
              usage: { ...session.usage },
            })
          }

          session.pollTimer = setTimeout(tailPoll, TAIL_INTERVAL_MS)
        })
        .catch((err) => {
          if (!sessions.has(session.sessionId)) return
          log.debug('Tail poll failed (will retry)', {
            sessionId: session.sessionId,
            err: String(err),
          })
          session.pollTimer = setTimeout(tailPoll, TAIL_INTERVAL_MS)
        })
    }

    session.pollTimer = setTimeout(tailPoll, TAIL_INTERVAL_MS)
  }

  // ── Public API ──────────────────────────────────────────────────

  function bindSession(
    sessionId: string,
    opts: {
      agent: string
      projectPath: string
      cwd: string
      spawnAt: number
    },
  ): void {
    // Find matching adapter
    const adapter = adapters.find((a) => a.agent === opts.agent)
    if (!adapter) {
      log.debug('No adapter for agent, skipping cost tracking', { agent: opts.agent })
      return
    }

    // Don't re-bind if already tracking
    if (sessions.has(sessionId)) {
      log.debug('Session already bound, skipping', { sessionId })
      return
    }

    // Convert Windows paths to WSL format for log directory lookup
    const wslCwd = toWslPath(opts.cwd)
    const wslProjectPath = toWslPath(opts.projectPath)

    const session: BoundSession = {
      sessionId,
      adapter,
      projectPath: wslProjectPath,
      cwd: wslCwd,
      spawnAt: opts.spawnAt,
      discoveryStartedAt: Date.now(),
      filePath: null,
      offset: 0,
      partialLine: '',
      usage: { ...ZERO_USAGE },
      pollTimer: null,
    }

    sessions.set(sessionId, session)
    log.info('Bound session for cost tracking', {
      sessionId,
      agent: opts.agent,
      cwd: opts.cwd,
    })

    startDiscovery(session)
  }

  function unbindSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return

    if (session.pollTimer !== null) {
      clearTimeout(session.pollTimer)
      session.pollTimer = null
    }

    log.info('Unbound session from cost tracking', {
      sessionId,
      usage: session.usage,
    })

    sessions.delete(sessionId)
  }

  function destroy(): void {
    for (const session of sessions.values()) {
      if (session.pollTimer !== null) {
        clearTimeout(session.pollTimer)
        session.pollTimer = null
      }
    }
    sessions.clear()
    log.info('CostTracker destroyed')
  }

  return { bindSession, unbindSession, destroy }
}
