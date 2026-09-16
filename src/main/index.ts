import { CH } from '../shared/ipc-channels'
import { app, safeStorage, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { PtyManager } from './pty-manager'
import {
  createProjectStore,
  registerStoreHandlers,
  projectPathById,
  type AppStore,
} from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import type { TemplateStore } from './template-store'
import { initGitStatusCache, flushGitStatusCache } from './git-status'
import { initLogger, createLogger, closeLogger } from './logger'
import { seedWorkflows } from './workflow-seeds'
import type { WorkflowEngine } from './workflow-engine'
import { createWorktreeProvider, type WorktreeProvider } from './worktree-provider'
import { createUsageHistory } from './usage-history'
import { createSessionHistory } from './session-history'
import { ptyBus } from './pty-bus'
import { createAppWindow } from './app-window'
import { registerAppIpcHandlers } from './app-ipc'
import { createReviewTracker } from './review-tracker'
import { AgentRegistry, type SecretCrypto } from './agent-registry'
import {
  registerUsageHandlers,
  registerLimitsHandlers,
  registerSessionHistoryHandlers,
  wireTemplateWindowEvents,
  registerEnvIpc,
  registerFilesIpc,
} from './ipc'
import { initializeTemplateRuntime } from './template-runtime'
import { initializeWorktreeManager } from './worktree-runtime'
import { publishWslAvailability, resolveWslHome } from './wsl-runtime'
import { getWindowsHostIp } from './wsl-utils'

const usageHistory = createUsageHistory(join(app.getPath('userData'), 'usage-history.json'))
const sessionHistory = createSessionHistory(join(app.getPath('userData'), 'session-history.json'))
const reviewTracker = createReviewTracker()
// safeStorage-backed crypto for custom-agent secret env. `available` is a getter
// so it's evaluated lazily (after the app is ready), never at module init.
const secretCrypto: SecretCrypto = {
  get available() {
    return safeStorage.isEncryptionAvailable()
  },
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (stored) => safeStorage.decryptString(Buffer.from(stored, 'base64')),
}
const agentRegistry = new AgentRegistry(join(app.getPath('userData'), 'agents.toml'), secretCrypto)
const log = createLogger('app')

// Feed every activity event to the per-session history record: any activity
// advances the active-time clock, and write events also bump the file count.
ptyBus.on('activity', (payload: { sessionId: string; type: string }) => {
  sessionHistory.noteActivity(payload.sessionId, payload.type)
})

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null
let worktreeProvider: WorktreeProvider | null = null
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
    log.info('App ready', { version: app.getVersion() })

    const registryLoad = agentRegistry.load()
    for (const warning of registryLoad.warnings) {
      log.warn('Agent registry', { warning })
    }

    // Warm the Windows-host IP cache so {{WINDOWS_HOST}} resolves on the first spawn.
    void getWindowsHostIp()

    appStore = createProjectStore()
    registerStoreHandlers(appStore)
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)

    const wslHome = await resolveWslHome()
    const storeForWorktrees = appStore
    worktreeProvider = createWorktreeProvider({
      // Re-resolve $HOME when startup couldn't: the first wsl.exe call after a
      // Windows boot can time out while the distro spins up.
      create: async () =>
        initializeWorktreeManager(storeForWorktrees, wslHome ?? (await resolveWslHome())),
      onReady: (mgr) => {
        mgr.pruneOrphans().catch((err: unknown) => {
          log.warn('Worktree prune failed', { err: String(err) })
        })
      },
    })

    const agentdeckRoot = wslHome ? `${wslHome}/.agentdeck` : app.getPath('userData')
    const templateRuntime = await initializeTemplateRuntime(appStore, agentdeckRoot)
    templateStore = templateRuntime.templateStore

    registerEnvIpc({
      claudeConfigDir: process.env['CLAUDE_CONFIG_DIR'] ?? null,
      codexHome: process.env['CODEX_HOME'] ?? null,
      agentdeckRoot,
      templateUserRoot: templateRuntime.templateUserRoot,
      getProjectPath: (id) => (appStore ? projectPathById(appStore, id) : null),
    })

    registerFilesIpc()

    registerAppIpcHandlers({
      store: appStore,
      getMainWindow: () => mainWindow,
      getAppStore: () => appStore,
      getPtyManager: () => ptyManager,
      getWorkflowEngine: () => workflowEngine,
      getWorktreeManager: () => worktreeProvider?.get() ?? Promise.resolve(null),
      sessionHistory,
      usageHistory,
      reviewTracker,
      agentRegistry,
    })

    const windowRuntime = createAppWindow(
      appStore,
      () => {
        mainWindow = null
      },
      agentRegistry,
    )
    mainWindow = windowRuntime.mainWindow
    ptyManager = windowRuntime.ptyManager
    workflowEngine = windowRuntime.workflowEngine
    log.info('Window created')

    if (templateStore) {
      templateEventsOff = wireTemplateWindowEvents(templateStore, () => mainWindow)
    }

    registerUsageHandlers(usageHistory)
    registerLimitsHandlers()
    registerSessionHistoryHandlers(sessionHistory)

    // Surface non-fatal agents.toml parse warnings (captured at load above,
    // before the window existed) to the renderer as a banner once it loads —
    // mirrors the safeStorage notice and the templates parse-error path.
    if (registryLoad.warnings.length > 0) {
      const warnings = registryLoad.warnings
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send(CH.agentsParseError, { warnings })
      })
    }

    // Warn renderer if encryption is unavailable (secrets stored as plaintext)
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('safeStorage encryption unavailable — secrets stored as plaintext')
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send(CH.securityEncryptionUnavailable)
      })
    }

    // Warm the manager so worktrees orphaned by previous sessions are pruned at
    // startup. If WSL isn't awake yet this resolves null and the provider
    // retries on the first session start instead of latching off for good.
    void worktreeProvider.get()

    publishWslAvailability(mainWindow)
  })
  .catch((err: unknown) => {
    log.error('Startup failed', { err: String(err) })
  })

app.on('before-quit', () => {
  log.info('App quitting')
  // killAll synchronously finalizes session records via the ptyBus exit listener
  // (FIX 2) — run it first so the subsequent flush persists completed records.
  workflowEngine?.stopAll()
  ptyManager?.killAll()
  sessionHistory.flush()
  usageHistory.flush()
  flushGitStatusCache()
  templateEventsOff?.()
  templateStore?.dispose()
  closeLogger()
})

app.on('window-all-closed', () => {
  app.quit()
})
