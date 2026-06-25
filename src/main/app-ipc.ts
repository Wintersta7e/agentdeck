import type { BrowserWindow } from 'electron'
import type { PtyManager } from './pty-manager'
import { projectIdByPath, projectPathById, type AppStore } from './project-store'
import type { WorkflowEngine } from './workflow-engine'
import type { WorktreeManager } from './worktree-manager'
import type { SessionHistory } from './session-history'
import type { UsageHistory } from './usage-history'
import type { ReviewTracker } from './review-tracker'
import type { AgentRegistry } from './agent-registry'
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
  reviewTracker: ReviewTracker
  agentRegistry: AgentRegistry
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
  reviewTracker,
  agentRegistry,
}: RegisterAppIpcHandlersOptions): void {
  registerPtyHandlers(getPtyManager, {
    getMainWindow,
    getProjectId: (projectPath) => projectIdByPath(store, projectPath),
    reviewTracker,
    sessionHistory,
    usageHistory,
    agentRegistry,
  })
  registerWindowHandlers(getMainWindow, store)
  registerAgentHandlers(getMainWindow, store, agentRegistry)
  registerProjectHandlers(getMainWindow, getAppStore)
  registerSkillHandlers()
  registerWorkflowHandlers(
    getWorkflowEngine,
    agentRegistry,
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
  registerHomeHandlers((projectId) => projectPathById(store, projectId), reviewTracker)
}
