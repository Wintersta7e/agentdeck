import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, type AppStore } from './project-store'
import { seedTemplates, seedRoles } from './store-seeds'
import { toWslPath } from './wsl-utils'
import { initLogger, createLogger, closeLogger } from './logger'
import { seedWorkflows } from './workflow-seeds'
import { createWorkflowEngine } from './workflow-engine'
import type { WorkflowEngine } from './workflow-engine'
import {
  registerPtyHandlers,
  registerWindowHandlers,
  registerAgentHandlers,
  registerProjectHandlers,
  registerWorkflowHandlers,
  registerUtilHandlers,
  registerSkillHandlers,
} from './ipc'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let workflowEngine: WorkflowEngine | null = null
let appStore: AppStore | null = null

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
    backgroundColor: '#0d0e0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
    if (url.startsWith('file://')) {
      event.preventDefault()
      handleFileUrl(url)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleFileUrl(url)
    return { action: 'deny' }
  })
}

function registerIpcHandlers(store: AppStore): void {
  registerPtyHandlers(() => ptyManager)
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
}

app
  .whenReady()
  .then(async () => {
    initLogger()
    log.info('App ready')

    appStore = createProjectStore()
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)
    registerIpcHandlers(appStore)

    createWindow()
    log.info('Window created')

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
  workflowEngine?.stopAll()
  ptyManager?.killAll()
  closeLogger()
})

app.on('window-all-closed', () => {
  app.quit()
})
