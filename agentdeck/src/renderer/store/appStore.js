import { create } from 'zustand'

export const useAppStore = create((set) => ({
  // Sessions
  sessions: {},
  activeSessionId: null,

  addSession: (id) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { id, status: 'starting' }
      },
      activeSessionId: id
    })),

  setSessionStatus: (id, status) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], status }
      }
    })),

  removeSession: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.sessions
      return {
        sessions: rest,
        activeSessionId: state.activeSessionId === id
          ? Object.keys(rest)[0] || null
          : state.activeSessionId
      }
    }),

  // UI state
  currentView: 'terminal'
}))
