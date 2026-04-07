/**
 * IPC handler barrel — 36 channels registered here via registerXxxHandlers().
 *
 * NOTE: 9 additional channels (store:getProjects, store:saveProject, etc.)
 * are self-registered inside createProjectStore() in project-store.ts.
 * Do NOT re-register those channels here — ipcMain.handle throws on
 * duplicate channel registration.
 */
export { registerPtyHandlers } from './ipc-pty'
export { registerWindowHandlers } from './ipc-window'
export { registerAgentHandlers } from './ipc-agents'
export { registerProjectHandlers } from './ipc-projects'
export { registerWorkflowHandlers } from './ipc-workflows'
export { registerUtilHandlers } from './ipc-utils'
export { registerSkillHandlers } from './ipc-skills'
export { registerWorktreeHandlers } from './ipc-worktree'
export { registerHomeHandlers } from './ipc-home'
