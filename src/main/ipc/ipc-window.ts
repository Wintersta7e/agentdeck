import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppStore } from '../project-store'

/**
 * Window/UI IPC handlers: window controls, zoom, theme, layout, app info.
 */

/** Allowed layout persistence keys. */
const LAYOUT_KEYS = new Set([
  'sidebarOpen',
  'sidebarWidth',
  'sidebarSections',
  'rightPanelWidth',
  'wfLogPanelWidth',
])

export function registerWindowHandlers(
  getWindow: () => BrowserWindow | null,
  store: AppStore,
): void {
  /* ── Window controls ────────────────────────────────────────────── */
  ipcMain.handle('window:close', () => getWindow()?.close())
  ipcMain.handle('window:minimize', () => getWindow()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = getWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  /* ── Zoom ─────────────────────────────────────────────────────────── */
  ipcMain.handle('zoom:get', () => store.get('appPrefs').zoomFactor)
  ipcMain.handle('zoom:set', (_, factor: number) => {
    const clamped = Math.round(Math.max(0.5, Math.min(2.5, factor)) * 10) / 10
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: clamped })
    getWindow()?.webContents.setZoomFactor(clamped)
    return clamped
  })
  ipcMain.handle('zoom:reset', () => {
    store.set('appPrefs', { ...store.get('appPrefs'), zoomFactor: 1.0 })
    getWindow()?.webContents.setZoomFactor(1.0)
    return 1.0
  })

  /* ── Theme ──────────────────────────────────────────────────────── */
  ipcMain.handle('theme:get', () => store.get('appPrefs').theme ?? '')
  ipcMain.handle('theme:set', (_, theme: string) => {
    const valid = ['', 'cyan', 'violet', 'ice', 'parchment', 'fog', 'lavender', 'stone']
    const safe = valid.includes(theme) ? theme : ''
    store.set('appPrefs', { ...store.get('appPrefs'), theme: safe })
    return safe
  })

  /* ── Layout persistence ───────────────────────────────────────── */
  ipcMain.handle('layout:get', () => {
    const p = store.get('appPrefs')
    return {
      sidebarOpen: p.sidebarOpen,
      sidebarWidth: p.sidebarWidth,
      sidebarSections: p.sidebarSections,
      rightPanelWidth: p.rightPanelWidth,
      wfLogPanelWidth: p.wfLogPanelWidth,
    }
  })
  ipcMain.handle('layout:set', (_, patch: Record<string, unknown>) => {
    const current = store.get('appPrefs')
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (!LAYOUT_KEYS.has(k)) continue
      if (k === 'sidebarOpen') {
        if (typeof v !== 'boolean') continue
      } else if (k === 'sidebarWidth' || k === 'rightPanelWidth' || k === 'wfLogPanelWidth') {
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 5000) continue
      } else if (k === 'sidebarSections') {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue
        if (!Object.values(v as Record<string, unknown>).every((val) => typeof val === 'boolean'))
          continue
      }
      filtered[k] = v
    }
    store.set('appPrefs', { ...current, ...filtered })
  })

  /* ── App info ─────────────────────────────────────────────────────── */
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:versions', () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))
}
