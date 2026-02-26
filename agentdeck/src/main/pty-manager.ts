import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'

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
  ) => void
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  killAll: () => void
}

function parseActivityLine(line: string): { type: string; title: string; detail: string } | null {
  if (line.includes('Read') && (line.includes('file') || line.includes('File')))
    return { type: 'read', title: 'Reading file', detail: line.trim() }
  if (line.includes('Write') || line.includes('Writing'))
    return { type: 'write', title: 'Writing file', detail: line.trim() }
  if (line.includes('Execute') || line.includes('Running'))
    return { type: 'command', title: 'Running command', detail: line.trim() }
  if (line.includes('Tool')) return { type: 'tool', title: 'Tool use', detail: line.trim() }
  if (line.includes('Thinking') || line.includes('thinking'))
    return { type: 'think', title: 'Thinking', detail: '' }
  return null
}

export function createPtyManager(mainWindow: BrowserWindow): PtyManager {
  const sessions = new Map<string, IPty>()
  const lineBuffers = new Map<string, string>()

  function spawn(
    sessionId: string,
    cols: number,
    rows: number,
    projectPath?: string,
    startupCommands?: string[],
    env?: Record<string, string>,
  ): void {
    if (sessions.has(sessionId)) {
      kill(sessionId)
    }

    const cwd = process.env['USERPROFILE'] ?? process.cwd()
    const mergedEnv = { ...process.env, ...env } as Record<string, string>
    const proc = pty.spawn('wsl.exe', ['--', '/bin/bash'], {
      name: 'xterm-256color',
      cols: cols ?? 80,
      rows: rows ?? 24,
      cwd,
      env: mergedEnv,
    })

    sessions.set(sessionId, proc)

    // Build the full command sequence: cd to project dir, then startup commands
    const commands: string[] = []
    if (projectPath) {
      const wslPath = toWslPath(projectPath)
      commands.push(`cd "${wslPath}"`)
    }
    if (startupCommands) {
      commands.push(...startupCommands)
    }

    if (commands.length > 0) {
      setTimeout(() => {
        for (const cmd of commands) {
          proc.write(cmd + '\n')
        }
      }, 500)
    }

    lineBuffers.set(sessionId, '')

    proc.onData((data) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${sessionId}`, data)
      }

      // Line-based activity parsing
      const buffer = (lineBuffers.get(sessionId) ?? '') + data
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
