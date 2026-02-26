import type { DetectedStack, Project, Template } from '../shared/types'

declare global {
  interface Window {
    agentDeck: {
      pty: {
        spawn: (
          sessionId: string,
          cols: number,
          rows: number,
          startupCommands?: string[],
          env?: Record<string, string>,
        ) => Promise<void>
        write: (sessionId: string, data: string) => Promise<void>
        resize: (sessionId: string, cols: number, rows: number) => Promise<void>
        kill: (sessionId: string) => Promise<void>
        onData: (sessionId: string, cb: (data: string) => void) => () => void
        onExit: (sessionId: string, cb: (exitCode: number) => void) => () => void
      }
      window: {
        close: () => Promise<void>
        minimize: () => Promise<void>
        maximize: () => Promise<void>
      }
      store: {
        getProjects: () => Promise<Project[]>
        saveProject: (project: Partial<Project>) => Promise<Project>
        deleteProject: (id: string) => Promise<void>
        getTemplates: () => Promise<Template[]>
        saveTemplate: (template: Partial<Template>) => Promise<Template>
        deleteTemplate: (id: string) => Promise<void>
      }
      projects: {
        detectStack: (path: string, distro?: string) => Promise<DetectedStack | null>
        getDefaultDistro: () => Promise<string>
      }
      pickFolder: () => Promise<string | null>
    }
  }
}

declare module '*.css'
