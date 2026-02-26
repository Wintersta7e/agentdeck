import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  // Sessions — runtime only, keyed by sessionId
  sessions: {},
  activeSessionId: null,

  addSession: (sessionId, projectId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { id: sessionId, projectId, status: 'starting', startedAt: Date.now() }
      },
      activeSessionId: sessionId,
      currentView: 'session'
    })),

  setSessionStatus: (sessionId, status) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...state.sessions[sessionId], status }
      }
    })),

  setActiveSession: (sessionId) =>
    set({ activeSessionId: sessionId, currentView: 'session' }),

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      const remainingIds = Object.keys(rest)
      return {
        sessions: rest,
        activeSessionId: state.activeSessionId === sessionId
          ? remainingIds[0] || null
          : state.activeSessionId,
        currentView: remainingIds.length === 0 ? 'home' : state.currentView
      }
    }),

  // View routing
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),

  // Projects — cached from electron-store
  projects: [],
  setProjects: (projects) => set({ projects }),

  // Templates — cached from electron-store
  templates: [],
  setTemplates: (templates) => set({ templates }),

  // Helpers
  getSessionForProject: (projectId) => {
    const { sessions } = get()
    return Object.values(sessions).find((s) => s.projectId === projectId)
  }
}))
