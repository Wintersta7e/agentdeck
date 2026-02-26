import { create } from 'zustand'
import type {
  Project,
  Template,
  Session,
  SessionStatus,
  ViewType,
  PaneLayout,
  RightPanelTab,
  ActivityEvent,
} from '../../shared/types'

interface AppState {
  sessions: Record<string, Session>
  activeSessionId: string | null
  addSession: (sessionId: string, projectId: string) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  setActiveSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void
  restartSession: (oldSessionId: string) => string | null

  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  settingsProjectId: string | null
  viewStack: ViewType[]

  openWizard: () => void
  closeWizard: () => void
  openSettings: (projectId: string) => void
  closeSettings: () => void

  projects: Project[]
  setProjects: (projects: Project[]) => void

  templates: Template[]
  setTemplates: (templates: Template[]) => void

  getSessionForProject: (projectId: string) => Session | undefined

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
  openCommandPalette: () => void
  closeCommandPalette: () => void

  // Right Panel
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  toggleRightPanel: () => void
  setRightPanelTab: (tab: RightPanelTab) => void

  // Activity Feed (per-session)
  activityFeeds: Record<string, ActivityEvent[]>
  addActivityEvent: (sessionId: string, event: ActivityEvent) => void
  clearActivityFeed: (sessionId: string) => void

  // Template Editor
  editingTemplateId: string | null
  openTemplateEditor: (templateId?: string) => void
  closeTemplateEditor: () => void

  // Notifications
  notifications: Array<{
    id: string
    type: 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  }>
  addNotification: (type: 'error' | 'warning' | 'info', message: string) => void
  dismissNotification: (id: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  addSession: (sessionId, projectId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // Place new session in the focused pane so it's always visible
      const targetPane = state.focusedPane
      while (paneSessions.length <= targetPane) {
        paneSessions.push('')
      }
      paneSessions[targetPane] = sessionId
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { id: sessionId, projectId, status: 'starting', startedAt: Date.now() },
        },
        activeSessionId: sessionId,
        currentView: 'session' as const,
        paneSessions,
      }
    }),

  setSessionStatus: (sessionId, status) =>
    set((state) => {
      const existing = state.sessions[sessionId]
      if (!existing) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, status },
        },
      }
    }),

  setActiveSession: (sessionId) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // If session isn't already in a visible pane, put it in the focused pane
      const visibleIndex = paneSessions.slice(0, state.paneLayout).indexOf(sessionId)
      if (visibleIndex === -1) {
        const targetPane = state.focusedPane
        while (paneSessions.length <= targetPane) {
          paneSessions.push('')
        }
        paneSessions[targetPane] = sessionId
      }
      return { activeSessionId: sessionId, currentView: 'session' as const, paneSessions }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      const { [sessionId]: _feed, ...remainingFeeds } = state.activityFeeds
      const remainingIds = Object.keys(rest)
      const paneSessions = state.paneSessions.map((id) => (id === sessionId ? '' : id))
      return {
        sessions: rest,
        activityFeeds: remainingFeeds,
        activeSessionId:
          state.activeSessionId === sessionId ? (remainingIds[0] ?? null) : state.activeSessionId,
        currentView: remainingIds.length === 0 ? ('home' as const) : state.currentView,
        paneSessions,
      }
    }),

  restartSession: (oldSessionId) => {
    const state = get()
    const oldSession = state.sessions[oldSessionId]
    if (!oldSession) return null

    const projectId = oldSession.projectId
    const newSessionId = `session-${projectId}-${Date.now()}`

    // Find which pane slot the old session occupies
    const paneIndex = state.paneSessions.indexOf(oldSessionId)

    set((s) => {
      // Remove old session
      const { [oldSessionId]: _, ...rest } = s.sessions
      const { [oldSessionId]: _feed, ...remainingFeeds } = s.activityFeeds

      // Place new session in the same pane slot
      const paneSessions = s.paneSessions.map((id) => (id === oldSessionId ? newSessionId : id))
      if (paneIndex === -1) {
        // Old session wasn't in a pane — put new one in focused pane
        while (paneSessions.length <= s.focusedPane) paneSessions.push('')
        paneSessions[s.focusedPane] = newSessionId
      }

      return {
        sessions: {
          ...rest,
          [newSessionId]: {
            id: newSessionId,
            projectId,
            status: 'starting' as const,
            startedAt: Date.now(),
          },
        },
        activityFeeds: remainingFeeds,
        activeSessionId: newSessionId,
        paneSessions,
      }
    })

    return newSessionId
  },

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

  projects: [],
  setProjects: (projects) => set({ projects }),

  templates: [],
  setTemplates: (templates) => set({ templates }),

  getSessionForProject: (projectId) => {
    const { sessions } = get()
    return Object.values(sessions).find((s) => s.projectId === projectId)
  },

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
      const next = (state.paneLayout === 3 ? 1 : state.paneLayout + 1) as PaneLayout
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
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  // Right Panel
  rightPanelOpen: false,
  rightPanelTab: 'context',
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // Activity Feed
  activityFeeds: {},

  addActivityEvent: (sessionId, event) =>
    set((state) => {
      const existing = state.activityFeeds[sessionId] ?? []
      const updated = [...existing, event].slice(-500)
      return {
        activityFeeds: { ...state.activityFeeds, [sessionId]: updated },
      }
    }),

  clearActivityFeed: (sessionId) =>
    set((state) => ({
      activityFeeds: {
        ...state.activityFeeds,
        [sessionId]: [],
      },
    })),

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

  // Notifications
  notifications: [],

  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          message,
          timestamp: Date.now(),
        },
      ].slice(-10),
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}))
