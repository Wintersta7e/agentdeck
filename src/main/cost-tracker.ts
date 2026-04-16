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
import type { AgentEnvContext, LogAdapter, TokenUsage } from './log-adapters'
import { ZERO_USAGE } from './log-adapters'

const log = createLogger('cost-tracker')

// ── Constants ───────────────────────────────────────────────────────

/** How often to poll for the log file during discovery (ms). */
const DISCOVERY_INTERVAL_MS = 2000

/** How often to poll the log file for new content once bound (ms). */
const TAIL_INTERVAL_MS = 3000

/** Timeout for individual WSL exec calls (ms). */
const WSL_TIMEOUT_MS = 5000

/**
 * Minimum cost delta (USD) we'll record. Chosen well below legitimate
 * single-token pricing (cache reads on Haiku are ~$3e-8/token) but above
 * IEEE-754 subtraction noise for typical session totals.
 */
const COST_DELTA_EPSILON_USD = 1e-9

// ── Types ───────────────────────────────────────────────────────────

interface BoundSession {
  sessionId: string
  adapter: LogAdapter
  projectPath: string
  cwd: string
  spawnAt: number
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

/** Minimal contract for persisting cost deltas to long-term storage. */
export interface CostRecorder {
  recordCost(agentId: string, costUsd: number, tokens: number): void
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

export function createCostTracker(
  mainWindow: BrowserWindow,
  adapters: LogAdapter[],
  costHistory?: CostRecorder,
): CostTracker {
  const sessions = new Map<string, BoundSession>()
  /** File paths already bound to a session — prevents cross-session matching. */
  const boundFiles = new Set<string>()

  // R4-01: Resolve $HOME once at tracker creation so all sessions share
  // the cached value. Eliminates repeated wsl.exe calls that fail under
  // WSL resource contention when multiple sessions start simultaneously.
  let cachedHome: string | null = null
  const homeReady: Promise<string> = wslExec('echo "$HOME"')
    .then((out) => {
      const home = out.trim()
      cachedHome = home
      log.info('Resolved WSL $HOME', { home })
      return home
    })
    .catch((err) => {
      log.warn('Failed to resolve WSL $HOME — cost tracking may not work', {
        err: String(err),
      })
      cachedHome = ''
      return ''
    })

  // Resolve agent config env vars from WSL (CLAUDE_CONFIG_DIR, CODEX_HOME).
  // These override the default ~/.claude and ~/.codex base paths.
  // Resolved in parallel with $HOME since they're independent.
  let cachedEnv: AgentEnvContext | null = null
  const envReady: Promise<AgentEnvContext> = Promise.all([
    // eslint-disable-next-line no-template-curly-in-string -- bash variable expansion, not JS
    wslExec('echo "${CLAUDE_CONFIG_DIR:-}"')
      .then((o) => o.trim())
      .catch(() => ''),
    // eslint-disable-next-line no-template-curly-in-string -- bash variable expansion, not JS
    wslExec('echo "${CODEX_HOME:-}"')
      .then((o) => o.trim())
      .catch(() => ''),
  ])
    .then(([rawClaude, rawCodex]) => {
      const claudeConfigDir = rawClaude || undefined
      const codexHome = rawCodex || undefined
      const env: AgentEnvContext = { claudeConfigDir, codexHome }
      cachedEnv = env
      log.info('Resolved WSL agent env vars', { claudeConfigDir, codexHome })
      return env
    })
    .catch((err) => {
      log.warn('Failed to resolve WSL agent env vars — using defaults', {
        err: String(err),
      })
      const env: AgentEnvContext = {}
      cachedEnv = env
      return env
    })

  // ── Discovery ───────────────────────────────────────────────────

  function startDiscovery(session: BoundSession): void {
    const pattern = session.adapter.getFilePattern()

    // Use cached values if available; otherwise wait for initial resolution.
    const homePromise = cachedHome !== null ? Promise.resolve(cachedHome) : homeReady
    const envPromise = cachedEnv !== null ? Promise.resolve(cachedEnv) : envReady

    Promise.all([homePromise, envPromise])
      .then(([home, env]) => {
        if (!sessions.has(session.sessionId)) return
        const rawDirs = session.adapter.getLogDirs(session.projectPath, env)
        const dirs = home
          ? rawDirs.map((d) => (d.startsWith('~') ? home + d.slice(1) : d))
          : rawDirs.filter((d) => !d.startsWith('~'))
        if (dirs.length === 0) {
          log.warn('No usable log dirs (HOME unknown, all dirs use ~)', {
            sessionId: session.sessionId,
          })
          return
        }
        runDiscoveryLoop(session, dirs, pattern)
      })
      .catch(() => {
        /* homeReady/envReady never reject (have .catch), but guard defensively */
      })
  }

  function runDiscoveryLoop(session: BoundSession, dirs: string[], pattern: string): void {
    function discoveryPoll(): void {
      // Session may have been unbound while we were waiting. The loop has no
      // wall-clock timeout — claude-code (and other agents) only create their
      // log file on first user prompt, which can be arbitrarily delayed. The
      // loop terminates when unbindSession deletes the session from the map.
      if (!sessions.has(session.sessionId)) return

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
            // Nothing yet — re-enter startDiscovery so adapters with time-
            // dependent log dirs (e.g. Codex's today-date path) recompute
            // them on each retry instead of caching yesterday's dir across
            // midnight.
            if (!sessions.has(session.sessionId)) return
            session.pollTimer = setTimeout(() => startDiscovery(session), DISCOVERY_INTERVAL_MS)
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
          if (!sessions.has(session.sessionId)) return
          session.pollTimer = setTimeout(() => startDiscovery(session), DISCOVERY_INTERVAL_MS)
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
      // No match in this batch — schedule another discovery poll.
      // Re-enter runDiscoveryLoop directly (HOME is already resolved).
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

    // Skip files already bound to another session to prevent cross-session matching
    if (boundFiles.has(candidate)) {
      return tryMatchCandidates(session, candidates, index + 1)
    }

    return wslExec(`head -n 3 ${sq(candidate)}`)
      .then((headOutput): Promise<void> | void => {
        if (!sessions.has(session.sessionId)) return

        const firstLines = headOutput.split('\n').filter(Boolean)
        if (session.adapter.matchSession(firstLines, session.cwd, session.spawnAt)) {
          // Match found — bind and start tailing
          session.filePath = candidate
          boundFiles.add(candidate)
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

          const preUsage = session.usage
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

          if (usageChanged) {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('cost:update', {
                sessionId: session.sessionId,
                usage: { ...session.usage },
              })
            }
            if (costHistory) {
              // cost-history sums deltas, not cumulative totals
              const deltaCost = session.usage.totalCostUsd - preUsage.totalCostUsd
              const deltaTokens =
                session.usage.inputTokens +
                session.usage.outputTokens -
                preUsage.inputTokens -
                preUsage.outputTokens
              // Epsilon guard against float noise that would otherwise schedule a disk flush
              if (deltaCost > COST_DELTA_EPSILON_USD) {
                costHistory.recordCost(session.adapter.agent, deltaCost, Math.max(0, deltaTokens))
              }
            }
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

    // Stagger initial poll with jitter so multiple concurrently-bound sessions
    // don't fire their wsl.exe subprocesses in lockstep every interval.
    const jitter = Math.floor(Math.random() * TAIL_INTERVAL_MS)
    session.pollTimer = setTimeout(tailPoll, jitter)
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

    // Release bound file so other sessions can discover it
    if (session.filePath) {
      boundFiles.delete(session.filePath)
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
    boundFiles.clear()
    log.info('CostTracker destroyed')
  }

  return { bindSession, unbindSession, destroy }
}
