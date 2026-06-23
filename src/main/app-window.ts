import { CH } from '../shared/ipc-channels'
import { app, BrowserWindow, screen } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_STARTUP_BG, THEME_STARTUP_BG } from '../shared/themes'
import { createLogger } from './logger'
import { createPtyManager, type PtyManager } from './pty-manager'
import type { AgentRegistry } from './agent-registry'
import { toWslPath } from './wsl-utils'
import { createWorkflowEngine, type WorkflowEngine } from './workflow-engine'
import type { AppStore } from './project-store'

const log = createLogger('app-window')

export interface AppWindowRuntime {
  mainWindow: BrowserWindow
  ptyManager: PtyManager
  workflowEngine: WorkflowEngine
}

function getStartupBg(): string {
  try {
    const configPath = join(app.getPath('userData'), 'config.json')
    const raw = readFileSync(configPath, 'utf-8')
    const data = JSON.parse(raw) as { appPrefs?: { theme?: string } }
    const theme = data.appPrefs?.theme ?? ''
    return (THEME_STARTUP_BG as Record<string, string | undefined>)[theme] ?? DEFAULT_STARTUP_BG
  } catch {
    return DEFAULT_STARTUP_BG
  }
}

function installContentSecurityPolicy(mainWindow: BrowserWindow): void {
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
}

function installZoomBootstrap(mainWindow: BrowserWindow, store: AppStore): void {
  mainWindow.webContents.once('did-finish-load', () => {
    const prefs = store.get('appPrefs')
    let zoom = prefs?.zoomFactor ?? 1.0
    const DETECT_VERSION = 2
    const detected = prefs?.zoomAutoDetected
    const needsDetect = !detected || (typeof detected === 'number' && detected < DETECT_VERSION)
    if (needsDetect) {
      const display = screen.getPrimaryDisplay()
      if (display.size.width >= 3840 || display.scaleFactor >= 2) {
        zoom = 1.5
      }
      store.set('appPrefs', { ...prefs, zoomFactor: zoom, zoomAutoDetected: DETECT_VERSION })
    }
    if (zoom !== 1.0) mainWindow.webContents.setZoomFactor(zoom)
  })
}

function installFileDropBridge(mainWindow: BrowserWindow): void {
  const handleFileUrl = (url: string): void => {
    if (!url.startsWith('file://')) return
    let pathname = decodeURIComponent(new URL(url).pathname)
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
    const wslPath = toWslPath(pathname)
    log.info(`File drop intercepted: ${url} -> ${wslPath}`)
    mainWindow.webContents.send(CH.fileDropped, [wslPath])
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

function loadRenderer(mainWindow: BrowserWindow): void {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export function createAppWindow(
  store: AppStore,
  onClosed: (() => void) | undefined,
  agentRegistry: AgentRegistry,
): AppWindowRuntime {
  const mainWindow = new BrowserWindow({
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

  installContentSecurityPolicy(mainWindow)

  const ptyManager = createPtyManager(mainWindow, agentRegistry)
  const workflowEngine = createWorkflowEngine(
    ptyManager,
    mainWindow,
    agentRegistry,
    () => store.get('roles') ?? [],
  )

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  installZoomBootstrap(mainWindow, store)
  loadRenderer(mainWindow)

  const teardown = (): void => {
    workflowEngine.stopAll()
    ptyManager.killAll()
  }
  mainWindow.on('closed', () => {
    teardown()
    onClosed?.()
  })
  mainWindow.webContents.on('render-process-gone', teardown)

  installFileDropBridge(mainWindow)

  return { mainWindow, ptyManager, workflowEngine }
}
