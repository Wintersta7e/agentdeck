import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('agentDeck', {
  pty: {
    spawn: (sessionId, cols, rows) =>
      ipcRenderer.invoke('pty:spawn', sessionId, cols, rows),
    write: (sessionId, data) =>
      ipcRenderer.invoke('pty:write', sessionId, data),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
    kill: (sessionId) =>
      ipcRenderer.invoke('pty:kill', sessionId),
    onData: (sessionId, cb) => {
      const channel = `pty:data:${sessionId}`
      const listener = (_, data) => cb(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (sessionId, cb) => {
      const channel = `pty:exit:${sessionId}`
      const listener = (_, exitCode) => cb(exitCode)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  }
})
