import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import { createPtyManager } from './pty-manager'
import { createProjectStore } from './project-store'
import { detectStack } from './detect-stack'
import { getDefaultDistro, wslPathToWindows } from './wsl-utils'

let mainWindow: BrowserWindow | null = null

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

  const ptyManager = createPtyManager(mainWindow)

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
    ) => {
      ptyManager.spawn(sessionId, cols, rows, projectPath, startupCommands, env)
    },
  )
  ipcMain.handle('pty:write', (_, sessionId: string, data: string) => {
    ptyManager.write(sessionId, data)
  })
  ipcMain.handle('pty:resize', (_, sessionId: string, cols: number, rows: number) => {
    ptyManager.resize(sessionId, cols, rows)
  })
  ipcMain.handle('pty:kill', (_, sessionId: string) => {
    ptyManager.kill(sessionId)
  })

  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('projects:detectStack', (_, path: string, distro?: string) => {
    return detectStack(path, distro)
  })

  ipcMain.handle('projects:getDefaultDistro', () => {
    return getDefaultDistro()
  })

  ipcMain.handle('projects:readFile', async (_event, projectPath: string, filename: string) => {
    try {
      const distro = getDefaultDistro()
      const windowsPath = wslPathToWindows(projectPath, distro)
      const filePath = path.join(windowsPath, filename)
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return content
    } catch {
      return null
    }
  })

  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.filePaths[0] ?? null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.webContents.setZoomFactor(1.2)
    mainWindow?.maximize()
    mainWindow?.show()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    ptyManager.killAll()
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createProjectStore()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
