import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('agentDeck', {
  pty: {
    spawn: (
      sessionId: string,
      cols: number,
      rows: number,
      projectPath?: string,
      startupCommands?: string[],
      env?: Record<string, string>,
      agent?: string,
      agentFlags?: string,
    ) =>
      ipcRenderer.invoke(
        'pty:spawn',
        sessionId,
        cols,
        rows,
        projectPath,
        startupCommands,
        env,
        agent,
        agentFlags,
      ),
    write: (sessionId: string, data: string) => ipcRenderer.invoke('pty:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke('pty:kill', sessionId),
    onData: (sessionId: string, cb: (data: string) => void) => {
      const channel = `pty:data:${sessionId}`
      const listener = (_event: Electron.IpcRendererEvent, data: string): void => cb(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (sessionId: string, cb: (exitCode: number) => void) => {
      const channel = `pty:exit:${sessionId}`
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number): void => cb(exitCode)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onActivity: (sessionId: string, cb: (event: unknown) => void) => {
      const channel = `pty:activity:${sessionId}`
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => cb(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
  window: {
    close: () => ipcRenderer.invoke('window:close'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
  },
  zoom: {
    get: () => ipcRenderer.invoke('zoom:get') as Promise<number>,
    set: (factor: number) => ipcRenderer.invoke('zoom:set', factor) as Promise<number>,
    reset: () => ipcRenderer.invoke('zoom:reset') as Promise<number>,
  },
  store: {
    getProjects: () => ipcRenderer.invoke('store:getProjects'),
    saveProject: (project: unknown) => ipcRenderer.invoke('store:saveProject', project),
    deleteProject: (id: string) => ipcRenderer.invoke('store:deleteProject', id),
    getTemplates: () => ipcRenderer.invoke('store:getTemplates'),
    saveTemplate: (template: unknown) => ipcRenderer.invoke('store:saveTemplate', template),
    deleteTemplate: (id: string) => ipcRenderer.invoke('store:deleteTemplate', id),
  },
  agents: {
    check: () => ipcRenderer.invoke('agents:check') as Promise<Record<string, boolean>>,
  },
  projects: {
    detectStack: (path: string, distro?: string) =>
      ipcRenderer.invoke('projects:detectStack', path, distro),
    getDefaultDistro: () => ipcRenderer.invoke('projects:getDefaultDistro'),
    readProjectFile: (projectPath: string, filename: string) =>
      ipcRenderer.invoke('projects:readFile', projectPath, filename) as Promise<string | null>,
  },
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  log: {
    send: (level: string, mod: string, message: string, data?: unknown) =>
      ipcRenderer.invoke('log:renderer', level, mod, message, data),
  },
})
