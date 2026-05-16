import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

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

  it('restartSession preserves agent overrides', () => {
    useAppStore.getState().addSession('s1', 'proj-1', {
      agentOverride: 'codex',
      agentFlagsOverride: '--fast',
    })
    const newId = useAppStore.getState().restartSession('s1')
    expect(typeof newId).toBe('string')
    expect(newId).not.toBe('')
    const newSession = newId ? useAppStore.getState().sessions[newId] : undefined
    expect(newSession?.agentOverride).toBe('codex')
    expect(newSession?.agentFlagsOverride).toBe('--fast')
    expect(newSession?.status).toBe('starting')
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

  it('restartSession swaps the old id for the fresh id in openSessionIds at the same index', () => {
    const a = useAppStore.getState().openSession({ projectId: 'p1', seedTemplateId: null })
    const b = useAppStore.getState().openSession({ projectId: 'p2', seedTemplateId: null })
    expect(useAppStore.getState().openSessionIds).toEqual([a, b])
    const fresh = useAppStore.getState().restartSession(a)
    expect(fresh).not.toBeNull()
    const s = useAppStore.getState()
    // 'a' replaced by fresh id at index 0, 'b' untouched at index 1
    expect(s.openSessionIds).toEqual([fresh, b])
    expect(s.sessions[a]).toBeUndefined()
    expect(s.sessions[fresh!]).toBeDefined()
  })
})
