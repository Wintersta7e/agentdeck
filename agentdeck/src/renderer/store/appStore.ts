import { create } from 'zustand'
import type { Project, Template, Session, SessionStatus, ViewType } from '../../shared/types'

interface AppState {
  sessions: Record<string, Session>
  activeSessionId: string | null
  addSession: (sessionId: string, projectId: string) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  setActiveSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void

  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  settingsProjectId: string | null
  previousView: ViewType

  openWizard: () => void
  closeWizard: () => void
  openSettings: (projectId: string) => void
  closeSettings: () => void

  projects: Project[]
  setProjects: (projects: Project[]) => void

  templates: Template[]
  setTemplates: (templates: Template[]) => void

  getSessionForProject: (projectId: string) => Session | undefined
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  addSession: (sessionId, projectId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { id: sessionId, projectId, status: 'starting', startedAt: Date.now() },
      },
      activeSessionId: sessionId,
      currentView: 'session' as const,
    })),

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
    set({ activeSessionId: sessionId, currentView: 'session' as const }),

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      const remainingIds = Object.keys(rest)
      return {
        sessions: rest,
        activeSessionId:
          state.activeSessionId === sessionId ? (remainingIds[0] ?? null) : state.activeSessionId,
        currentView: remainingIds.length === 0 ? ('home' as const) : state.currentView,
      }
    }),

  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  settingsProjectId: null,
  previousView: 'home' as ViewType,

  openWizard: () =>
    set((state) => ({ currentView: 'wizard' as const, previousView: state.currentView })),
  closeWizard: () => set((state) => ({ currentView: state.previousView })),
  openSettings: (projectId) =>
    set((state) => ({
      currentView: 'settings' as const,
      settingsProjectId: projectId,
      previousView: state.currentView,
    })),
  closeSettings: () =>
    set((state) => ({ currentView: state.previousView, settingsProjectId: null })),

  projects: [],
  setProjects: (projects) => set({ projects }),

  templates: [],
  setTemplates: (templates) => set({ templates }),

  getSessionForProject: (projectId) => {
    const { sessions } = get()
    return Object.values(sessions).find((s) => s.projectId === projectId)
  },
}))
