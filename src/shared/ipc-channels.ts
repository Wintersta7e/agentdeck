/**
 * Single source of truth for IPC channel names.
 *
 * Renames and typos go here in one place instead of being spread across
 * preload/main/renderer with no compile-time link. The renderer side imports
 * via `import { CH } from '../../shared/ipc-channels'` (etc.), main side via
 * `import { CH } from '../shared/ipc-channels'`, preload via `'../shared/ipc-channels'`.
 *
 * Dynamic per-session / per-workflow channels are exposed as factory functions
 * (see exports below `CH`).
 */

export const CH = {
  // ── Agents ──────────────────────────────────────────────────────────
  agentsCheck: 'agents:check',
  agentsCheckUpdates: 'agents:checkUpdates',
  agentsGetEffectiveContext: 'agents:getEffectiveContext',
  agentsGetEffectiveContextForLaunch: 'agents:getEffectiveContextForLaunch',
  agentsGetEffectiveContextForModel: 'agents:getEffectiveContextForModel',
  agentsGetOverrides: 'agents:getOverrides',
  agentsGetVisible: 'agents:getVisible',
  agentsSetContextOverride: 'agents:setContextOverride',
  agentsSetVisible: 'agents:setVisible',
  agentsUpdate: 'agents:update',
  agentsVersionInfo: 'agents:versionInfo',

  // ── App ─────────────────────────────────────────────────────────────
  appVersion: 'app:version',
  appVersions: 'app:versions',
  appWslUsername: 'app:wslUsername',

  // ── Clipboard / Dialog ─────────────────────────────────────────────
  clipboardReadFilePaths: 'clipboard:readFilePaths',
  dialogPickFolder: 'dialog:pickFolder',

  // ── Usage / productivity tracking ──────────────────────────────────
  usageGetHistory: 'usage:getHistory',
  limitsGetCodex: 'limits:getCodex',
  sessionsGetHistory: 'sessions:getHistory',

  // ── Env / Skills ───────────────────────────────────────────────────
  envGetAgentPaths: 'env:getAgentPaths',
  envGetAgentSnapshot: 'env:getAgentSnapshot',
  skillsList: 'skills:list',

  // ── File ops ───────────────────────────────────────────────────────
  fileDropped: 'file-dropped',
  filesListDir: 'files:listDir',
  filesOpenExternal: 'files:openExternal',

  // ── Home ───────────────────────────────────────────────────────────
  homeReviewsUpdated: 'home:reviewsUpdated',

  // ── Layout / Theme / Zoom ──────────────────────────────────────────
  layoutGet: 'layout:get',
  layoutSet: 'layout:set',
  themeGet: 'theme:get',
  themePopMigration: 'theme:popMigration',
  themeSet: 'theme:set',
  zoomGet: 'zoom:get',
  zoomReset: 'zoom:reset',
  zoomSet: 'zoom:set',

  // ── Log ────────────────────────────────────────────────────────────
  logRenderer: 'log:renderer',

  // ── Projects ───────────────────────────────────────────────────────
  projectsDetectStack: 'projects:detectStack',
  projectsDismissReview: 'projects:dismissReview',
  projectsGetDefaultDistro: 'projects:getDefaultDistro',
  projectsGitStatus: 'projects:gitStatus',
  projectsPendingReviews: 'projects:pendingReviews',
  projectsReadFile: 'projects:readFile',
  projectsRefreshMeta: 'projects:refreshMeta',

  // ── PTY (static) ───────────────────────────────────────────────────
  ptyKill: 'pty:kill',
  ptyResize: 'pty:resize',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',

  // ── Security ───────────────────────────────────────────────────────
  securityEncryptionUnavailable: 'security:encryption-unavailable',

  // ── Store (legacy electron-store keys) ─────────────────────────────
  storeDeleteProject: 'store:deleteProject',
  storeDeleteRole: 'store:deleteRole',
  storeGetProjects: 'store:getProjects',
  storeGetRoles: 'store:getRoles',
  storeGetTemplates: 'store:getTemplates',
  storeSaveProject: 'store:saveProject',
  storeSaveRole: 'store:saveRole',

  // ── Templates ──────────────────────────────────────────────────────
  templatesActivateProject: 'templates:activateProject',
  templatesChange: 'templates:change',
  templatesDelete: 'templates:delete',
  templatesIncrementUsage: 'templates:incrementUsage',
  templatesListAll: 'templates:listAll',
  templatesParseError: 'templates:parseError',
  templatesSave: 'templates:save',
  templatesSetPinned: 'templates:setPinned',

  // ── Window ─────────────────────────────────────────────────────────
  windowClose: 'window:close',
  windowMaximize: 'window:maximize',
  windowMinimize: 'window:minimize',

  // ── Workflow execution (per-run) ───────────────────────────────────
  workflowResume: 'workflow:resume',
  workflowRun: 'workflow:run',
  workflowStop: 'workflow:stop',

  // ── Workflows CRUD / import-export ────────────────────────────────
  workflowsDelete: 'workflows:delete',
  workflowsDeleteRun: 'workflows:deleteRun',
  workflowsDuplicate: 'workflows:duplicate',
  workflowsExport: 'workflows:export',
  workflowsGetRunning: 'workflows:getRunning',
  workflowsImport: 'workflows:import',
  workflowsList: 'workflows:list',
  workflowsListRuns: 'workflows:listRuns',
  workflowsLoad: 'workflows:load',
  workflowsRename: 'workflows:rename',
  workflowsSave: 'workflows:save',

  // ── Worktree ───────────────────────────────────────────────────────
  worktreeAcquire: 'worktree:acquire',
  worktreeDiscard: 'worktree:discard',
  worktreeInspect: 'worktree:inspect',
  worktreeKeep: 'worktree:keep',
  worktreeReleasePrimary: 'worktree:releasePrimary',

  // ── WSL ────────────────────────────────────────────────────────────
  wslStatus: 'wsl:status',
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]

// ── Dynamic channels ─────────────────────────────────────────────────
// PTY emits data / exit / activity events on per-session channels so the
// renderer can subscribe just to its current session(s) without filtering.
export const ptyDataChannel = (sessionId: string): string => `pty:data:${sessionId}`
export const ptyExitChannel = (sessionId: string): string => `pty:exit:${sessionId}`
export const ptyActivityChannel = (sessionId: string): string => `pty:activity:${sessionId}`

// Workflow engine emits run events on a per-workflow channel so multiple
// running workflows don't share a single event stream.
export const workflowEventChannel = (workflowId: string): string => `workflow:event:${workflowId}`
