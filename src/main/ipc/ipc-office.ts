import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { SAFE_ID_RE } from '../validation'
import type { OfficeSessionRegistry } from '../office/office-session-registry'

const log = createLogger('ipc-office')

interface OfficeWindowManagerLike {
  open(): Promise<void>
  isEnabled(): boolean
}

interface RegisterDeps {
  windowManager: OfficeWindowManagerLike
  registry: Pick<OfficeSessionRegistry, 'hasActiveWorker'>
  getMainWindow: () => BrowserWindow | null
}

export function registerOfficeHandlers(deps: RegisterDeps): void {
  const { windowManager, registry, getMainWindow } = deps

  ipcMain.handle('office:open', async () => {
    if (!windowManager.isEnabled()) {
      log.warn('office:open rejected — feature disabled')
      throw new Error('Office feature is disabled in app preferences')
    }
    await windowManager.open()
  })

  ipcMain.handle('office:focus-session', async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) {
      log.warn('office:focus-session invalid sessionId', { sessionId })
      throw new Error('Invalid sessionId')
    }
    if (!registry.hasActiveWorker(sessionId)) {
      log.warn('office:focus-session for session with no active worker', { sessionId })
      return
    }
    const main = getMainWindow()
    if (!main) {
      log.warn('office:focus-session with no main window')
      return
    }
    if (main.isMinimized()) main.restore()
    main.focus()
    main.webContents.send('window:focus-session', sessionId)
  })

  log.info('Office IPC handlers registered')
}

export function unregisterOfficeHandlers(): void {
  ipcMain.removeHandler('office:open')
  ipcMain.removeHandler('office:focus-session')
}
