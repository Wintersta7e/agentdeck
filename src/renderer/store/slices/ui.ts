import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { ViewType, PaneLayout, RightPanelTab } from '../../../shared/types'
import { MAX_PANE_COUNT } from '../../../shared/constants'

export interface UiSlice {
  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  settingsProjectId: string | null
  viewStack: ViewType[]

  openWizard: () => void
  closeWizard: () => void
  openSettings: (projectId: string) => void
  closeSettings: () => void

  // Split View
  paneLayout: PaneLayout
  focusedPane: number
  paneSessions: string[]
  setPaneLayout: (layout: PaneLayout) => void
  cyclePaneLayout: () => void
  setFocusedPane: (pane: number) => void
  setPaneSession: (paneIndex: number, sessionId: string) => void

  // Command Palette
  commandPaletteOpen: boolean
  commandPaletteInitialSubMenu: 'theme' | 'agents' | null
  commandPaletteMode: 'all' | 'workflow' | 'template'
  openCommandPalette: (subMenu?: 'theme' | 'agents', mode?: 'all' | 'workflow' | 'template') => void
  closeCommandPalette: () => void

  // Right Panel
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  toggleRightPanel: () => void
  setRightPanelTab: (tab: RightPanelTab) => void

  // Template Editor
  editingTemplateId: string | null
  openTemplateEditor: (templateId?: string) => void
  closeTemplateEditor: () => void

  // Layout (sidebar + panels)
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarSections: { pinned: boolean; templates: boolean; workflows: boolean }
  rightPanelWidth: number
  wfLogPanelWidth: number
  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  toggleSidebarSection: (key: 'pinned' | 'templates' | 'workflows') => void
  setRightPanelWidth: (w: number) => void
  setWfLogPanelWidth: (w: number) => void

  // Zoom
  zoomFactor: number
  setZoomFactor: (factor: number) => void

  // WSL status (null = checking, true = ok, false = down)
  wslAvailable: boolean | null
  setWslAvailable: (available: boolean) => void

  // Theme
  theme: string
  setTheme: (name: string) => void
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  settingsProjectId: null,
  viewStack: [] as ViewType[],

  openWizard: () =>
    set((state) => ({
      currentView: 'wizard' as const,
      viewStack: [...state.viewStack, state.currentView],
    })),
  closeWizard: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, viewStack: stack }
    }),
  openSettings: (projectId) =>
    set((state) => ({
      currentView: 'settings' as const,
      settingsProjectId: projectId,
      viewStack: [...state.viewStack, state.currentView],
    })),
  closeSettings: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, settingsProjectId: null, viewStack: stack }
    }),

  // Split View
  paneLayout: 1,
  focusedPane: 0,
  paneSessions: [],

  setPaneLayout: (layout) =>
    set((state) => ({
      paneLayout: layout,
      focusedPane: state.focusedPane >= layout ? 0 : state.focusedPane,
    })),

  cyclePaneLayout: () =>
    set((state) => {
      const next = (state.paneLayout === MAX_PANE_COUNT ? 1 : state.paneLayout + 1) as PaneLayout
      return {
        paneLayout: next,
        focusedPane: state.focusedPane >= next ? 0 : state.focusedPane,
      }
    }),

  setFocusedPane: (pane) =>
    set((state) => ({
      focusedPane: pane < state.paneLayout ? pane : state.focusedPane,
    })),

  setPaneSession: (paneIndex, sessionId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      while (paneSessions.length <= paneIndex) {
        paneSessions.push('')
      }
      paneSessions[paneIndex] = sessionId
      return { paneSessions }
    }),

  // Command Palette
  commandPaletteOpen: false,
  commandPaletteInitialSubMenu: null,
  commandPaletteMode: 'all',
  openCommandPalette: (subMenu, mode) =>
    set({
      commandPaletteOpen: true,
      commandPaletteInitialSubMenu: subMenu ?? null,
      commandPaletteMode: mode ?? 'all',
    }),
  closeCommandPalette: () =>
    set({
      commandPaletteOpen: false,
      commandPaletteInitialSubMenu: null,
      commandPaletteMode: 'all',
    }),

  // Right Panel
  rightPanelOpen: false,
  rightPanelTab: 'context',
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // Template Editor
  editingTemplateId: null,

  openTemplateEditor: (templateId) =>
    set((state) => ({
      currentView: 'template-editor' as const,
      viewStack: [...state.viewStack, state.currentView],
      editingTemplateId: templateId ?? null,
    })),

  closeTemplateEditor: () =>
    set((state) => {
      const stack = [...state.viewStack]
      const prev = stack.pop() ?? 'home'
      return { currentView: prev, editingTemplateId: null, viewStack: stack }
    }),

  // Layout (sidebar + panels)
  sidebarOpen: true,
  sidebarWidth: 220,
  sidebarSections: { pinned: true, templates: true, workflows: true },
  rightPanelWidth: 240,
  wfLogPanelWidth: 320,

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }))
    const next = get().sidebarOpen
    window.agentDeck.layout.set({ sidebarOpen: next }).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'layout', 'Layout persist failed', { err: String(err) })
    })
  },

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w })
    window.agentDeck.layout.set({ sidebarWidth: w }).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'layout', 'Layout persist failed', { err: String(err) })
    })
  },

  toggleSidebarSection: (key) => {
    set((state) => ({
      sidebarSections: { ...state.sidebarSections, [key]: !state.sidebarSections[key] },
    }))
    const sections = get().sidebarSections
    window.agentDeck.layout.set({ sidebarSections: sections }).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'layout', 'Layout persist failed', { err: String(err) })
    })
  },

  setRightPanelWidth: (w) => {
    set({ rightPanelWidth: w })
    window.agentDeck.layout.set({ rightPanelWidth: w }).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'layout', 'Layout persist failed', { err: String(err) })
    })
  },

  setWfLogPanelWidth: (w) => {
    set({ wfLogPanelWidth: w })
    window.agentDeck.layout.set({ wfLogPanelWidth: w }).catch((err: unknown) => {
      window.agentDeck.log.send('debug', 'layout', 'Layout persist failed', { err: String(err) })
    })
  },

  // WSL status
  wslAvailable: null,
  setWslAvailable: (available) => set({ wslAvailable: available }),

  // Zoom
  zoomFactor: 1.0,
  setZoomFactor: (factor) => set({ zoomFactor: factor }),

  // Theme
  // Read from DOM at store init — main.tsx sets data-theme before createRoot,
  // so this is correct in production. In tests, jsdom yields '' which is fine.
  theme: (typeof document !== 'undefined' ? document.documentElement.dataset.theme : '') ?? '',
  setTheme: (name) => {
    document.documentElement.dataset.theme = name
    window.agentDeck.theme.set(name).catch((err: unknown) => {
      window.agentDeck.log.send('warn', 'ui', 'Theme persist failed', { err: String(err) })
    })
    set({ theme: name })
  },
})
