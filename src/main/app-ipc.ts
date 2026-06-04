import type { BrowserWindow } from 'electron'
import type { PtyManager } from './pty-manager'
import type { AppStore } from './project-store'
import type { WorkflowEngine } from './workflow-engine'
import type { WorktreeManager } from './worktree-manager'
import type { SessionHistory } from './session-history'
import type { UsageHistory } from './usage-history'
import {
  registerPtyHandlers,
  registerWindowHandlers,
  registerAgentHandlers,
  registerProjectHandlers,
  registerWorkflowHandlers,
  registerUtilHandlers,
  registerSkillHandlers,
  registerWorktreeHandlers,
  registerHomeHandlers,
  reviewTracker,
} from './ipc'

interface RegisterAppIpcHandlersOptions {
  store: AppStore
  getMainWindow: () => BrowserWindow | null
  getAppStore: () => AppStore | null
  getPtyManager: () => PtyManager | null
  getWorkflowEngine: () => WorkflowEngine | null
  getWorktreeManager: () => WorktreeManager | null
  sessionHistory: SessionHistory
  usageHistory: UsageHistory
}

export function registerAppIpcHandlers({
  store,
  getMainWindow,
  getAppStore,
  getPtyManager,
  getWorkflowEngine,
  getWorktreeManager,
  sessionHistory,
  usageHistory,
}: RegisterAppIpcHandlersOptions): void {
  registerPtyHandlers(getPtyManager, {
    getMainWindow,
    getProjectId: (projectPath) => {
      const projects = store.get('projects') ?? []
      return projects.find((project) => project.path === projectPath)?.id ?? null
    },
    reviewTracker,
    sessionHistory,
    usageHistory,
  })
  registerWindowHandlers(getMainWindow, store)
  registerAgentHandlers(getMainWindow, store)
  registerProjectHandlers(getMainWindow, getAppStore)
  registerSkillHandlers()
  registerWorkflowHandlers(
    getWorkflowEngine,
    () => store.get('roles') ?? [],
    (role) => {
      const roles = store.get('roles') ?? []
      const idx = roles.findIndex((existing) => existing.id === role.id)
      if (idx >= 0) {
        roles[idx] = role
      } else {
        roles.push(role)
      }
      store.set('roles', roles)
    },
  )
  registerUtilHandlers()
  registerWorktreeHandlers(getWorktreeManager)
  registerHomeHandlers((projectId) => {
    const projects = store.get('projects') ?? []
    const project = projects.find((candidate) => candidate.id === projectId)
    return project?.path ?? null
  })
}
