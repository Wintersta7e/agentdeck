import type {
  ActivityEvent,
  DetectedStack,
  Project,
  ProjectMeta,
  Role,
  SkillInfo,
  Template,
} from '../shared/types'

declare global {
  interface Window {
    agentDeck: {
      app: {
        version: () => Promise<string>
        versions: () => Promise<{ electron: string; chrome: string; node: string }>
        wslUsername: () => Promise<string>
      }
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
        ) => Promise<void>
        write: (sessionId: string, data: string) => void
        resize: (sessionId: string, cols: number, rows: number) => void
        kill: (sessionId: string) => Promise<void>
        onData: (sessionId: string, cb: (data: string) => void) => () => void
        onExit: (sessionId: string, cb: (exitCode: number) => void) => () => void
        onActivity: (sessionId: string, cb: (event: ActivityEvent) => void) => () => void
      }
      window: {
        close: () => Promise<void>
        minimize: () => Promise<void>
        maximize: () => Promise<void>
      }
      zoom: {
        get: () => Promise<number>
        set: (factor: number) => Promise<number>
        reset: () => Promise<number>
      }
      theme: {
        get: () => Promise<string>
        set: (name: string) => Promise<string>
      }
      layout: {
        get: () => Promise<{
          sidebarOpen?: boolean
          sidebarWidth?: number
          sidebarSections?: { pinned?: boolean; templates?: boolean; workflows?: boolean }
          rightPanelWidth?: number
          wfLogPanelWidth?: number
        }>
        set: (
          patch: Partial<{
            sidebarOpen: boolean
            sidebarWidth: number
            sidebarSections: { pinned?: boolean; templates?: boolean; workflows?: boolean }
            rightPanelWidth: number
            wfLogPanelWidth: number
          }>,
        ) => Promise<void>
      }
      store: {
        getProjects: () => Promise<Project[]>
        saveProject: (project: Partial<Project>) => Promise<Project>
        deleteProject: (id: string) => Promise<void>
        getTemplates: () => Promise<Template[]>
        saveTemplate: (template: Partial<Template>) => Promise<Template>
        deleteTemplate: (id: string) => Promise<void>
        getRoles: () => Promise<Role[]>
        saveRole: (role: Partial<Role>) => Promise<Role>
        deleteRole: (id: string) => Promise<void>
      }
      agents: {
        check: () => Promise<Record<string, boolean>>
        getVisible: () => Promise<string[] | null>
        setVisible: (agents: string[]) => Promise<string[]>
        checkUpdates: (installedAgents: Record<string, boolean>) => Promise<void>
        update: (agentId: string) => Promise<{
          agentId: string
          success: boolean
          newVersion: string | null
          message: string
        }>
        onVersionInfo: (
          cb: (info: {
            agentId: string
            current: string | null
            latest: string | null
            updateAvailable: boolean
          }) => void,
        ) => () => void
      }
      projects: {
        detectStack: (path: string, distro?: string) => Promise<DetectedStack | null>
        getDefaultDistro: () => Promise<string>
        readProjectFile: (projectPath: string, filename: string) => Promise<string | null>
        refreshMeta: (projectId: string) => Promise<ProjectMeta>
      }
      skills: {
        list: (opts: { projectPath?: string; includeGlobal?: boolean }) => Promise<SkillInfo[]>
      }
      wsl: {
        onStatus: (cb: (data: { available: boolean; error?: string }) => void) => () => void
      }
      security: {
        onEncryptionUnavailable: (cb: () => void) => () => void
      }
      pickFolder: () => Promise<string | null>
      log: {
        send: (level: string, mod: string, message: string, data?: unknown) => Promise<void>
      }
      clipboard: {
        readFilePaths: () => Promise<string[]>
      }
      onFileDrop: (cb: (wslPaths: string[]) => void) => () => void
      workflows: {
        list(): Promise<import('../shared/types').WorkflowMeta[]>
        load(id: string): Promise<import('../shared/types').Workflow | null>
        save(w: import('../shared/types').Workflow): Promise<import('../shared/types').Workflow>
        rename(id: string, name: string): Promise<void>
        delete(id: string): Promise<void>
        export(id: string): Promise<import('../shared/types').WorkflowExport>
        import(
          data: import('../shared/types').WorkflowExport,
          roleStrategy: Record<string, 'skip' | 'copy'>,
        ): Promise<{
          workflow: import('../shared/types').Workflow
          warnings: string[]
        }>
        duplicate(id: string): Promise<import('../shared/types').Workflow>
        listRuns(workflowId: string): Promise<import('../shared/types').WorkflowRun[]>
        deleteRun(runId: string): Promise<void>
        getRunning(): Promise<string[]>
        run(id: string, path?: string, variables?: Record<string, string>): Promise<void>
        stop(id: string): Promise<void>
        resume(id: string, nodeId: string): Promise<void>
        onEvent(
          workflowId: string,
          cb: (event: import('../shared/types').WorkflowEvent) => void,
        ): () => void
      }
    }
  }
}

interface ViewTransition {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
}

interface StartViewTransitionOptions {
  update: () => void
  types?: string[]
}

interface Document {
  startViewTransition?: (
    callbackOrOptions: (() => void) | StartViewTransitionOptions,
  ) => ViewTransition
}

declare module '*.css'
