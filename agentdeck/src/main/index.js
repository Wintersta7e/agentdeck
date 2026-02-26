import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { createPtyManager } from './pty-manager'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0e0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const ptyManager = createPtyManager(mainWindow)

  // PTY IPC handlers
  ipcMain.handle('pty:spawn', (_, sessionId, cols, rows) => {
    ptyManager.spawn(sessionId, cols, rows)
  })
  ipcMain.handle('pty:write', (_, sessionId, data) => {
    ptyManager.write(sessionId, data)
  })
  ipcMain.handle('pty:resize', (_, sessionId, cols, rows) => {
    ptyManager.resize(sessionId, cols, rows)
  })
  ipcMain.handle('pty:kill', (_, sessionId) => {
    ptyManager.kill(sessionId)
  })

  // Load renderer
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
