export type AgentType = 'claude-code' | 'codex' | 'aider' | (string & {})
export type StackBadge =
  | 'Java'
  | 'JS'
  | 'TS'
  | 'Python'
  | 'Rust'
  | 'Go'
  | '.NET'
  | 'C/C++'
  | 'Ruby'
  | 'PHP'
  | 'Kotlin'
  | 'Swift'
  | 'Dart'
  | 'Agent'
  | 'Other'

export interface StartupCommand {
  id: string
  value: string
}

export interface EnvVar {
  id: string
  key: string
  value: string
  secret: boolean
}

export interface ProjectIdentity {
  icon: string
  accentColor: string
}

export interface Project {
  id: string
  name: string
  path: string
  pinned?: boolean | undefined
  lastOpened?: number | undefined
  badge?: StackBadge | undefined
  attachedTemplates?: string[] | undefined
  wslDistro?: string | undefined
  notes?: string | undefined
  startupCommands?: StartupCommand[] | undefined
  envVars?: EnvVar[] | undefined
  agent?: AgentType | undefined
  agentFlags?: string | undefined
  contextFile?: string | undefined
  identity?: ProjectIdentity | undefined
  autoOpen?: boolean | undefined
  scrollbackLines?: number | undefined
  fontSize?: number | undefined
  shell?: string | undefined
}

export type TemplateCategory =
  | 'Orient'
  | 'Review'
  | 'Fix'
  | 'Test'
  | 'Refactor'
  | 'Debug'
  | 'Docs'
  | 'Git'

export interface Template {
  id: string
  name: string
  description: string
  content?: string | undefined
  category?: TemplateCategory | undefined
}

export type SessionStatus = 'starting' | 'running' | 'error' | 'exited'

export interface Session {
  id: string
  projectId: string
  status: SessionStatus
  startedAt: number
}

export type ViewType = 'home' | 'session' | 'wizard' | 'settings' | 'template-editor'

export type PaneLayout = 1 | 2 | 3

export interface ActivityEvent {
  id: string
  type: 'read' | 'write' | 'command' | 'tool' | 'think' | 'error'
  title: string
  detail: string
  status: 'done' | 'active' | 'pending'
  timestamp: number
}

export type RightPanelTab = 'context' | 'activity' | 'memory'

export interface DetectedStack {
  badge: StackBadge
  items: { label: string; detail: string }[]
  suggestedAgent: AgentType
  suggestedCommands: string[]
  contextFiles: string[]
}
