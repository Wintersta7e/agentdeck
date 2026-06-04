import type { ContextResult, SetContextOverrideArgs } from './context-types'
import type {
  ActivityEvent,
  AgentEnvSnapshot,
  CodexLimits,
  DailyUsageEntry,
  DetectedStack,
  GitStatus,
  LegacyTemplate,
  Project,
  ProjectMeta,
  ReviewItem,
  Role,
  SessionUsageRecord,
  SkillInfo,
  Template,
  TemplateDraft,
  TemplateScope,
  Workflow,
  WorkflowEvent,
  WorkflowExport,
  WorkflowMeta,
  WorkflowRun,
} from './types'

export type BridgeUnsubscribe = () => void

export interface AgentVersionInfo {
  agentId: string
  current: string | null
  latest: string | null
  updateAvailable: boolean
}

export interface AgentUpdateResult {
  agentId: string
  success: boolean
  newVersion: string | null
  message: string
}

export interface AgentDeckBridge {
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
    ) => Promise<{ ok: boolean; error?: string }>
    write: (sessionId: string, data: string) => Promise<{ ok: boolean; error?: string }>
    resize: (sessionId: string, cols: number, rows: number) => void
    kill: (sessionId: string) => Promise<void>
    onData: (sessionId: string, cb: (data: string) => void) => BridgeUnsubscribe
    onExit: (sessionId: string, cb: (exitCode: number) => void) => BridgeUnsubscribe
    onActivity: (sessionId: string, cb: (event: ActivityEvent) => void) => BridgeUnsubscribe
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
    popMigration: () => Promise<{ from: string; to: string } | null>
  }
  layout: {
    get: () => Promise<{
      rightPanelWidth?: number
      wfLogPanelWidth?: number
    }>
    set: (
      patch: Partial<{
        rightPanelWidth: number
        wfLogPanelWidth: number
      }>,
    ) => Promise<void>
  }
  store: {
    getProjects: () => Promise<Project[]>
    saveProject: (project: Partial<Project>) => Promise<Project>
    deleteProject: (id: string) => Promise<void>
    getTemplates: () => Promise<LegacyTemplate[]>
    getRoles: () => Promise<Role[]>
    saveRole: (role: Partial<Role>) => Promise<Role>
    deleteRole: (id: string) => Promise<void>
  }
  agents: {
    check: () => Promise<Record<string, boolean>>
    getVisible: () => Promise<string[] | null>
    setVisible: (agents: string[]) => Promise<string[]>
    checkUpdates: (installedAgents: Record<string, boolean>) => Promise<void>
    update: (agentId: string) => Promise<AgentUpdateResult>
    onVersionInfo: (cb: (info: AgentVersionInfo) => void) => BridgeUnsubscribe
    getEffectiveContext: (agentId: string) => Promise<ContextResult | { error: string }>
    getEffectiveContextForLaunch: (agentId: string) => Promise<ContextResult | { error: string }>
    getEffectiveContextForModel: (
      agentId: string,
      modelId: string,
    ) => Promise<ContextResult | { error: string }>
    setContextOverride: (
      args: SetContextOverrideArgs,
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    getOverrides: () => Promise<{
      agent: Record<string, number>
      model: Record<string, number>
    }>
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
    onStatus: (cb: (data: { available: boolean; error?: string }) => void) => BridgeUnsubscribe
  }
  security: {
    onEncryptionUnavailable: (cb: () => void) => BridgeUnsubscribe
  }
  worktree: {
    acquire: (
      projectId: string,
      sessionId: string,
    ) => Promise<{ path: string; isolated: boolean; branch?: string }>
    inspect: (
      sessionId: string,
    ) => Promise<{ hasChanges: boolean; hasUnmerged: boolean; branch: string }>
    discard: (sessionId: string) => Promise<void>
    keep: (sessionId: string) => Promise<void>
    releasePrimary: (projectId: string, sessionId: string) => Promise<void>
  }
  usage: {
    recordSession: (rec: SessionUsageRecord) => Promise<void>
    getHistory: (days: number) => Promise<DailyUsageEntry[]>
  }
  limits: {
    getCodex: () => Promise<CodexLimits | null>
  }
  home: {
    gitStatus: (projectId: string) => Promise<GitStatus | null>
    pendingReviews: (projectId: string) => Promise<ReviewItem[]>
    dismissReview: (reviewId: string) => Promise<void>
    onReviewsUpdated: (cb: (items: ReviewItem[]) => void) => BridgeUnsubscribe
  }
  pickFolder: () => Promise<string | null>
  log: {
    send: (level: string, mod: string, message: string, data?: unknown) => Promise<void>
  }
  clipboard: {
    readFilePaths: () => Promise<string[]>
  }
  onFileDrop: (cb: (wslPaths: string[]) => void) => BridgeUnsubscribe
  workflows: {
    list: () => Promise<WorkflowMeta[]>
    load: (id: string) => Promise<Workflow | null>
    save: (workflow: Workflow) => Promise<Workflow>
    rename: (id: string, name: string) => Promise<void>
    delete: (id: string) => Promise<void>
    export: (id: string) => Promise<WorkflowExport>
    import: (
      data: WorkflowExport,
      roleStrategy: Record<string, 'skip' | 'copy'>,
    ) => Promise<{
      workflow: Workflow
      warnings: string[]
    }>
    duplicate: (id: string) => Promise<Workflow>
    listRuns: (workflowId: string) => Promise<WorkflowRun[]>
    deleteRun: (runId: string) => Promise<void>
    getRunning: () => Promise<string[]>
    run: (id: string, path?: string, variables?: Record<string, string>) => Promise<void>
    stop: (id: string) => Promise<void>
    resume: (id: string, nodeId: string) => Promise<void>
    onEvent: (workflowId: string, cb: (event: WorkflowEvent) => void) => BridgeUnsubscribe
  }
  templates: {
    listAll: (input?: { projectId?: string }) => Promise<Template[]>
    activateProject: (projectId: string) => Promise<Template[]>
    save: (
      draft: TemplateDraft,
      scope: TemplateScope,
      projectId: string | null,
      baseMtime?: number,
    ) => Promise<Template>
    delete: (ref: { id: string; scope: TemplateScope; projectId: string | null }) => Promise<void>
    incrementUsage: (ref: {
      id: string
      scope: TemplateScope
      projectId: string | null
    }) => Promise<void>
    setPinned: (
      ref: { id: string; scope: TemplateScope; projectId: string | null },
      pinned: boolean,
    ) => Promise<void>
    onChange: (cb: (event: unknown) => void) => BridgeUnsubscribe
    onParseError: (cb: (event: { path: string; error: string }) => void) => BridgeUnsubscribe
  }
  env: {
    getAgentPaths: () => Promise<{
      claudeConfigDir: string | null
      codexHome: string | null
      agentdeckRoot: string
      templateUserRoot: string
    }>
    getAgentSnapshot: (opts: {
      agentId: string
      projectId?: string
      force?: boolean
    }) => Promise<AgentEnvSnapshot>
  }
  files: {
    listDir: (opts: { path: string; projectPath: string }) => Promise<{
      entries: Array<{ name: string; isDir: boolean }>
      gitignored: string[]
    }>
    openExternal: (opts: { path: string; projectPath: string }) => Promise<void>
  }
}
