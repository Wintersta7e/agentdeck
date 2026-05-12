import { useEffect } from 'react'
import { TABS } from '../components/TopTabBar/TopTabBar'
import { useAppStore } from '../store/appStore'

interface UseGlobalShortcutsOptions {
  onNewTerminal: () => void
  onToggleShortcuts: () => void
}

function syncZoom(promise: Promise<number>): void {
  promise
    .then((zoomFactor) => useAppStore.getState().setZoomFactor(zoomFactor))
    .catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'app', 'Zoom IPC failed', { err: String(err) })
    })
}

export function useGlobalShortcuts({
  onNewTerminal,
  onToggleShortcuts,
}: UseGlobalShortcutsOptions): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        syncZoom(window.agentDeck.zoom.set(current + 0.1))
        return
      }

      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const current = useAppStore.getState().zoomFactor
        syncZoom(window.agentDeck.zoom.set(current - 0.1))
        return
      }

      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        syncZoom(window.agentDeck.zoom.reset())
        return
      }

      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        const state = useAppStore.getState()
        if (state.commandPaletteOpen) {
          state.closeCommandPalette()
        } else {
          state.openCommandPalette()
        }
        return
      }

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        useAppStore.getState().openWizard()
        return
      }

      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        onNewTerminal()
        return
      }

      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        onToggleShortcuts()
        return
      }

      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        useAppStore.getState().toggleRightPanel()
        return
      }

      if (e.ctrlKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        useAppStore.getState().setPaneLayout(Number(e.key) as 1 | 2 | 3)
        return
      }

      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const idx = Number(e.key) - 1
        const target = Number.isInteger(idx) && idx >= 0 ? TABS[idx]?.view : undefined
        if (target) {
          e.preventDefault()
          useAppStore.getState().setTab(target)
          return
        }
      }

      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const state = useAppStore.getState()
        const ids = Object.entries(state.sessions)
          .filter(([, session]) => session.status !== 'exited')
          .map(([id]) => id)
        if (ids.length === 0) return
        const currentIdx = state.activeSessionId ? ids.indexOf(state.activeSessionId) : -1
        const next = e.shiftKey
          ? (currentIdx - 1 + ids.length) % ids.length
          : (currentIdx + 1) % ids.length
        const nextId = ids[next]
        if (nextId) state.setActiveSession(nextId)
        return
      }

      if (e.key === 'Escape') {
        const state = useAppStore.getState()
        if (state.commandPaletteOpen) {
          return
        }
        if (state.currentView === 'wizard') {
          state.closeWizard()
        } else if (state.currentView === 'settings') {
          state.closeSettings()
        } else if (state.currentView === 'template-editor') {
          state.closeTemplateEditor()
        } else {
          state.openCommandPalette()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNewTerminal, onToggleShortcuts])
}
