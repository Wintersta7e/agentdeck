import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActivityEvent,
  Role,
  Workflow,
  WorkflowExport,
  WorkflowMeta,
  WorkflowEvent,
  WorkflowRun,
} from '../shared/types'

// File drag-and-drop: accept drops visually (dragover), but let the default
// drop behavior trigger navigation to file:// URL. The main process intercepts
// via will-navigate and extracts the file path.
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

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
    write: (sessionId: string, data: string) => ipcRenderer.send('pty:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', sessionId, cols, rows),
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
    onActivity: (sessionId: string, cb: (event: ActivityEvent) => void) => {
      const channel = `pty:activity:${sessionId}`
      const handler = (_event: Electron.IpcRendererEvent, data: ActivityEvent): void => cb(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>,
    versions: () =>
      ipcRenderer.invoke('app:versions') as Promise<{
        electron: string
        chrome: string
        node: string
      }>,
    wslUsername: () => ipcRenderer.invoke('app:wslUsername') as Promise<string>,
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
  theme: {
    get: () => ipcRenderer.invoke('theme:get') as Promise<string>,
    set: (name: string) => ipcRenderer.invoke('theme:set', name) as Promise<string>,
  },
  layout: {
    get: () =>
      ipcRenderer.invoke('layout:get') as Promise<{
        sidebarOpen?: boolean
        sidebarWidth?: number
        sidebarSections?: { pinned?: boolean; templates?: boolean; workflows?: boolean }
        rightPanelWidth?: number
        wfLogPanelWidth?: number
      }>,
    set: (
      patch: Partial<{
        sidebarOpen: boolean
        sidebarWidth: number
        sidebarSections: { pinned?: boolean; templates?: boolean; workflows?: boolean }
        rightPanelWidth: number
        wfLogPanelWidth: number
      }>,
    ) => ipcRenderer.invoke('layout:set', patch),
  },
  store: {
    getProjects: () => ipcRenderer.invoke('store:getProjects'),
    saveProject: (project: unknown) => ipcRenderer.invoke('store:saveProject', project),
    deleteProject: (id: string) => ipcRenderer.invoke('store:deleteProject', id),
    getTemplates: () => ipcRenderer.invoke('store:getTemplates'),
    saveTemplate: (template: unknown) => ipcRenderer.invoke('store:saveTemplate', template),
    deleteTemplate: (id: string) => ipcRenderer.invoke('store:deleteTemplate', id),
    getRoles: () => ipcRenderer.invoke('store:getRoles') as Promise<Role[]>,
    saveRole: (role: unknown) => ipcRenderer.invoke('store:saveRole', role) as Promise<Role>,
    deleteRole: (id: string) => ipcRenderer.invoke('store:deleteRole', id) as Promise<void>,
  },
  agents: {
    check: () => ipcRenderer.invoke('agents:check') as Promise<Record<string, boolean>>,
    getVisible: () => ipcRenderer.invoke('agents:getVisible') as Promise<string[] | null>,
    setVisible: (agents: string[]) =>
      ipcRenderer.invoke('agents:setVisible', agents) as Promise<string[]>,
    checkUpdates: (installedAgents: Record<string, boolean>) =>
      ipcRenderer.invoke('agents:checkUpdates', installedAgents) as Promise<void>,
    update: (agentId: string) =>
      ipcRenderer.invoke('agents:update', agentId) as Promise<{
        agentId: string
        success: boolean
        newVersion: string | null
        message: string
      }>,
    onVersionInfo: (
      cb: (info: {
        agentId: string
        current: string | null
        latest: string | null
        updateAvailable: boolean
      }) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        info: {
          agentId: string
          current: string | null
          latest: string | null
          updateAvailable: boolean
        },
      ): void => cb(info)
      ipcRenderer.on('agents:versionInfo', handler)
      return () => ipcRenderer.removeListener('agents:versionInfo', handler)
    },
  },
  projects: {
    detectStack: (path: string, distro?: string) =>
      ipcRenderer.invoke('projects:detectStack', path, distro),
    getDefaultDistro: () => ipcRenderer.invoke('projects:getDefaultDistro'),
    readProjectFile: (projectPath: string, filename: string) =>
      ipcRenderer.invoke('projects:readFile', projectPath, filename) as Promise<string | null>,
    refreshMeta: (projectId: string) =>
      ipcRenderer.invoke('projects:refreshMeta', projectId) as Promise<
        import('../shared/types').ProjectMeta
      >,
  },
  skills: {
    list: (opts: { projectPath?: string; includeGlobal?: boolean }) =>
      ipcRenderer.invoke('skills:list', opts) as Promise<import('../shared/types').SkillInfo[]>,
  },
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  log: {
    send: (level: string, mod: string, message: string, data?: unknown) =>
      ipcRenderer.invoke('log:renderer', level, mod, message, data),
  },
  clipboard: {
    readFilePaths: () => ipcRenderer.invoke('clipboard:readFilePaths') as Promise<string[]>,
  },
  wsl: {
    onStatus: (cb: (data: { available: boolean; error?: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { available: boolean; error?: string },
      ): void => cb(data)
      ipcRenderer.on('wsl:status', listener)
      return () => ipcRenderer.removeListener('wsl:status', listener)
    },
  },
  security: {
    onEncryptionUnavailable: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('security:encryption-unavailable', listener)
      return () => ipcRenderer.removeListener('security:encryption-unavailable', listener)
    },
  },
  worktree: {
    acquire: (
      projectId: string,
      sessionId: string,
    ): Promise<{ path: string; isolated: boolean; branch?: string }> =>
      ipcRenderer.invoke('worktree:acquire', projectId, sessionId) as Promise<{
        path: string
        isolated: boolean
        branch?: string
      }>,
    inspect: (
      sessionId: string,
    ): Promise<{ hasChanges: boolean; hasUnmerged: boolean; branch: string }> =>
      ipcRenderer.invoke('worktree:inspect', sessionId) as Promise<{
        hasChanges: boolean
        hasUnmerged: boolean
        branch: string
      }>,
    discard: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('worktree:discard', sessionId) as Promise<void>,
    keep: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('worktree:keep', sessionId) as Promise<void>,
    releasePrimary: (projectId: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke('worktree:releasePrimary', projectId, sessionId) as Promise<void>,
  },
  onFileDrop: (cb: (wslPaths: string[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, wslPaths: string[]): void => cb(wslPaths)
    ipcRenderer.on('file-dropped', listener)
    return () => ipcRenderer.removeListener('file-dropped', listener)
  },
  workflows: {
    list: (): Promise<WorkflowMeta[]> => ipcRenderer.invoke('workflows:list'),
    load: (id: string): Promise<Workflow | null> => ipcRenderer.invoke('workflows:load', id),
    save: (w: Workflow): Promise<Workflow> => ipcRenderer.invoke('workflows:save', w),
    rename: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('workflows:rename', id, name),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workflows:delete', id),
    export: (id: string): Promise<WorkflowExport> =>
      ipcRenderer.invoke('workflows:export', id) as Promise<WorkflowExport>,
    import: (
      data: WorkflowExport,
      roleStrategy: Record<string, 'skip' | 'copy'>,
    ): Promise<{ workflow: Workflow; warnings: string[] }> =>
      ipcRenderer.invoke('workflows:import', data, roleStrategy) as Promise<{
        workflow: Workflow
        warnings: string[]
      }>,
    duplicate: (id: string): Promise<Workflow> =>
      ipcRenderer.invoke('workflows:duplicate', id) as Promise<Workflow>,
    listRuns: (workflowId: string): Promise<WorkflowRun[]> =>
      ipcRenderer.invoke('workflows:listRuns', workflowId),
    deleteRun: (runId: string): Promise<void> => ipcRenderer.invoke('workflows:deleteRun', runId),
    getRunning: (): Promise<string[]> =>
      ipcRenderer.invoke('workflows:getRunning') as Promise<string[]>,
    run: (id: string, path?: string, variables?: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke('workflow:run', id, path, variables),
    stop: (id: string): Promise<void> => ipcRenderer.invoke('workflow:stop', id),
    resume: (id: string, nodeId: string): Promise<void> =>
      ipcRenderer.invoke('workflow:resume', id, nodeId),
    onEvent: (workflowId: string, cb: (event: WorkflowEvent) => void): (() => void) => {
      if (typeof workflowId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(workflowId)) return () => {}
      const ch = `workflow:event:${workflowId}`
      const handler = (_: unknown, e: WorkflowEvent): void => cb(e)
      ipcRenderer.on(ch, handler)
      return () => ipcRenderer.removeListener(ch, handler)
    },
  },
})
