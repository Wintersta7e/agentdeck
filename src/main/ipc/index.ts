/**
 * IPC handler barrel — channels registered here via registerXxxHandlers().
 *
 * The `store:*` channels are registered separately by `registerStoreHandlers`
 * exported from `project-store.ts`. createProjectStore is now pure data
 * access — wire `registerStoreHandlers(store)` in main/index.ts after
 * createProjectStore returns.
 */
export { registerPtyHandlers } from './ipc-pty'
export { registerWindowHandlers } from './ipc-window'
export { registerAgentHandlers } from './ipc-agents'
export { registerProjectHandlers } from './ipc-projects'
export { registerWorkflowHandlers } from './ipc-workflows'
export { registerUtilHandlers } from './ipc-utils'
export { registerSkillHandlers } from './ipc-skills'
export { registerWorktreeHandlers } from './ipc-worktree'
export { registerFilesIpc } from './ipc-files'
export { registerHomeHandlers, reviewTracker } from './ipc-home'
export { registerUsageHandlers } from './ipc-usage'
export { registerLimitsHandlers } from './ipc-limits'
export { registerSessionHistoryHandlers } from './ipc-sessions'
export {
  registerTemplateIpc,
  registerLegacyTemplateIpc,
  wireTemplateWindowEvents,
} from './ipc-templates'
export { registerEnvIpc } from './ipc-env'
