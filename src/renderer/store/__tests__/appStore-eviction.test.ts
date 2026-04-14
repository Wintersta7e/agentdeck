import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'
import { MAX_EXITED_SESSIONS } from '../../../shared/constants'
import { makeActivityEvent } from '../../../__test__/helpers'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
})

describe('removeSession eviction (LEAK-03)', () => {
  it('retains up to MAX_EXITED_SESSIONS exited entries before evicting', () => {
    for (let i = 0; i < MAX_EXITED_SESSIONS; i++) {
      const id = `s-${i}`
      useAppStore.getState().addSession(id, 'proj-1')
      // Backdate each session so eviction order is deterministic
      useAppStore.setState((s) => {
        const existing = s.sessions[id]
        if (!existing) return s
        return { sessions: { ...s.sessions, [id]: { ...existing, startedAt: i } } }
      })
      useAppStore.getState().removeSession(id)
    }
    const state = useAppStore.getState()
    const exited = Object.values(state.sessions).filter((s) => s.status === 'exited')
    expect(exited).toHaveLength(MAX_EXITED_SESSIONS)
  })

  it('evicts the oldest exited session when overflowing MAX_EXITED_SESSIONS', () => {
    for (let i = 0; i <= MAX_EXITED_SESSIONS; i++) {
      const id = `s-${i}`
      useAppStore.getState().addSession(id, 'proj-1')
      useAppStore.setState((s) => {
        const existing = s.sessions[id]
        if (!existing) return s
        return { sessions: { ...s.sessions, [id]: { ...existing, startedAt: i } } }
      })
      // Seed auxiliary maps so we can assert they're pruned alongside
      useAppStore.getState().addActivityEvent(id, makeActivityEvent({ type: 'write' }))
      useAppStore.getState().setSessionUsage(id, {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalCostUsd: 0.01,
      })
      useAppStore.getState().setWorktreePath(id, { path: `/tmp/${id}`, isolated: false })
      useAppStore.getState().removeSession(id)
    }
    const state = useAppStore.getState()
    // s-0 was the oldest exited session and must have been evicted
    expect(state.sessions['s-0']).toBeUndefined()
    expect(state.activityFeeds['s-0']).toBeUndefined()
    expect(state.sessionUsage['s-0']).toBeUndefined()
    expect(state.writeCountBySession['s-0']).toBeUndefined()
    expect(state.worktreePaths['s-0']).toBeUndefined()
    // s-1 through s-N are retained
    expect(state.sessions['s-1']).toBeDefined()
  })
})

describe('setProjects gitStatuses pruning (LEAK-06)', () => {
  it('drops gitStatuses entries for projects no longer in the list', () => {
    useAppStore.getState().setGitStatus('p1', null)
    useAppStore.getState().setGitStatus('p2', null)
    useAppStore.getState().setProjects([{ id: 'p1', name: 'P1', path: '/p1' }])
    const state = useAppStore.getState()
    expect(state.gitStatuses['p1']).toBeDefined()
    expect(state.gitStatuses['p2']).toBeUndefined()
  })
})
