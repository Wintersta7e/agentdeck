import pty from 'node-pty'

export function createPtyManager(mainWindow) {
  const sessions = new Map()

  function spawn(sessionId, cols, rows) {
    if (sessions.has(sessionId)) {
      kill(sessionId)
    }

    let proc
    try {
      proc = pty.spawn('wsl.exe', ['--', '/bin/bash'], {
        name: 'xterm-256color',
        cols: cols ?? 80,
        rows: rows ?? 24,
        cwd: process.env.USERPROFILE,
        env: { ...process.env }
      })
    } catch (err) {
      console.error(`[pty-manager] Failed to spawn session ${sessionId}:`, err)
      throw err
    }

    sessions.set(sessionId, proc)

    proc.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${sessionId}`, data)
      }
    })

    proc.onExit(({ exitCode }) => {
      sessions.delete(sessionId)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${sessionId}`, exitCode)
      }
    })
  }

  function write(sessionId, data) {
    const proc = sessions.get(sessionId)
    if (proc) proc.write(data)
  }

  function resize(sessionId, cols, rows) {
    const proc = sessions.get(sessionId)
    if (proc) proc.resize(cols, rows)
  }

  function kill(sessionId) {
    const proc = sessions.get(sessionId)
    if (proc) {
      proc.kill()
      sessions.delete(sessionId)
    }
  }

  function killAll() {
    for (const [id] of sessions) {
      kill(id)
    }
  }

  return { spawn, write, resize, kill, killAll }
}
