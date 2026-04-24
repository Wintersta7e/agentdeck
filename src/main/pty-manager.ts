import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'
import { createLogger } from './logger'
import { ptyBus } from './pty-bus'
import { toWslPath } from './wsl-utils'
import { AGENT_BINARY_MAP, SAFE_FLAGS_RE } from '../shared/agents'
import { shellQuote } from './node-runners'

const log = createLogger('pty-manager')

const MAX_CONCURRENT_SESSIONS = 20

/**
 * Map of agent name → npm package info for agents installed via npm.
 * Used to fix missing bin symlinks in WSL (npm global installs sometimes
 * lose their bin symlinks, causing the Windows-side binary to shadow the
 * newer WSL-installed version).
 */
const NPM_AGENT_PACKAGES: Record<string, { pkg: string; binEntry: string }> = {
  codex: { pkg: '@openai/codex', binEntry: 'bin/codex.js' },
}

export interface PtyManager {
  spawn: (
    sessionId: string,
    cols: number,
    rows: number,
    projectPath?: string,
    startupCommands?: string[],
    env?: Record<string, string>,
    agent?: string,
    agentFlags?: string,
  ) => void
  write: (sessionId: string, data: string) => void
  hasSession: (sessionId: string) => boolean
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  killAll: () => void
}

/* Fix 1 (PANEL-4): ANSI stripping + regex-based activity parsing */
import { stripAnsi } from './node-runners'

function parseActivityLine(line: string): { type: string; title: string; detail: string } | null {
  const clean = stripAnsi(line).trim()
  // Skip empty lines, prompts, and very short lines (noise)
  if (clean.length < 3) return null
  // Skip common shell prompt patterns and box-drawing decoration
  if (/^[$#>❯➜%]\s*$/.test(clean)) return null
  if (/^[─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯╔╗╚╝\s]+$/.test(clean)) return null

  // Specific agent patterns (highest priority)
  if (/\b[Tt]hinking\b/.test(clean)) return { type: 'think', title: 'Thinking', detail: '' }
  if (/\bWrit(?:e|ing)\b/i.test(clean))
    return { type: 'write', title: 'Writing file', detail: clean }
  if (/\bRead(?:ing)?\b/i.test(clean)) return { type: 'read', title: 'Reading file', detail: clean }
  if (/\b(?:Execute|Running|Bash|bash|Shell)\b/i.test(clean))
    return { type: 'command', title: 'Running command', detail: clean }
  if (/\bTool\b/i.test(clean)) return { type: 'tool', title: 'Tool use', detail: clean }

  // Agent-specific patterns
  if (/^(?:Created?|Modified|Updated|Deleted|Removed)\b/i.test(clean))
    return { type: 'write', title: 'File change', detail: clean }
  if (/^(?:Searching|Looking|Scanning|Analyzing|Reviewing|Grep|Glob|List)\b/i.test(clean))
    return { type: 'read', title: 'Analyzing', detail: clean }
  if (/\b(?:Installing|Building|Compiling|Testing|Linting)\b/i.test(clean))
    return { type: 'command', title: 'Build/test', detail: clean }
  if (/\b(?:Error|Failed|FAIL|panic|exception)\b/.test(clean))
    return { type: 'error', title: 'Error', detail: clean }

  // Claude Code / Codex tool-use indicator (⏺, ●, ◆, ▶)
  if (/^[⏺●◆▶○◇▷]\s/.test(clean)) return { type: 'tool', title: 'Agent action', detail: clean }

  // Agent output: lines containing file paths (src/..., /home/..., ./...)
  if (clean.length >= 20 && /(?:^|\s)[.\/~][^\s]*\.[a-z]{1,6}\b/i.test(clean))
    return { type: 'read', title: 'File reference', detail: clean }

  // Completion / summary patterns
  if (/\b(?:completed?|finished|done|success|passed)\b/i.test(clean))
    return { type: 'command', title: 'Completed', detail: clean }

  // Cost / token patterns (e.g. "Total cost: $0.12" or "tokens used")
  if (/\b(?:cost|tokens?\s+used|context\s+window)\b/i.test(clean))
    return { type: 'tool', title: 'Usage', detail: clean }

  // FRAG-7: Graceful fallback — emit a generic event for substantial lines that
  // don't match any specific keyword.  Skip short lines, mostly-whitespace lines,
  // shell prompts, and lines dominated by box-drawing / decoration characters.
  if (clean.length >= 40) {
    const nonWs = clean.replace(/\s/g, '')
    const boxChars = nonWs.replace(/[─━═│┃┌┐└┘├┤┬┴┼╭╮╰╯╔╗╚╝║╠╣╦╩╬─┄┈╌╎╏┆┇┊┋]/g, '')
    // Skip if mostly box-drawing (>50% of non-whitespace chars are decoration)
    if (boxChars.length > nonWs.length * 0.5) {
      // Skip shell prompt patterns (e.g. "user@host:~/dir$", "PS1>")
      if (!/^[\w@.~\/-]*[$#>❯➜%]\s*$/.test(clean)) {
        return { type: 'tool', title: 'Agent active', detail: '' }
      }
    }
  }

  return null
}

export function createPtyManager(mainWindow: BrowserWindow): PtyManager {
  const sessions = new Map<string, IPty>()
  const lineBuffers = new Map<string, string>()
  /* Fix 4 (PTY-3): Track spawn timers so we can cancel on kill */
  const spawnTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /* Perf: Batch PTY data IPC sends — accumulate per tick, flush via setImmediate */
  const dataBuffers = new Map<string, string>()
  const flushScheduled = new Map<string, boolean>()

  function spawn(
    sessionId: string,
    cols: number,
    rows: number,
    projectPath?: string,
    startupCommands?: string[],
    env?: Record<string, string>,
    agent?: string,
    agentFlags?: string,
  ): void {
    // If a PTY already exists for this session (e.g. session moved from visible
    // pane to hidden section), don't kill and respawn — just reuse it.
    if (sessions.has(sessionId)) {
      return
    }

    if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
      log.warn('Max concurrent sessions reached', { limit: MAX_CONCURRENT_SESSIONS })
      throw new Error(`Maximum concurrent sessions reached (${MAX_CONCURRENT_SESSIONS})`)
    }

    const cwd = process.env['USERPROFILE'] ?? process.cwd()
    // Set COLORFGBG so TUI apps (Codex/crossterm) detect dark background without
    // sending OSC 10/11 color queries that leak as visible text in xterm.js.
    const mergedEnv = { COLORFGBG: '15;0', ...process.env, ...env } as Record<string, string>

    /* Fix 8 (ERR-6): Wrap pty.spawn in try-catch */
    let proc: IPty
    try {
      proc = pty.spawn('wsl.exe', [], {
        name: 'xterm-256color',
        cols: cols > 0 ? cols : 80,
        rows: rows > 0 ? rows : 24,
        cwd,
        env: mergedEnv,
      })
    } catch (err) {
      log.error(`Failed to spawn PTY for session ${sessionId}`, { err: String(err) })
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, -1)
      }
      return
    }

    sessions.set(sessionId, proc)
    log.info(`Spawned session ${sessionId}`, { cols, rows, agent, projectPath })

    // Build the full command sequence: cd to project dir, startup commands, then launch agent
    const commands: string[] = []
    if (projectPath) {
      const wslPath = toWslPath(projectPath)
      if (wslPath === '~') {
        commands.push('cd "$HOME"')
      } else if (wslPath.startsWith('~/')) {
        commands.push(`cd "$HOME"/${shellQuote(wslPath.slice(2))}`)
      } else {
        commands.push(`cd ${shellQuote(wslPath)}`)
      }
    }
    if (startupCommands) {
      // Filter out cd and agent commands — those are handled by projectPath auto-cd
      // and the agent param. Legacy projects may still have them in stored config.
      const agentBins = new Set(Object.values(AGENT_BINARY_MAP))
      const filtered = startupCommands.filter((cmd) => {
        const trimmed = cmd.trim()
        if (/^cd\s+/.test(trimmed)) return false
        if (agentBins.has(trimmed)) return false
        return true
      })
      commands.push(...filtered)
    }

    /* Fix 6 (SEC-2): Validate agentFlags before use */
    let sanitizedFlags = agentFlags
    if (sanitizedFlags && !SAFE_FLAGS_RE.test(sanitizedFlags)) {
      log.warn(`Rejected unsafe agentFlags for session ${sessionId}`, {
        agentFlags: sanitizedFlags,
      })
      sanitizedFlags = undefined
    }

    if (agent) {
      const bin = AGENT_BINARY_MAP[agent]
      if (!bin) {
        log.warn(`Unknown agent "${agent}" for session ${sessionId}, skipping agent command`)
      } else {
        // Fix missing npm global bin symlinks for npm-installed agents.
        // WSL sometimes loses these, causing the stale Windows-side binary to
        // shadow the newer WSL-installed version (e.g. codex update loop).
        const npmInfo = NPM_AGENT_PACKAGES[agent]
        if (npmInfo) {
          const { pkg, binEntry } = npmInfo
          commands.push(
            `NPM_G=$(npm prefix -g 2>/dev/null) && [ -d "$NPM_G/lib/node_modules/${pkg}" ] && [ ! -x "$NPM_G/bin/${bin}" ] && ln -sf "../lib/node_modules/${pkg}/${binEntry}" "$NPM_G/bin/${bin}" 2>/dev/null; true`,
          )
        }

        const agentCmd = sanitizedFlags ? `${bin} ${sanitizedFlags}` : bin
        commands.push(agentCmd)
      }
    }

    if (commands.length > 0) {
      const timer = setTimeout(() => {
        spawnTimers.delete(sessionId)
        if (!sessions.has(sessionId)) return
        // BUG-1: Use '; ' instead of ' && ' so an intermediate failure (e.g. cd to
        // a deleted directory) doesn't abort the entire chain and silently prevent
        // the agent from launching.
        proc.write(commands.join('; ') + '\n')
      }, 500)
      spawnTimers.set(sessionId, timer)
    }

    lineBuffers.set(sessionId, '')

    proc.onData((data) => {
      // BUG-6: Guard against post-kill data emission — kill() deletes from sessions
      // before proc.kill(), so a trailing chunk can arrive after the session is gone
      if (!sessions.has(sessionId)) return
      ptyBus.emit(`data:${sessionId}`, data)

      // Accumulate data for batched IPC send
      const existing = dataBuffers.get(sessionId) ?? ''
      dataBuffers.set(sessionId, existing + data)

      // Schedule flush once per event loop tick
      if (!flushScheduled.get(sessionId)) {
        flushScheduled.set(sessionId, true)
        setImmediate(() => {
          flushScheduled.delete(sessionId)
          // REL-3: Guard against firing after session was killed
          if (!sessions.has(sessionId)) {
            dataBuffers.delete(sessionId)
            return
          }
          const buffered = dataBuffers.get(sessionId)
          if (!buffered) return
          dataBuffers.delete(sessionId)

          // Send batched data to renderer
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send(`pty:data:${sessionId}`, buffered)
          }

          // Parse activity from the batched buffer (off the per-chunk hot path)
          let lineBuffer = lineBuffers.get(sessionId) ?? ''
          lineBuffer += buffered
          if (lineBuffer.length > 8192) {
            lineBuffer = lineBuffer.slice(-8192)
          }
          // Handle bare \r as line overwrite (progress bars, spinners) — only \n completes a line
          // First, process \r within lines: keep only the text after the last \r (overwrite semantics)
          lineBuffer = lineBuffer.replace(/[^\n]*\r(?!\n)/g, '')
          const parts = lineBuffer.split('\n')
          lineBuffers.set(sessionId, parts[parts.length - 1] ?? '')

          for (let i = 0; i < parts.length - 1; i++) {
            const line = parts[i] ?? ''
            const parsed = parseActivityLine(line)
            if (parsed && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(`pty:activity:${sessionId}`, {
                id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: parsed.type,
                title: parsed.title,
                detail: parsed.detail,
                status: 'done',
                timestamp: Date.now(),
              })
            }
          }
        })
      }
    })

    proc.onExit(({ exitCode }) => {
      log.info(`Session ${sessionId} exited`, { exitCode })
      sessions.delete(sessionId)
      /* Fix 2 (LEAK-1): Clean up lineBuffers on natural exit */
      lineBuffers.delete(sessionId)
      dataBuffers.delete(sessionId)
      flushScheduled.delete(sessionId)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, exitCode)
      }
      ptyBus.emit(`exit:${sessionId}`, exitCode)
    })
  }

  function write(sessionId: string, data: string): void {
    const proc = sessions.get(sessionId)
    if (proc) proc.write(data)
  }

  function hasSession(sessionId: string): boolean {
    return sessions.has(sessionId)
  }

  function resize(sessionId: string, cols: number, rows: number): void {
    const proc = sessions.get(sessionId)
    if (!proc) return
    const safeCols = Math.max(1, cols)
    const safeRows = Math.max(1, rows)
    proc.resize(safeCols, safeRows)
  }

  function kill(sessionId: string): void {
    /* Fix 4 (PTY-3): Cancel pending spawn timer on kill */
    const timer = spawnTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      spawnTimers.delete(sessionId)
    }
    const proc = sessions.get(sessionId)
    if (proc) {
      // Remove from maps BEFORE killing to prevent re-entrant callbacks
      sessions.delete(sessionId)
      lineBuffers.delete(sessionId)
      dataBuffers.delete(sessionId)
      flushScheduled.delete(sessionId)
      let killed = false
      try {
        proc.kill()
        killed = true
        log.info(`Killed session ${sessionId}`)
      } catch (err) {
        log.error(`Error killing PTY for session ${sessionId}`, { err: String(err) })
      }
      // Emit a synthetic exit so any `ptyBus.once('exit:*')` listeners (e.g. the
      // review-tracker registration in ipc-pty) don't linger. node-pty's onExit
      // usually fires too, but the `once` semantics collapse duplicate emissions.
      if (!killed) ptyBus.emit(`exit:${sessionId}`, -1)
    } else {
      // No live process; still emit so any stale `once` listener is consumed.
      ptyBus.emit(`exit:${sessionId}`, -1)
    }
  }

  function killAll(): void {
    const ids = [...sessions.keys()]
    log.info(`Killing all sessions (${ids.length} active)`)
    for (const id of ids) {
      kill(id)
    }
  }

  return { spawn, write, hasSession, resize, kill, killAll }
}
