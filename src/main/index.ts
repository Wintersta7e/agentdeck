import { CH } from '../shared/ipc-channels'
import { app, safeStorage, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { PtyManager } from './pty-manager'
import { createProjectStore, registerStoreHandlers, type AppStore } from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import type { TemplateStore } from './template-store'
import { initGitStatusCache } from './git-status'
import { initLogger, createLogger, closeLogger } from './logger'
import { seedWorkflows } from './workflow-seeds'
import type { WorkflowEngine } from './workflow-engine'
import type { WorktreeManager } from './worktree-manager'
import { createCostTracker, type CostTracker } from './cost-tracker'
import { createCostHistory } from './cost-history'
import { createAppWindow } from './app-window'
import { registerAppIpcHandlers } from './app-ipc'
import { createClaudeAdapter, createCodexAdapter } from './log-adapters'
import {
  registerCostHandlers,
  wireTemplateWindowEvents,
  registerEnvIpc,
  registerFilesIpc,
} from './ipc'
import { initializeTemplateRuntime } from './template-runtime'
import { initializeWorktreeManager } from './worktree-runtime'
import { publishWslAvailability, resolveWslHome } from './wsl-runtime'

const costHistory = createCostHistory(join(app.getPath('userData'), 'cost-history.json'))
const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null
let worktreeManager: WorktreeManager | null = null
let costTracker: CostTracker | null = null
let templateStore: TemplateStore | null = null
let templateEventsOff: (() => void) | null = null

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack })
  if (workflowEngine) workflowEngine.stopAll()
  if (ptyManager) ptyManager.killAll()
  closeLogger()
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) })
})

app
  .whenReady()
  .then(async () => {
    initLogger()
    initGitStatusCache(app.getPath('userData'))
    log.info('App ready')

    appStore = createProjectStore()
    registerStoreHandlers(appStore)
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)

    const wslHome = await resolveWslHome()
    worktreeManager = await initializeWorktreeManager(appStore, wslHome)

    const agentdeckRoot = wslHome ? `${wslHome}/.agentdeck` : app.getPath('userData')
    const templateRuntime = await initializeTemplateRuntime(appStore, agentdeckRoot)
    templateStore = templateRuntime.templateStore

    registerEnvIpc({
      claudeConfigDir: process.env['CLAUDE_CONFIG_DIR'] ?? null,
      codexHome: process.env['CODEX_HOME'] ?? null,
      agentdeckRoot,
      templateUserRoot: templateRuntime.templateUserRoot,
      getProjectPath: (id) => appStore?.get('projects').find((p) => p.id === id)?.path ?? null,
    })

    registerFilesIpc()

    registerAppIpcHandlers({
      store: appStore,
      getMainWindow: () => mainWindow,
      getAppStore: () => appStore,
      getPtyManager: () => ptyManager,
      getWorkflowEngine: () => workflowEngine,
      getWorktreeManager: () => worktreeManager,
    })

    const windowRuntime = createAppWindow(appStore, () => {
      mainWindow = null
    })
    mainWindow = windowRuntime.mainWindow
    ptyManager = windowRuntime.ptyManager
    workflowEngine = windowRuntime.workflowEngine
    log.info('Window created')

    if (templateStore) {
      templateEventsOff = wireTemplateWindowEvents(templateStore, () => mainWindow)
    }

    if (mainWindow) {
      costTracker = createCostTracker(
        mainWindow,
        [createClaudeAdapter(), createCodexAdapter()],
        costHistory,
      )
    }

    registerCostHandlers(() => costTracker, costHistory)

    // Warn renderer if encryption is unavailable (secrets stored as plaintext)
    if (!safeStorage.isEncryptionAvailable() && mainWindow) {
      log.warn('safeStorage encryption unavailable — secrets stored as plaintext')
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send(CH.securityEncryptionUnavailable)
      })
    }

    // Prune orphaned worktrees from previous sessions (fire-and-forget).
    worktreeManager?.pruneOrphans().catch((err: unknown) => {
      log.warn('Worktree prune failed', { err: String(err) })
    })

    // If WSL was slow at startup and worktreeManager couldn't initialize,
    // retry once after a delay — by then WSL has usually warmed up from
    // other operations (agent detection, project listing). One retry only;
    // if it still fails the user is missing WSL2 or has a broken distro.
    if (!worktreeManager && appStore) {
      const capturedStore = appStore
      setTimeout(() => {
        void (async () => {
          if (worktreeManager) return
          const retryHome = await resolveWslHome()
          if (!retryHome) return
          const retryMgr = await initializeWorktreeManager(capturedStore, retryHome)
          if (retryMgr) {
            worktreeManager = retryMgr
            log.info('Worktree manager initialised on retry (WSL $HOME resolved late)')
            retryMgr.pruneOrphans().catch((err: unknown) => {
              log.warn('Worktree prune failed (late init)', { err: String(err) })
            })
          }
        })()
      }, 15_000)
    }

    if (mainWindow) {
      publishWslAvailability(mainWindow)
    }
  })
  .catch((err: unknown) => {
    log.error('Startup failed', { err: String(err) })
  })

app.on('before-quit', () => {
  log.info('App quitting')
  costHistory.flush()
  costTracker?.destroy()
  workflowEngine?.stopAll()
  ptyManager?.killAll()
  templateEventsOff?.()
  templateStore?.dispose()
  closeLogger()
})

app.on('window-all-closed', () => {
  app.quit()
})
