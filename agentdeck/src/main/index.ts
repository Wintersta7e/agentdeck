import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager, type PtyManager } from './pty-manager'
import { createProjectStore } from './project-store'
import { detectStack } from './detect-stack'
import { getDefaultDistro, wslPathToWindows } from './wsl-utils'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null

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

function registerIpcHandlers(): void {
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
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return content
    } catch (err) {
      console.error(`[readFile] Failed to read ${filename} from ${projectPath}:`, err)
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
  createProjectStore()
  registerIpcHandlers()
  createWindow()
})

app.on('before-quit', () => {
  ptyManager?.killAll()
})

app.on('window-all-closed', () => {
  app.quit()
})
