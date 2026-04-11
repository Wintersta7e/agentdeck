import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { createLogger } from '../logger'
import type { OfficeAggregator } from './office-aggregator'
import type { OfficeSnapshot } from '../../shared/office-types'
import { loadOfficeWindowState, saveOfficeWindowState } from './office-window-state'
import type { AppStore } from '../project-store'

const log = createLogger('office-window-manager')

interface WindowManagerDeps {
  mainWindow: BrowserWindow
  aggregator: OfficeAggregator
  appStore: Pick<AppStore, 'get' | 'set'>
  registry: { hasActiveWorker(sessionId: string): boolean }
}

export interface OfficeWindowManager {
  open(): Promise<void>
  isEnabled(): boolean
  getWindow(): BrowserWindow | null
  pushSnapshot(snap: OfficeSnapshot): void
  pushTheme(themeName: string): void
  pushDisplayMetricsChanged(): void
  dispose(): void
}

const OFFICE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; img-src 'self' data:; connect-src 'none'"

export function createOfficeWindowManager(deps: WindowManagerDeps): OfficeWindowManager {
  const { mainWindow, aggregator, appStore } = deps
  let officeWindow: BrowserWindow | null = null
  let cspRegistered = false
  let openInFlight = false // BUG-01: guard against concurrent open() calls

  function isEnabled(): boolean {
    const prefs = appStore.get('appPrefs')
    return prefs?.officeEnabled !== false
  }

  function registerSessionHardening(): void {
    if (cspRegistered) return
    const officeSession = session.fromPartition('office')
    officeSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [OFFICE_CSP],
        },
      })
    })
    officeSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    cspRegistered = true
  }

  async function open(): Promise<void> {
    if (officeWindow && !officeWindow.isDestroyed()) {
      officeWindow.focus()
      return
    }

    // BUG-01: Prevent concurrent open() from creating two windows
    if (openInFlight) return
    openInFlight = true

    try {
      registerSessionHardening()

      const savedState = loadOfficeWindowState(appStore)
      const constructorOpts: Electron.BrowserWindowConstructorOptions = {
        width: savedState?.bounds?.width ?? 900,
        height: savedState?.bounds?.height ?? 650,
        minWidth: 600,
        minHeight: 400,
        title: 'AgentDeck Office',
        show: false,
        webPreferences: {
          preload: join(__dirname, '../preload/office.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          session: session.fromPartition('office'),
        },
      }
      if (savedState?.bounds) {
        constructorOpts.x = savedState.bounds.x
        constructorOpts.y = savedState.bounds.y
      }

      officeWindow = new BrowserWindow(constructorOpts)

      if (savedState?.maximized) {
        officeWindow.maximize()
      }

      // Navigation / popup hardening
      officeWindow.webContents.on('will-navigate', (event) => event.preventDefault())
      officeWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' as const }))

      // Load the office HTML — ARCH-02: catch load failures
      try {
        if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
          await officeWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/office.html`)
        } else {
          await officeWindow.loadFile(join(__dirname, '../renderer/office.html'))
        }
      } catch (loadErr) {
        log.error('Failed to load office renderer', { err: String(loadErr) })
        if (officeWindow && !officeWindow.isDestroyed()) {
          officeWindow.destroy()
        }
        officeWindow = null
        return
      }

      // loadFile/loadURL await resolves after page load completes,
      // so did-finish-load has already fired — do theme/show/resume inline.
      if (!officeWindow || officeWindow.isDestroyed()) return
      const prefs = appStore.get('appPrefs')
      const theme = prefs?.theme ?? 'amber'
      officeWindow.webContents.send('office:theme', theme)
      officeWindow.show()
      aggregator.resume()
      log.info('Office window ready, aggregator resumed', { theme })

      // Pause/resume on hide/show
      officeWindow.on('hide', () => aggregator.pause())
      officeWindow.on('minimize', () => aggregator.pause())
      officeWindow.on('show', () => aggregator.resume())
      officeWindow.on('restore', () => aggregator.resume())

      // Save state before close
      officeWindow.on('close', () => {
        if (officeWindow && !officeWindow.isDestroyed()) {
          saveOfficeWindowState(appStore, officeWindow)
        }
      })

      officeWindow.on('closed', () => {
        aggregator.pause()
        officeWindow = null
        log.info('Office window closed')
      })
    } finally {
      openInFlight = false
    }
  }

  // LEAK-01: Store the listener so dispose() can remove it
  const mainClosedListener = (): void => {
    if (officeWindow && !officeWindow.isDestroyed()) {
      officeWindow.close()
    }
  }
  mainWindow.on('closed', mainClosedListener)

  function pushSnapshot(snap: OfficeSnapshot): void {
    if (!officeWindow || officeWindow.isDestroyed()) return
    officeWindow.webContents.send('office:snapshot', snap)
  }

  function pushTheme(themeName: string): void {
    if (!officeWindow || officeWindow.isDestroyed()) return
    officeWindow.webContents.send('office:theme', themeName)
  }

  function pushDisplayMetricsChanged(): void {
    if (!officeWindow || officeWindow.isDestroyed()) return
    officeWindow.webContents.send('office:display-metrics-changed')
  }

  function dispose(): void {
    // LEAK-01: Remove the listener from mainWindow
    mainWindow.removeListener('closed', mainClosedListener)
    if (officeWindow && !officeWindow.isDestroyed()) {
      officeWindow.close()
    }
    officeWindow = null
  }

  return {
    open,
    isEnabled,
    getWindow: () => officeWindow,
    pushSnapshot,
    pushTheme,
    pushDisplayMetricsChanged,
    dispose,
  }
}
