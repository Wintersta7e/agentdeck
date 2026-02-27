import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore, type AppStore } from './project-store'
import { detectStack } from './detect-stack'
import { getDefaultDistro, wslPathToWindows } from './wsl-utils'
import { initLogger, createLogger } from './logger'

const log = createLogger('app')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let appStore: AppStore | null = null

const agentBinaries: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  aider: 'aider',
}

const ALLOWED_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md'])

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
      sandbox: false,
    },
  })

  ptyManager = createPtyManager(mainWindow)

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
}

function registerIpcHandlers(store: AppStore): void {
  /* ── PTY handlers ───────────────────────────────────────────────── */
  ipcMain.handle(
    'pty:spawn',
    (
      _,
      sessionId: string,
      cols: number,
      rows: number,
      projectPath?: string,
      startupCommands?: string[],
      env?: Record<string, string>,
      agent?: string,
      agentFlags?: string,
    ) => {
      ptyManager?.spawn(sessionId, cols, rows, projectPath, startupCommands, env, agent, agentFlags)
    },
  )
  ipcMain.handle('pty:write', (_, sessionId: string, data: string) => {
    ptyManager?.write(sessionId, data)
  })
  ipcMain.handle('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
    ptyManager?.resize(sessionId, cols, rows)
  })
  ipcMain.handle('pty:kill', (_, sessionId: string) => {
    ptyManager?.kill(sessionId)
  })

  /* ── Window controls ────────────────────────────────────────────── */
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  /* ── Zoom ─────────────────────────────────────────────────────────── */
  ipcMain.handle('zoom:get', () => store.get('appPrefs').zoomFactor)
  ipcMain.handle('zoom:set', (_, factor: number) => {
    const clamped = Math.round(Math.max(0.5, Math.min(2.5, factor)) * 10) / 10
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: clamped })
    mainWindow?.webContents.setZoomFactor(clamped)
    return clamped
  })
  ipcMain.handle('zoom:reset', () => {
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: 1.0 })
    mainWindow?.webContents.setZoomFactor(1.0)
    return 1.0
  })

  /* ── Theme ──────────────────────────────────────────────────────── */
  ipcMain.handle('theme:get', () => store.get('appPrefs').theme ?? '')
  ipcMain.handle('theme:set', (_, theme: string) => {
    const valid = ['', 'cyan', 'violet', 'ice']
    const safe = valid.includes(theme) ? theme : ''
    store.set('appPrefs', { ...store.get('appPrefs'), theme: safe })
    return safe
  })

  /* ── App info ─────────────────────────────────────────────────────── */
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:versions', () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))

  /* ── Agent detection (async, non-blocking) ──────────────────────── */
  ipcMain.handle('agents:check', async () => {
    const { execFile } = await import('child_process')
    const check = (bin: string): Promise<boolean> =>
      new Promise((resolve) => {
        execFile('wsl.exe', ['--', 'bash', '-lic', `which ${bin}`], { timeout: 5000 }, (err) =>
          resolve(!err),
        )
      })
    const entries = Object.entries(agentBinaries)
    const results = await Promise.all(entries.map(([, bin]) => check(bin)))
    return Object.fromEntries(entries.map(([name], i) => [name, results[i]]))
  })

  /* ── WSL username ─────────────────────────────────────────────── */
  ipcMain.handle('app:wslUsername', async () => {
    const { execFile } = await import('child_process')
    return new Promise<string>((resolve) => {
      execFile('wsl.exe', ['--', 'whoami'], { timeout: 5000 }, (err, stdout) => {
        resolve(err ? '' : stdout.trim())
      })
    })
  })

  /* ── Project utilities ──────────────────────────────────────────── */
  ipcMain.handle('projects:detectStack', (_, p: string, distro?: string) => {
    return detectStack(p, distro)
  })

  ipcMain.handle('projects:getDefaultDistro', () => {
    return getDefaultDistro()
  })

  ipcMain.handle('projects:readFile', async (_event, projectPath: string, filename: string) => {
    if (!ALLOWED_FILES.has(filename)) {
      throw new Error(`File not permitted: ${filename}`)
    }
    try {
      // Determine the Windows-readable path
      let windowsPath: string
      if (/^[A-Za-z]:/.test(projectPath)) {
        // Already a Windows path (e.g., E:\H\LocalAI)
        windowsPath = projectPath
      } else {
        // WSL path — convert to Windows
        const distro = getDefaultDistro()
        windowsPath = wslPathToWindows(projectPath, distro)
      }
      const filePath = path.join(windowsPath, filename)
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        return content
      } catch (firstErr) {
        // If UNC path via wsl.localhost failed, try wsl$ fallback
        if (windowsPath.startsWith('\\\\wsl.localhost\\')) {
          const fallbackPath = windowsPath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
          const fallbackFile = path.join(fallbackPath, filename)
          const content = await fs.promises.readFile(fallbackFile, 'utf-8')
          return content
        }
        throw firstErr
      }
    } catch (err) {
      // ENOENT is expected for optional files like AGENTS.md — don't log as error
      const errStr = String(err)
      if (errStr.includes('ENOENT')) {
        log.debug(`${filename} not found in ${projectPath}`)
      } else {
        log.error(`Failed to read ${filename} from ${projectPath}`, { err: errStr })
      }
      return null
    }
  })

  /* ── Dialogs ────────────────────────────────────────────────────── */
  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? null
  })
}

app.whenReady().then(() => {
  initLogger()
  log.info('App ready')
  appStore = createProjectStore()
  registerIpcHandlers(appStore)

  /* ── Renderer log relay ────────────────────────────────────────── */
  ipcMain.handle(
    'log:renderer',
    (_, level: string, mod: string, message: string, data?: unknown) => {
      const rendererLog = createLogger(`renderer:${mod}`)
      const methods: Record<string, (msg: string, d?: unknown) => void> = {
        info: rendererLog.info,
        warn: rendererLog.warn,
        error: rendererLog.error,
        debug: rendererLog.debug,
      }
      methods[level]?.(message, data)
    },
  )

  createWindow()
  log.info('Window created')
})

app.on('before-quit', () => {
  log.info('App quitting')
  ptyManager?.killAll()
})

app.on('window-all-closed', () => {
  app.quit()
})
