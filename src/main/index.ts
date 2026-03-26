import { app, BrowserWindow, dialog, screen } from 'electron'
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
    ptyManager?.killAll()
    mainWindow = null
  })

  mainWindow.webContents.on('render-process-gone', () => {
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

    // Check for WSL2 availability — show a helpful dialog if not installed
    try {
      const { execFileSync } = await import('child_process')
      execFileSync('wsl.exe', ['--status'], { timeout: 10000, stdio: 'pipe' })
    } catch {
      log.warn('WSL2 not detected — showing setup dialog')
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'WSL2 Required',
        message: 'Windows Subsystem for Linux (WSL2) was not detected.',
        detail:
          'AgentDeck requires WSL2 to run terminal sessions.\n\n' +
          'To install WSL2, open PowerShell as Administrator and run:\n' +
          '  wsl --install\n\n' +
          'Then restart your computer and launch AgentDeck again.\n\n' +
          'The app will continue to load, but terminal features will not work.',
      })
    }

    appStore = createProjectStore()
    seedTemplates(appStore)
    seedRoles(appStore)
    await seedWorkflows(appStore)
    registerIpcHandlers(appStore)

    createWindow()
    log.info('Window created')
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
