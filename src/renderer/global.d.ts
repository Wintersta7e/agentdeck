import type {
  ActivityEvent,
  DailyCostEntry,
  DetectedStack,
  GitStatus,
  Project,
  ProjectMeta,
  ReviewItem,
  Role,
  SkillInfo,
  Template,
  TemplateCategory,
  TemplateDraft,
  TemplateScope,
  TokenUsage,
} from '../shared/types'
import type { ContextResult, SetContextOverrideArgs } from '../shared/context-types'

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
        write: (sessionId: string, data: string) => Promise<{ ok: boolean; error?: string }>
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
        // Legacy template store channels (pre-file-backed template IPC).
        // Narrow shape inlined here so the renderer has no dependency on
        // the deprecated LegacyTemplate type. Zero renderer callers today;
        // kept for backwards-compat with main-side migration paths.
        getTemplates: () => Promise<
          Array<{
            id: string
            name: string
            description: string
            content?: string | undefined
            category?: TemplateCategory | undefined
          }>
        >
        saveTemplate: (template: {
          id?: string
          name: string
          description: string
          content?: string | undefined
          category?: TemplateCategory | undefined
        }) => Promise<{
          id: string
          name: string
          description: string
          content?: string | undefined
          category?: TemplateCategory | undefined
        }>
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
        getEffectiveContext: (agentId: string) => Promise<ContextResult | { error: string }>
        getEffectiveContextForLaunch: (
          agentId: string,
        ) => Promise<ContextResult | { error: string }>
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
        onStatus: (cb: (data: { available: boolean; error?: string }) => void) => () => void
      }
      security: {
        onEncryptionUnavailable: (cb: () => void) => () => void
      }
      worktree: {
        acquire(
          projectId: string,
          sessionId: string,
        ): Promise<{ path: string; isolated: boolean; branch?: string }>
        inspect(
          sessionId: string,
        ): Promise<{ hasChanges: boolean; hasUnmerged: boolean; branch: string }>
        discard(sessionId: string): Promise<void>
        keep(sessionId: string): Promise<void>
        releasePrimary(projectId: string, sessionId: string): Promise<void>
      }
      cost: {
        bind(
          sessionId: string,
          opts: { agent: string; projectPath: string; cwd: string; spawnAt: number },
        ): Promise<void>
        unbind(sessionId: string): Promise<void>
        onUpdate(cb: (data: { sessionId: string; usage: TokenUsage }) => void): () => void
      }
      home: {
        gitStatus: (projectId: string) => Promise<GitStatus | null>
        pendingReviews: (projectId: string) => Promise<ReviewItem[]>
        dismissReview: (reviewId: string) => Promise<void>
        costHistory: (days: number) => Promise<DailyCostEntry[]>
        getBudget: () => Promise<number | null>
        setBudget: (amount: number | null) => Promise<void>
        onReviewsUpdated: (cb: (items: ReviewItem[]) => void) => () => void
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
      templates: {
        listAll: (input?: { projectId?: string }) => Promise<Template[]>
        activateProject: (projectId: string) => Promise<Template[]>
        save: (
          draft: TemplateDraft,
          scope: TemplateScope,
          projectId: string | null,
          baseMtime?: number,
        ) => Promise<Template>
        delete: (ref: {
          id: string
          scope: TemplateScope
          projectId: string | null
        }) => Promise<void>
        incrementUsage: (ref: {
          id: string
          scope: TemplateScope
          projectId: string | null
        }) => Promise<void>
        setPinned: (
          ref: { id: string; scope: TemplateScope; projectId: string | null },
          pinned: boolean,
        ) => Promise<void>
        onChange: (cb: (e: unknown) => void) => () => void
        onParseError: (cb: (e: { path: string; error: string }) => void) => () => void
      }
      env: {
        getAgentPaths: () => Promise<{
          claudeConfigDir: string | null
          codexHome: string | null
          agentdeckRoot: string
          templateUserRoot: string
        }>
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
