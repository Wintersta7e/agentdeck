import type { ActivityEvent, DetectedStack, Project, Template } from '../shared/types'

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
        write: (sessionId: string, data: string) => Promise<void>
        resize: (sessionId: string, cols: number, rows: number) => Promise<void>
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
      store: {
        getProjects: () => Promise<Project[]>
        saveProject: (project: Partial<Project>) => Promise<Project>
        deleteProject: (id: string) => Promise<void>
        getTemplates: () => Promise<Template[]>
        saveTemplate: (template: Partial<Template>) => Promise<Template>
        deleteTemplate: (id: string) => Promise<void>
      }
      agents: {
        check: () => Promise<Record<string, boolean>>
        getVisible: () => Promise<string[] | null>
        setVisible: (agents: string[]) => Promise<string[]>
      }
      projects: {
        detectStack: (path: string, distro?: string) => Promise<DetectedStack | null>
        getDefaultDistro: () => Promise<string>
        readProjectFile: (projectPath: string, filename: string) => Promise<string | null>
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
        delete(id: string): Promise<void>
        run(id: string, path?: string): Promise<void>
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

interface Document {
  startViewTransition?: (callback: () => void) => ViewTransition
}

declare module '*.css'
