import { contextBridge, ipcRenderer } from 'electron'
import type { OfficeSnapshot } from '../shared/office-types'

interface SubscribeHandlers {
  onSnapshot(snap: OfficeSnapshot): void
  onTheme(themeName: string): void
  onDisplayMetricsChanged(): void
}

type ListenerEntry = {
  snapshot: (event: unknown, snap: OfficeSnapshot) => void
  theme: (event: unknown, name: string) => void
  dpi: () => void
}

let activeListeners: ListenerEntry | null = null

function subscribe(handlers: SubscribeHandlers): void {
  // Replace previous handlers if called twice
  if (activeListeners) {
    ipcRenderer.off('office:snapshot', activeListeners.snapshot)
    ipcRenderer.off('office:theme', activeListeners.theme)
    ipcRenderer.off('office:display-metrics-changed', activeListeners.dpi)
  }
  const snapshotListener = (_event: unknown, snap: OfficeSnapshot): void =>
    handlers.onSnapshot(snap)
  const themeListener = (_event: unknown, name: string): void => handlers.onTheme(name)
  const dpiListener = (): void => handlers.onDisplayMetricsChanged()
  ipcRenderer.on('office:snapshot', snapshotListener)
  ipcRenderer.on('office:theme', themeListener)
  ipcRenderer.on('office:display-metrics-changed', dpiListener)
  activeListeners = { snapshot: snapshotListener, theme: themeListener, dpi: dpiListener }
}

function unsubscribe(): void {
  if (!activeListeners) return
  ipcRenderer.off('office:snapshot', activeListeners.snapshot)
  ipcRenderer.off('office:theme', activeListeners.theme)
  ipcRenderer.off('office:display-metrics-changed', activeListeners.dpi)
  activeListeners = null
}

// SEC-05: Validate before IPC round-trip (defense-in-depth, main handler also validates)
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

async function focusSession(sessionId: string): Promise<void> {
  if (typeof sessionId !== 'string' || !SAFE_ID_RE.test(sessionId)) return
  await ipcRenderer.invoke('office:focus-session', sessionId)
}

contextBridge.exposeInMainWorld('agentDeckOffice', {
  subscribe,
  unsubscribe,
  focusSession,
})
