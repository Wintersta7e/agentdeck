import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type {
  AgentType,
  Session,
  SessionStatus,
  ActivityEvent,
  TokenUsage,
} from '../../../shared/types'
import { ACTIVITY_FEED_CAP, MAX_EXITED_SESSIONS, MAX_PANE_COUNT } from '../../../shared/constants'

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

  // Total writes observed per session, tracked outside the capped feed so
  // "Files Changed" counters stay accurate for long heavy sessions.
  writeCountBySession: Record<string, number>

  // Usage tracking (per-session)
  sessionUsage: Record<string, TokenUsage>
  setSessionUsage: (sessionId: string, usage: TokenUsage) => void

  // Worktree isolation paths (per-session)
  worktreePaths: Record<string, { path: string; isolated: boolean; branch?: string | undefined }>
  setWorktreePath: (
    sessionId: string,
    result: { path: string; isolated: boolean; branch?: string | undefined },
  ) => void
  clearWorktreePath: (sessionId: string) => void
}

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set, get) => ({
  sessions: {},
  activeSessionId: null,
  sessionUsage: {},

  addSession: (sessionId, projectId, overrides) =>
    set((state) => {
      const paneSessions = [...state.paneSessions]
      // Place new session in the focused pane so it's always visible
      const targetPane = Math.min(state.focusedPane, MAX_PANE_COUNT - 1) // ARCH-11: Cap at max panes
      while (paneSessions.length <= targetPane) {
        paneSessions.push('')
      }
      paneSessions[targetPane] = sessionId
      // ARCH-11: Cap paneSessions to max entries to prevent unbounded growth
      paneSessions.length = Math.min(paneSessions.length, MAX_PANE_COUNT)
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
      // Keep the session in the sessions map (for cost/timeline/digest after close)
      // but mark it as exited. Only remove from pane slots and tab navigation.
      const session = state.sessions[sessionId]
      let sessions = session
        ? { ...state.sessions, [sessionId]: { ...session, status: 'exited' as SessionStatus } }
        : state.sessions
      let activityFeeds = state.activityFeeds
      let sessionUsage = state.sessionUsage
      let writeCountBySession = state.writeCountBySession
      // Evict the oldest exited sessions so per-session maps don't grow forever
      const exitedByAge = Object.entries(sessions)
        .filter(([, s]) => s.status === 'exited')
        .sort(([, a], [, b]) => a.startedAt - b.startedAt)
      if (exitedByAge.length > MAX_EXITED_SESSIONS) {
        const evictCount = exitedByAge.length - MAX_EXITED_SESSIONS
        const evictIds = new Set(exitedByAge.slice(0, evictCount).map(([id]) => id))
        const nextSessions: typeof sessions = {}
        for (const [id, s] of Object.entries(sessions)) {
          if (!evictIds.has(id)) nextSessions[id] = s
        }
        sessions = nextSessions
        const nextFeeds: typeof activityFeeds = {}
        for (const [id, feed] of Object.entries(activityFeeds)) {
          if (!evictIds.has(id)) nextFeeds[id] = feed
        }
        activityFeeds = nextFeeds
        const nextUsage: typeof sessionUsage = {}
        for (const [id, u] of Object.entries(sessionUsage)) {
          if (!evictIds.has(id)) nextUsage[id] = u
        }
        sessionUsage = nextUsage
        const nextWrites: typeof writeCountBySession = {}
        for (const [id, count] of Object.entries(writeCountBySession)) {
          if (!evictIds.has(id)) nextWrites[id] = count
        }
        writeCountBySession = nextWrites
      }
      // Count sessions still visible in the UI (not closed/exited) for view logic
      const openIds = Object.entries(sessions)
        .filter(([, s]) => s.status !== 'exited')
        .map(([id]) => id)
      // Clear removed session from pane slots, then compact left so pane 0 always
      // has a session if any exist (prevents empty pane with sessions in hidden slots)
      const cleared = state.paneSessions.map((id) => (id === sessionId ? '' : id))
      const filled = cleared.filter((id) => id !== '')
      const paneSessions = [...filled, ...Array<string>(cleared.length - filled.length).fill('')]
      const firstPane = paneSessions[0]
      const newActive = firstPane && firstPane !== '' ? firstPane : (openIds[0] ?? null)
      // If pane 0 is empty but we still have sessions, place the new active there
      if (paneSessions[0] === '' && newActive) {
        paneSessions[0] = newActive
      }
      return {
        sessions,
        activityFeeds,
        sessionUsage,
        writeCountBySession,
        activeSessionId: state.activeSessionId === sessionId ? newActive : state.activeSessionId,
        currentView:
          openIds.length === 0
            ? state.openWorkflowIds.length > 0
              ? ('workflow' as const)
              : ('home' as const)
            : state.currentView,
        activeWorkflowId:
          openIds.length === 0 && state.openWorkflowIds.length > 0
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
      // LEAK-13: Clean up sessionUsage for the old session
      const { [oldSessionId]: _usage, ...remainingUsage } = s.sessionUsage
      const { [oldSessionId]: _writes, ...remainingWrites } = s.writeCountBySession

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
        sessionUsage: remainingUsage,
        writeCountBySession: remainingWrites,
        activeSessionId: freshId,
        paneSessions,
      }
    })

    return newSessionId
  },

  getSessionForProject: (projectId) => {
    const { sessions } = get()
    // Only return live sessions — exited sessions are preserved for cost/timeline only
    return Object.values(sessions).find((s) => s.projectId === projectId && s.status !== 'exited')
  },

  // Usage tracking
  setSessionUsage: (sessionId, usage) =>
    set((s) => ({ sessionUsage: { ...s.sessionUsage, [sessionId]: usage } })),

  // Activity Feed
  activityFeeds: {},
  writeCountBySession: {},

  addActivityEvent: (sessionId, event) =>
    set((state) => {
      const existing = state.activityFeeds[sessionId]
      const updated = !existing
        ? [event]
        : existing.length >= ACTIVITY_FEED_CAP
          ? [...existing.slice(-(ACTIVITY_FEED_CAP - 1)), event]
          : [...existing, event]
      const activityFeeds = { ...state.activityFeeds, [sessionId]: updated }
      if (event.type !== 'write') return { activityFeeds }
      const writeCountBySession = {
        ...state.writeCountBySession,
        [sessionId]: (state.writeCountBySession[sessionId] ?? 0) + 1,
      }
      return { activityFeeds, writeCountBySession }
    }),

  clearActivityFeed: (sessionId) =>
    set((state) => ({
      activityFeeds: {
        ...state.activityFeeds,
        [sessionId]: [],
      },
    })),

  // Worktree isolation paths
  worktreePaths: {},
  setWorktreePath: (sessionId, result) =>
    set((s) => ({ worktreePaths: { ...s.worktreePaths, [sessionId]: result } })),
  clearWorktreePath: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.worktreePaths
      return { worktreePaths: rest }
    }),
})
