export interface Project {
  id: string
  name: string
  path: string
  pinned?: boolean | undefined
  lastOpened?: number | undefined
  badge?: string | undefined
  attachedTemplates?: string[] | undefined
}

export interface Template {
  id: string
  name: string
  description: string
  content?: string | undefined
}

export type SessionStatus = 'starting' | 'running' | 'error' | 'exited'

export interface Session {
  id: string
  projectId: string
  status: SessionStatus
  startedAt: number
}

export type ViewType = 'home' | 'session'
