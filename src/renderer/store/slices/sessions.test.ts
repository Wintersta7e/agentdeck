import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'
import { MAX_EXITED_SESSIONS } from '../../../shared/constants'
import type { Session, SessionStatus } from '../../../shared/types'

describe('sessions slice — addSession lifecycle', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('adds a session and makes it active + switches view to sessions', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']).toBeDefined()
    expect(state.sessions['s1']?.projectId).toBe('proj-1')
    expect(state.sessions['s1']?.status).toBe('starting')
    expect(state.activeSessionId).toBe('s1')
    expect(state.currentView).toBe('sessions')
  })

  it('removeSession marks session exited and falls back to home when last', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().removeSession('s1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']?.status).toBe('exited')
    expect(state.currentView).toBe('home')
  })

  it('removeSession with siblings preserves the others', () => {
    useAppStore.getState().addSession('s1', 'proj-1')
    useAppStore.getState().addSession('s2', 'proj-2')
    useAppStore.getState().removeSession('s1')
    const state = useAppStore.getState()
    expect(state.sessions['s1']?.status).toBe('exited')
    expect(state.sessions['s2']).toBeDefined()
  })
})

describe('sessions slice — openSession + pruneSessionFromTabs', () => {
  beforeEach(() => {
    useAppStore.setState({
      sessions: {},
      openSessionIds: [],
      paneSessions: ['', '', ''],
      paneLayout: 1,
      focusedPane: 0,
      activeSessionId: null,
    } as never)
  })

  it('openSession creates a session and appends to openSessionIds', () => {
    const id = useAppStore.getState().openSession({
      projectId: 'p1',
      agentOverride: 'claude-code',
      seedTemplateId: null,
    })
    const s = useAppStore.getState()
    expect(s.sessions[id]).toBeDefined()
    expect(s.sessions[id]?.approvalState).toBe('idle')
    expect(s.sessions[id]?.seedTemplateId).toBeNull()
    expect(s.openSessionIds).toEqual([id])
    expect(s.activeSessionId).toBe(id)
    expect(s.paneSessions[0]).toBe(id)
  })

  it('pruneSessionFromTabs removes from openSessionIds + clears pane slot + shifts active', () => {
    const a = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    const b = useAppStore.getState().openSession({ projectId: 'p2', seedTemplateId: null })
    expect(useAppStore.getState().activeSessionId).toBe(b)

    useAppStore.getState().pruneSessionFromTabs(b)
    const s = useAppStore.getState()
    expect(s.openSessionIds).toEqual([a])
    expect(s.activeSessionId).toBe(a)
    expect(s.paneSessions[0]).toBe(a)
  })

  it('pruneSessionFromTabs on last tab leaves activeSessionId=null and empty panes', () => {
    const a = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    useAppStore.getState().pruneSessionFromTabs(a)
    const s = useAppStore.getState()
    expect(s.openSessionIds).toEqual([])
    expect(s.activeSessionId).toBeNull()
    expect(s.paneSessions.every((p) => p === '')).toBe(true)
  })

  it('setApprovalState updates the session', () => {
    const id = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    useAppStore.getState().setApprovalState(id, 'kept')
    expect(useAppStore.getState().sessions[id]?.approvalState).toBe('kept')
  })

  it('setSeedTemplateId updates the session', () => {
    const id = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    useAppStore.getState().setSeedTemplateId(id, 'tmpl-1')
    expect(useAppStore.getState().sessions[id]?.seedTemplateId).toBe('tmpl-1')
  })

  it('openSession overwrites an occupied focusedPane slot', () => {
    useAppStore.setState({ paneSessions: ['prev', '', ''], focusedPane: 0 } as never)
    const id = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    expect(useAppStore.getState().paneSessions[0]).toBe(id)
  })
})

describe('sessions slice — removeSession eviction of oldest exited sessions', () => {
  const makeSession = (id: string, startedAt: number, status: SessionStatus): Session => ({
    id,
    projectId: 'p1',
    status,
    startedAt,
    approvalState: 'idle',
    seedTemplateId: null,
  })

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('evicts the oldest exited session and drops it from openSessionIds + per-session maps', () => {
    // Fill the store to exactly the retention cap with exited sessions, each with
    // a distinct ascending startedAt so `exited-0` is unambiguously the oldest.
    const sessions: Record<string, Session> = {}
    const activityFeeds: Record<string, unknown[]> = {}
    const writeCountBySession: Record<string, number> = {}
    const worktreePaths: Record<string, { path: string; isolated: boolean }> = {}
    const openSessionIds: string[] = []
    for (let i = 0; i < MAX_EXITED_SESSIONS; i += 1) {
      const id = `exited-${i}`
      sessions[id] = makeSession(id, 1000 + i, 'exited')
      activityFeeds[id] = []
      writeCountBySession[id] = i
      worktreePaths[id] = { path: `/tmp/${id}`, isolated: true }
      openSessionIds.push(id)
    }
    // One extra running session whose closure pushes the exited count to
    // MAX_EXITED_SESSIONS + 1, forcing eviction of the single oldest.
    const live = makeSession('live', 9999, 'running')
    sessions[live.id] = live
    activityFeeds[live.id] = []
    writeCountBySession[live.id] = 7
    worktreePaths[live.id] = { path: '/tmp/live', isolated: true }
    openSessionIds.push(live.id)

    useAppStore.setState({
      sessions,
      activityFeeds,
      writeCountBySession,
      worktreePaths,
      openSessionIds,
      paneSessions: ['live', '', ''],
      paneLayout: 1,
      focusedPane: 0,
      activeSessionId: 'live',
    } as never)

    useAppStore.getState().removeSession('live')

    const state = useAppStore.getState()
    const oldest = 'exited-0'
    const retained = 'exited-1'

    // Oldest exited session is fully evicted from every per-session map...
    expect(state.sessions[oldest]).toBeUndefined()
    expect(state.activityFeeds[oldest]).toBeUndefined()
    expect(state.writeCountBySession[oldest]).toBeUndefined()
    expect(state.worktreePaths[oldest]).toBeUndefined()
    // ...and from the tab list so it can't become a dangling tab ref.
    expect(state.openSessionIds).not.toContain(oldest)

    // A more-recent exited session survives the eviction.
    expect(state.sessions[retained]).toBeDefined()
    expect(state.openSessionIds).toContain(retained)
    // The just-closed session is retained (it's the newest exited one).
    expect(state.sessions['live']?.status).toBe('exited')
  })
})
