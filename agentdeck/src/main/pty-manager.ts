import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'
import { createLogger } from './logger'
import { ptyBus } from './pty-bus'
import { AGENT_BINARY_MAP, SAFE_FLAGS_RE } from '../shared/agents'

const log = createLogger('pty-manager')

/**
 * Map of agent name → npm package info for agents installed via npm.
 * Used to fix missing bin symlinks in WSL (npm global installs sometimes
 * lose their bin symlinks, causing the Windows-side binary to shadow the
 * newer WSL-installed version).
 */
const NPM_AGENT_PACKAGES: Record<string, { pkg: string; binEntry: string }> = {
  codex: { pkg: '@openai/codex', binEntry: 'bin/codex.js' },
}

function toWslPath(path: string): string {
  const match = path.match(/^([A-Za-z]):[/\\](.*)$/)
  if (match && match[1] && match[2] !== undefined) {
    const drive = match[1].toLowerCase()
    const rest = match[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`
  }
  return path
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
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  killAll: () => void
}

/* Fix 1 (PANEL-4): ANSI stripping + regex-based activity parsing */
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g

function parseActivityLine(line: string): { type: string; title: string; detail: string } | null {
  const clean = line.replace(ANSI_RE, '')
  if (/\bRead\b/i.test(clean)) return { type: 'read', title: 'Reading file', detail: clean.trim() }
  if (/\bWrit(?:e|ing)\b/i.test(clean))
    return { type: 'write', title: 'Writing file', detail: clean.trim() }
  if (/\b(?:Execute|Running|Bash)\b/i.test(clean))
    return { type: 'command', title: 'Running command', detail: clean.trim() }
  if (/\bTool\b/i.test(clean)) return { type: 'tool', title: 'Tool use', detail: clean.trim() }
  if (/\b[Tt]hinking\b/.test(clean)) return { type: 'think', title: 'Thinking', detail: '' }
  return null
}

export function createPtyManager(mainWindow: BrowserWindow): PtyManager {
  const sessions = new Map<string, IPty>()
  const lineBuffers = new Map<string, string>()
  /* Fix 4 (PTY-3): Track spawn timers so we can cancel on kill */
  const spawnTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

    const cwd = process.env['USERPROFILE'] ?? process.cwd()
    const mergedEnv = { ...process.env, ...env } as Record<string, string>

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
      commands.push(`cd "${wslPath}"`)
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
        // Send all commands as a single compound statement to avoid garbled output
        proc.write(commands.join(' && ') + '\n')
      }, 500)
      spawnTimers.set(sessionId, timer)
    }

    lineBuffers.set(sessionId, '')

    proc.onData((data) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${sessionId}`, data)
      }
      ptyBus.emit(`data:${sessionId}`, data)

      // Line-based activity parsing
      let buffer = (lineBuffers.get(sessionId) ?? '') + data
      /* Fix 3 (LEAK-4): Cap line buffer at 8KB */
      if (buffer.length > 8192) {
        buffer = buffer.slice(-8192)
      }
      const parts = buffer.split('\n')
      // Keep the incomplete last segment as the new buffer
      lineBuffers.set(sessionId, parts[parts.length - 1] ?? '')

      // Process all complete lines (everything except the last element)
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

    proc.onExit(({ exitCode }) => {
      log.info(`Session ${sessionId} exited`, { exitCode })
      sessions.delete(sessionId)
      /* Fix 2 (LEAK-1): Clean up lineBuffers on natural exit */
      lineBuffers.delete(sessionId)
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

  function resize(sessionId: string, cols: number, rows: number): void {
    const proc = sessions.get(sessionId)
    if (proc) proc.resize(cols, rows)
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
      try {
        proc.kill()
        log.info(`Killed session ${sessionId}`)
      } catch (err) {
        log.error(`Error killing PTY for session ${sessionId}`, { err: String(err) })
      }
    }
  }

  function killAll(): void {
    log.info(`Killing all sessions (${sessions.size} active)`)
    for (const [id] of sessions) {
      kill(id)
    }
  }

  return { spawn, write, resize, kill, killAll }
}
