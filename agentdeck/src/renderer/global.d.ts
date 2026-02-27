import type { ActivityEvent, DetectedStack, Project, Template } from '../shared/types'

declare global {
  interface Window {
    agentDeck: {
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
    }
  }
}

declare module '*.css'
