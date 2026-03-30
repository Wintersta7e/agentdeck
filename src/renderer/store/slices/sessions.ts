import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { AgentType, Session, SessionStatus, ActivityEvent } from '../../../shared/types'

export interface SessionsSlice {
  sessions: Record<string, Session>
  activeSessionId: string | null
  addSession: (
    sessionId: string,
    projectId: string,
    overrides?: { agentOverride?: AgentType; agentFlagsOverride?: string },
  ) => void
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  setActiveSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void
  restartSession: (oldSessionId: string) => string | null
  getSessionForProject: (projectId: string) => Session | undefined

  // Activity Feed (per-session)
  activityFeeds: Record<string, ActivityEvent[]>
  addActivityEvent: (sessionId: string, event: ActivityEvent) => void
  clearActivityFeed: (sessionId: string) => void

  // Usage tracking (per-session)
  sessionUsage: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      totalCostUsd: number
    }
  >
  setSessionUsage: (
    sessionId: string,
    usage: {
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      totalCostUsd: number
    },
  ) => void
}

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set, get) => ({
  sessions: {},
  activeSessionId: null,
  sessionUsage: {},

  addSession: (sessionId, projectId, overrides) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // Place new session in the focused pane so it's always visible
      const targetPane = state.focusedPane
      while (paneSessions.length <= targetPane) {
        paneSessions.push('')
      }
      paneSessions[targetPane] = sessionId
      const session: Session = {
        id: sessionId,
        projectId,
        status: 'starting',
        startedAt: Date.now(),
        agentOverride: overrides?.agentOverride,
        agentFlagsOverride: overrides?.agentFlagsOverride,
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: session,
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
      const { [sessionId]: _usage, ...remainingUsage } = state.sessionUsage
      const remainingIds = Object.keys(rest)
      // Clear removed session from pane slots, then compact left so pane 0 always
      // has a session if any exist (prevents empty pane with sessions in hidden slots)
      const cleared = state.paneSessions.map((id) => (id === sessionId ? '' : id))
      const filled = cleared.filter((id) => id !== '')
      const paneSessions = [...filled, ...Array<string>(cleared.length - filled.length).fill('')]
      const firstPane = paneSessions[0]
      const newActive = firstPane && firstPane !== '' ? firstPane : (remainingIds[0] ?? null)
      // If pane 0 is empty but we still have sessions, place the new active there
      if (paneSessions[0] === '' && newActive) {
        paneSessions[0] = newActive
      }
      return {
        sessions: rest,
        activityFeeds: remainingFeeds,
        sessionUsage: remainingUsage,
        activeSessionId: state.activeSessionId === sessionId ? newActive : state.activeSessionId,
        currentView:
          remainingIds.length === 0
            ? state.openWorkflowIds.length > 0
              ? ('workflow' as const)
              : ('home' as const)
            : state.currentView,
        activeWorkflowId:
          remainingIds.length === 0 && state.openWorkflowIds.length > 0
            ? (state.activeWorkflowId ?? state.openWorkflowIds[0] ?? null)
            : state.activeWorkflowId,
        paneSessions,
      }
    }),

  restartSession: (oldSessionId) => {
    let newSessionId: string | null = null

    set((s) => {
      const oldSession = s.sessions[oldSessionId]
      if (!oldSession) return s

      const projectId = oldSession.projectId
      const freshId = `session-${projectId}-${Date.now()}`
      newSessionId = freshId

      // Remove old session
      const { [oldSessionId]: _, ...rest } = s.sessions
      const { [oldSessionId]: _feed, ...remainingFeeds } = s.activityFeeds

      // Find which pane slot the old session occupies (read from live state)
      const paneIndex = s.paneSessions.indexOf(oldSessionId)
      const paneSessions = s.paneSessions.map((id) => (id === oldSessionId ? freshId : id))
      if (paneIndex === -1) {
        // Old session wasn't in a pane — put new one in focused pane
        while (paneSessions.length <= s.focusedPane) paneSessions.push('')
        paneSessions[s.focusedPane] = freshId
      }

      return {
        sessions: {
          ...rest,
          [freshId]: {
            id: freshId,
            projectId,
            status: 'starting' as const,
            startedAt: Date.now(),
            agentOverride: oldSession.agentOverride,
            agentFlagsOverride: oldSession.agentFlagsOverride,
          },
        },
        activityFeeds: remainingFeeds,
        activeSessionId: freshId,
        paneSessions,
      }
    })

    return newSessionId
  },

  getSessionForProject: (projectId) => {
    const { sessions } = get()
    return Object.values(sessions).find((s) => s.projectId === projectId)
  },

  // Usage tracking
  setSessionUsage: (sessionId, usage) =>
    set((s) => ({ sessionUsage: { ...s.sessionUsage, [sessionId]: usage } })),

  // Activity Feed
  activityFeeds: {},

  addActivityEvent: (sessionId, event) =>
    set((state) => {
      const existing = state.activityFeeds[sessionId]
      if (!existing) {
        return { activityFeeds: { ...state.activityFeeds, [sessionId]: [event] } }
      }
      const updated =
        existing.length >= 500 ? [...existing.slice(-(500 - 1)), event] : [...existing, event]
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
})
