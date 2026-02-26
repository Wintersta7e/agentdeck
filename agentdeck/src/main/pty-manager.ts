import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'

export interface PtyManager {
  spawn: (
    sessionId: string,
    cols: number,
    rows: number,
    startupCommands?: string[],
    env?: Record<string, string>,
  ) => void
  write: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  killAll: () => void
}

export function createPtyManager(mainWindow: BrowserWindow): PtyManager {
  const sessions = new Map<string, IPty>()

  function spawn(
    sessionId: string,
    cols: number,
    rows: number,
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

    if (startupCommands && startupCommands.length > 0) {
      setTimeout(() => {
        for (const cmd of startupCommands) {
          proc.write(cmd + '\n')
        }
      }, 500)
    }

    proc.onData((data) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${sessionId}`, data)
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
    }
  }

  function killAll(): void {
    for (const [id] of sessions) {
      kill(id)
    }
  }

  return { spawn, write, resize, kill, killAll }
}
