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

const VALID_THEMES = new Set(['', 'phosphor', 'dusk'])

/**
 * Legacy theme IDs from the v5.x palette, mapped to their closest v6.0.0
 * successors. Warm themes lean toward `dusk`, cool toward `phosphor`, and
 * the four light palettes fall back to the default tungsten (`''`) since
 * there is no light variant in the current set.
 */
const LEGACY_THEME_MAP: Record<string, string> = {
  amber: 'dusk',
  cyan: 'phosphor',
  violet: 'dusk',
  ice: 'phosphor',
  parchment: '',
  fog: '',
  lavender: '',
  stone: '',
}

function normaliseTheme(raw: string | undefined): { safe: string; migratedFrom: string | null } {
  if (!raw) return { safe: '', migratedFrom: null }
  if (VALID_THEMES.has(raw)) return { safe: raw, migratedFrom: null }
  if (raw in LEGACY_THEME_MAP) {
    return { safe: LEGACY_THEME_MAP[raw] ?? '', migratedFrom: raw }
  }
  return { safe: '', migratedFrom: null }
}

export function registerWindowHandlers(
  getWindow: () => BrowserWindow | null,
  store: AppStore,
): void {
  /* ── One-shot theme migration from v5.x palettes ─────────────────
   * Runs exactly once per upgraded install. If a legacy theme value is
   * persisted, coerce it to its successor, persist the normalised value,
   * and stash the before/after so the renderer can surface a one-line
   * toast on first boot after the upgrade.
   */
  let pendingThemeMigration: { from: string; to: string } | null = null
  const prefs = store.get('appPrefs')
  if (!prefs.themeMigrated) {
    const { safe, migratedFrom } = normaliseTheme(prefs.theme)
    if (migratedFrom) {
      pendingThemeMigration = { from: migratedFrom, to: safe }
    }
    store.set('appPrefs', { ...prefs, theme: safe, themeMigrated: true })
  }

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
    const { safe } = normaliseTheme(theme)
    store.set('appPrefs', { ...store.get('appPrefs'), theme: safe })
    return safe
  })
  /**
   * Renderer polls this once on mount. If the upgrade path migrated the
   * user's old palette, the renderer surfaces a single info toast and
   * the value is cleared so it never fires twice.
   */
  ipcMain.handle('theme:popMigration', () => {
    const migration = pendingThemeMigration
    pendingThemeMigration = null
    return migration
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
