import { app, BrowserWindow, safeStorage, screen } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, type AppStore } from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import { toWslPath } from './wsl-utils'
import { initGitStatusCache } from './git-status'
import { initLogger, createLogger, closeLogger } from './logger'
import { seedWorkflows } from './workflow-seeds'
import { createWorkflowEngine } from './workflow-engine'
import type { WorkflowEngine } from './workflow-engine'
import { createWorktreeManager, type WorktreeManager } from './worktree-manager'
import { createWslGitPort } from './git-port'
import { createCostTracker, type CostTracker } from './cost-tracker'

/** Read persisted theme at startup to match BrowserWindow background to the active theme */
const THEME_BG0: Record<string, string> = {
  '': '#0d0e0f',
  amber: '#0d0e0f',
  cyan: '#080b14',
  violet: '#0a0a12',
  ice: '#0c0d10',
  parchment: '#f5f0e8',
  fog: '#f0f4f8',
  lavender: '#f4f2f8',
  stone: '#f2f1ef',
}
function getStartupBg(): string {
  try {
    const configPath = join(app.getPath('userData'), 'config.json')
    const raw = readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw) as { appPrefs?: { theme?: string } }
    return THEME_BG0[data.appPrefs?.theme ?? ''] ?? '#0d0e0f'
  } catch {
    return '#0d0e0f'
  }
}
import { createClaudeAdapter, createCodexAdapter } from './log-adapters'
import { ptyBus } from './pty-bus'
import { getProjectByPath } from './project-store'
import {
  createOfficeSessionRegistry,
  type OfficeSessionRegistry,
} from './office/office-session-registry'
import { createOfficeAggregator, type OfficeAggregator } from './office/office-aggregator'
import { createOfficeWindowManager, type OfficeWindowManager } from './office/office-window-manager'
import { registerOfficeHandlers } from './ipc/ipc-office'
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
  registerCostHandlers,
  costHistory,
  reviewTracker,
} from './ipc'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null
let worktreeManager: WorktreeManager | null = null
let costTracker: CostTracker | null = null
let officeRegistry: OfficeSessionRegistry | null = null
let officeAggregator: OfficeAggregator | null = null
let officeWindowManager: OfficeWindowManager | null = null

// --- Crash cleanup handlers (REL-4) ---
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: getStartupBg(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'",
        ],
      },
    })
  })

  ptyManager = createPtyManager(mainWindow)
  workflowEngine = createWorkflowEngine(ptyManager, mainWindow, () => appStore?.get('roles') ?? [])

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    const prefs = appStore?.get('appPrefs')
    let zoom = prefs?.zoomFactor ?? 1.0
    // Auto-detect high-DPI — re-trigger when detection version changes
    const DETECT_VERSION = 2
    const detected = prefs?.zoomAutoDetected
    const needsDetect = !detected || (typeof detected === 'number' && detected < DETECT_VERSION)
    if (needsDetect && mainWindow) {
      const display = screen.getPrimaryDisplay()
      // 4K (3840×2160+) or high scale factor → default to 1.5
      if (display.size.width >= 3840 || display.scaleFactor >= 2) {
        zoom = 1.5
      }
      appStore?.set('appPrefs', { ...prefs, zoomFactor: zoom, zoomAutoDetected: DETECT_VERSION })
    }
    if (zoom !== 1.0) mainWindow?.webContents.setZoomFactor(zoom)
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    workflowEngine?.stopAll()
    ptyManager?.killAll()
    mainWindow = null
  })

  mainWindow.webContents.on('render-process-gone', () => {
    workflowEngine?.stopAll()
    ptyManager?.killAll()
  })

  // Intercept file drops: the browser tries to navigate or open a new window
  // for the dropped file's file:// URL. Catch both pathways.
  const handleFileUrl = (url: string): void => {
    if (!url.startsWith('file://')) return
    let pathname = decodeURIComponent(new URL(url).pathname)
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
    const wslPath = toWslPath(pathname)
    log.info(`File drop intercepted: ${url} → ${wslPath}`)
    mainWindow?.webContents.send('file-dropped', [wslPath])
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    handleFileUrl(url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleFileUrl(url)
    return { action: 'deny' }
  })
}

function registerIpcHandlers(store: AppStore): void {
  registerPtyHandlers(() => ptyManager, {
    getMainWindow: () => mainWindow,
    getProjectId: (projectPath) => {
      const projects = store.get('projects') ?? []
      return projects.find((p: { path: string }) => p.path === projectPath)?.id ?? null
    },
    reviewTracker,
  })
  registerWindowHandlers(() => mainWindow, store)
  registerAgentHandlers(() => mainWindow, store)
  registerProjectHandlers(
    () => mainWindow,
    () => appStore,
  )
  registerSkillHandlers()
  registerWorkflowHandlers(
    () => workflowEngine,
    () => store.get('roles') ?? [],
    (role) => {
      const roles = store.get('roles') ?? []
      const idx = roles.findIndex((r) => r.id === role.id)
      if (idx >= 0) {
        roles[idx] = role
      } else {
        roles.push(role)
      }
      store.set('roles', roles)
    },
  )
  registerUtilHandlers()
  registerWorktreeHandlers(() => worktreeManager)
  registerHomeHandlers((projectId) => {
    const projects = store.get('projects') ?? []
    const project = projects.find((p: { id: string }) => p.id === projectId)
    return project?.path ?? null
  })
}

app
  .whenReady()
  .then(async () => {
    initLogger()
    initGitStatusCache(app.getPath('userData'))
    log.info('App ready')

    appStore = createProjectStore()
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)

    const gitPort = createWslGitPort()
    // Resolve WSL $HOME for worktree storage (can't use ~ — Node treats it literally)
    let wslHome: string | null = null
    try {
      const { execFile: execFileCb } = await import('child_process')
      wslHome = await new Promise<string>((resolve, reject) => {
        execFileCb(
          'wsl.exe',
          // R5-02: Use '--' separator consistent with all other WSL calls
          ['--', 'bash', '-lc', 'echo $HOME'],
          { timeout: 5000, encoding: 'utf-8' },
          (err, stdout) => {
            if (err) reject(err)
            else resolve(stdout.trim())
          },
        )
      })
    } catch (err) {
      log.warn('Could not resolve WSL $HOME — worktree isolation disabled', {
        err: String(err),
      })
    }

    const registryDir = join(app.getPath('userData'), 'worktree-registry')
    if (wslHome) {
      const wslWorktreeDir = `${wslHome}/.agentdeck/worktrees`
      worktreeManager = await createWorktreeManager(
        gitPort,
        (id) => {
          const projects = appStore?.get('projects') ?? []
          return projects.find((p) => p.id === id)?.path
        },
        registryDir,
        wslWorktreeDir,
      )
    } else {
      log.warn('Worktree manager not created — WSL $HOME unknown')
    }

    registerIpcHandlers(appStore)

    createWindow()
    log.info('Window created')

    if (mainWindow) {
      costTracker = createCostTracker(mainWindow, [createClaudeAdapter(), createCodexAdapter()])
    }

    registerCostHandlers(() => costTracker)

    // --- Office view modules ---
    if (mainWindow && costTracker && appStore) {
      const store = appStore
      const clock = { now: () => performance.now() }
      officeRegistry = createOfficeSessionRegistry({
        ptyBus,
        costTracker,
        projectStore: { getProjectByPath: (path: string) => getProjectByPath(store, path) },
        appStore: store,
        clock,
      })

      let windowManagerRef: OfficeWindowManager | null = null
      officeAggregator = createOfficeAggregator({
        registry: officeRegistry,
        clock,
        appStore: store,
        onSnapshot: (snap) => windowManagerRef?.pushSnapshot(snap),
      })

      officeWindowManager = createOfficeWindowManager({
        mainWindow,
        aggregator: officeAggregator,
        appStore: store,
        registry: officeRegistry,
      })
      windowManagerRef = officeWindowManager

      officeAggregator.startTimer()

      registerOfficeHandlers({
        windowManager: officeWindowManager,
        registry: officeRegistry,
        getMainWindow: () => mainWindow,
      })

      // Forward display metrics changes to office window
      screen.on('display-metrics-changed', () => {
        officeWindowManager?.pushDisplayMetricsChanged()
      })

      log.info('Office modules initialized')
    }

    // Warn renderer if encryption is unavailable (secrets stored as plaintext)
    if (!safeStorage.isEncryptionAvailable() && mainWindow) {
      log.warn('safeStorage encryption unavailable — secrets stored as plaintext')
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.send('security:encryption-unavailable')
      })
    }

    // Prune orphaned worktrees from previous sessions (fire-and-forget).
    worktreeManager?.pruneOrphans().catch((err: unknown) => {
      log.warn('Worktree prune failed', { err: String(err) })
    })

    // Check WSL2 availability asynchronously after the window is shown,
    // then push the result to the renderer via IPC.
    if (mainWindow) {
      const win = mainWindow
      const { execFile } = await import('child_process')
      execFile('wsl.exe', ['--status'], { timeout: 10_000 }, (err) => {
        if (err) {
          log.warn('WSL2 not detected', { err: String(err) })
          win.webContents.send('wsl:status', { available: false, error: String(err) })
        } else {
          log.info('WSL2 detected')
          win.webContents.send('wsl:status', { available: true })
        }
      })
    }
  })
  .catch((err: unknown) => {
    log.error('Startup failed', { err: String(err) })
  })

app.on('before-quit', () => {
  log.info('App quitting')
  officeAggregator?.dispose()
  officeRegistry?.dispose()
  officeWindowManager?.dispose()
  costHistory.flush()
  costTracker?.destroy()
  workflowEngine?.stopAll()
  ptyManager?.killAll()
  closeLogger()
})

app.on('window-all-closed', () => {
  app.quit()
})
