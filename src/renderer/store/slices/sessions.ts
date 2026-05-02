import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type {
  AgentType,
  ApprovalState,
  OpenSessionSeed,
  Session,
  SessionLaunchConfig,
  SessionStatus,
  ActivityEvent,
  TokenUsage,
} from '../../../shared/types'
import { ACTIVITY_FEED_CAP, MAX_EXITED_SESSIONS, MAX_PANE_COUNT } from '../../../shared/constants'
import { nextApprovalState } from '../../../shared/approval-transitions'

export interface SessionsSlice {
  sessions: Record<string, Session>
  activeSessionId: string | null
  /** Ordered list of session ids currently open in the tab bar. */
  openSessionIds: string[]
  addSession: (sessionId: string, projectId: string, overrides?: SessionLaunchConfig) => void
  captureSessionSnapshot: (sessionId: string, agentId: AgentType) => Promise<void>
  setSessionStatus: (sessionId: string, status: SessionStatus) => void
  /**
   * Unified status mutator that routes through the approval transition rules.
   * - reason='spawn-failure' normalizes `next` to 'error' and leaves approval alone.
   * - reason='user-kill' applies `next` as-is but skips approval transition.
   * - reason='pty-exit' (or undefined) runs `nextApprovalState` — the
   *   running -> exited + idle -> review auto-transition fires here.
   */
  applySessionStatus: (
    id: string,
    next: SessionStatus,
    reason?: 'spawn-failure' | 'pty-exit' | 'user-kill',
  ) => void
  setApprovalState: (id: string, next: ApprovalState) => void
  setSeedTemplateId: (id: string, templateId: string | null) => void
  /** Store-only session creation (§7.1). TerminalPane still owns pty.spawn. */
  openSession: (seed: OpenSessionSeed) => string
  /** In-memory prune: remove from openSessionIds + pane slots, shift active. */
  pruneSessionFromTabs: (id: string) => void
  setActiveSession: (sessionId: string) => void
  /** Clear the active selection without touching the open-session list. Used
   * by SessionTabs to route back to the SessionsScreen overview while
   * keeping all open sessions in the strip.
   */
  clearActiveSession: () => void
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
  openSessionIds: [],
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
        approvalState: 'idle',
        seedTemplateId: null,
        agentOverride: overrides?.agentOverride,
        agentFlagsOverride: overrides?.agentFlagsOverride,
        initialPrompt: overrides?.initialPrompt,
        branchMode: overrides?.branchMode,
        initialBranch: overrides?.initialBranch,
        costCap: overrides?.costCap,
        runMode: overrides?.runMode,
        approve: overrides?.approve,
      }
      // legacy addSession must also append to openSessionIds so SessionTabs
      // sees every session regardless of launch path.
      const openSessionIds = state.openSessionIds.includes(sessionId)
        ? state.openSessionIds
        : [...state.openSessionIds, sessionId]
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: session,
        },
        activeSessionId: sessionId,
        currentView: 'sessions' as const,
        paneSessions,
        openSessionIds,
      }
    }),

  captureSessionSnapshot: async (sessionId, agentId) => {
    try {
      const result = await window.agentDeck.agents.getEffectiveContextForLaunch(agentId)
      if ('error' in result) return
      set((state) => {
        const existing = state.sessions[sessionId]
        if (!existing) return state
        // Immutable once captured: only write if not already set (prevents race
        // with a later captureSessionSnapshot call on the same session).
        if (existing.resolvedContextWindow !== undefined) return state
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              model: result.modelId ?? undefined,
              resolvedContextWindow: result.value,
              resolvedContextSource: result.source,
            },
          },
        }
      })
    } catch {
      // Swallow — SessionHero falls back gracefully if snapshot is missing.
    }
  },

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

  applySessionStatus: (id, next, reason) =>
    set((state) => {
      const sess = state.sessions[id]
      if (!sess) return {}
      const effectiveNext: SessionStatus = reason === 'spawn-failure' ? 'error' : next
      const skipApproval = reason === 'user-kill' || reason === 'spawn-failure'
      const updated: Session = {
        ...sess,
        status: effectiveNext,
        approvalState: skipApproval
          ? sess.approvalState
          : nextApprovalState(
              { status: sess.status, approvalState: sess.approvalState },
              { status: effectiveNext },
            ),
      }
      return { sessions: { ...state.sessions, [id]: updated } }
    }),

  setApprovalState: (id, nextState) =>
    set((state) => {
      const sess = state.sessions[id]
      if (!sess) return {}
      return { sessions: { ...state.sessions, [id]: { ...sess, approvalState: nextState } } }
    }),

  setSeedTemplateId: (id, templateId) =>
    set((state) => {
      const sess = state.sessions[id]
      if (!sess) return {}
      return { sessions: { ...state.sessions, [id]: { ...sess, seedTemplateId: templateId } } }
    }),

  openSession: (seed) => {
    // Cryptographically-random suffix — Math.random() is flagged by CodeQL
    // for ID generation since session IDs are used to route IPC and key
    // store entries.
    const id = `session-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    set((state) => {
      const session: Session = {
        ...seed,
        id,
        status: 'starting',
        startedAt: Date.now(),
        approvalState: 'idle',
        seedTemplateId: seed.seedTemplateId ?? null,
      }
      const openSessionIds = [...state.openSessionIds, id]
      const paneSessions = [...state.paneSessions]
      while (paneSessions.length <= state.focusedPane) paneSessions.push('')
      paneSessions[state.focusedPane] = id
      paneSessions.length = Math.min(paneSessions.length, MAX_PANE_COUNT)
      return {
        sessions: { ...state.sessions, [id]: session },
        openSessionIds,
        paneSessions,
        activeSessionId: id,
        currentView: 'sessions' as const,
      }
    })
    return id
  },

  pruneSessionFromTabs: (id) =>
    set((state) => {
      if (!state.sessions[id]) return {}
      const openSessionIds = state.openSessionIds.filter((x) => x !== id)
      const wasActive = state.activeSessionId === id
      let nextActive: string | null = state.activeSessionId
      if (wasActive) {
        const idx = state.openSessionIds.indexOf(id)
        nextActive = openSessionIds[idx] ?? openSessionIds[idx - 1] ?? null
      }
      const paneSessions = state.paneSessions.map((p) => (p === id ? '' : p))
      if (wasActive && nextActive && !paneSessions.includes(nextActive)) {
        const emptyIdx = paneSessions.indexOf('')
        if (emptyIdx >= 0) paneSessions[emptyIdx] = nextActive
      }
      const { [id]: _removed, ...sessions } = state.sessions
      return { sessions, openSessionIds, paneSessions, activeSessionId: nextActive }
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
      return { activeSessionId: sessionId, currentView: 'sessions' as const, paneSessions }
    }),

  clearActiveSession: () => set({ activeSessionId: null }),

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
      let worktreePaths = state.worktreePaths
      let openSessionIds = state.openSessionIds
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
        const nextWorktrees: typeof worktreePaths = {}
        for (const [id, wt] of Object.entries(worktreePaths)) {
          if (!evictIds.has(id)) nextWorktrees[id] = wt
        }
        worktreePaths = nextWorktrees
        // Evicted ids would be dangling tab refs otherwise.
        openSessionIds = openSessionIds.filter((id) => !evictIds.has(id))
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
        worktreePaths,
        openSessionIds,
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

      // Swap the old id for the fresh one at the same index so the tab keeps its
      // position; append if the old id wasn't tracked for some reason.
      const hadOldTab = s.openSessionIds.includes(oldSessionId)
      const openSessionIds = hadOldTab
        ? s.openSessionIds.map((x) => (x === oldSessionId ? freshId : x))
        : [...s.openSessionIds, freshId]

      return {
        sessions: {
          ...rest,
          [freshId]: {
            id: freshId,
            projectId,
            status: 'starting' as const,
            startedAt: Date.now(),
            approvalState: 'idle' as const,
            seedTemplateId: null,
            agentOverride: oldSession.agentOverride,
            agentFlagsOverride: oldSession.agentFlagsOverride,
          },
        },
        activityFeeds: remainingFeeds,
        sessionUsage: remainingUsage,
        writeCountBySession: remainingWrites,
        activeSessionId: freshId,
        paneSessions,
        openSessionIds,
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
      // Drop late-arriving events for sessions that have been evicted from the
      // store. Without this guard a buffered pty:activity IPC firing after the
      // session was pruned would resurrect orphan entries in activityFeeds +
      // writeCountBySession that would never be cleaned up again.
      if (!state.sessions[sessionId]) return state
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
