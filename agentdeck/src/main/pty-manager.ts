import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'

const AGENT_BINARIES: Record<string, string> = {
  'claude-code': 'claude',
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

/* Fix 6 (SEC-2): agentFlags validation pattern */
const SAFE_FLAGS_RE = /^[A-Za-z0-9 \-_=./:@,]*$/

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
    if (sessions.has(sessionId)) {
      kill(sessionId)
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
      console.error(`[pty-manager] Failed to spawn PTY for session ${sessionId}:`, err)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, -1)
      }
      return
    }

    sessions.set(sessionId, proc)

    // Build the full command sequence: cd to project dir, startup commands, then launch agent
    const commands: string[] = []
    if (projectPath) {
      const wslPath = toWslPath(projectPath)
      commands.push(`cd "${wslPath}"`)
    }
    if (startupCommands) {
      commands.push(...startupCommands)
    }

    /* Fix 6 (SEC-2): Validate agentFlags before use */
    let sanitizedFlags = agentFlags
    if (sanitizedFlags && !SAFE_FLAGS_RE.test(sanitizedFlags)) {
      console.error(`[pty-manager] Rejected unsafe agentFlags: ${sanitizedFlags}`)
      sanitizedFlags = undefined
    }

    if (agent) {
      const bin = AGENT_BINARIES[agent] ?? agent
      const agentCmd = sanitizedFlags ? `${bin} ${sanitizedFlags}` : bin
      commands.push(agentCmd)
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
      sessions.delete(sessionId)
      /* Fix 2 (LEAK-1): Clean up lineBuffers on natural exit */
      lineBuffers.delete(sessionId)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, exitCode)
      }
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
      proc.kill()
      sessions.delete(sessionId)
      lineBuffers.delete(sessionId)
    }
  }

  function killAll(): void {
    for (const [id] of sessions) {
      kill(id)
    }
  }

  return { spawn, write, resize, kill, killAll }
}
