import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../appStore'

describe('applySessionStatus — reason taxonomy', () => {
  beforeEach(() => {
    useAppStore.setState({
      sessions: {
        s1: {
          id: 's1',
          projectId: 'p1',
          status: 'running',
          startedAt: 0,
          approvalState: 'idle',
          seedTemplateId: null,
        },
      },
    } as never)
  })

  it("reason='pty-exit' flips idle -> review on running -> exited", () => {
    useAppStore.getState().applySessionStatus('s1', 'exited', 'pty-exit')
    expect(useAppStore.getState().sessions['s1']?.status).toBe('exited')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('review')
  })

  it("reason='user-kill' sets status but skips the approval transition", () => {
    useAppStore.getState().applySessionStatus('s1', 'exited', 'user-kill')
    expect(useAppStore.getState().sessions['s1']?.status).toBe('exited')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('idle')
  })

  it("reason='spawn-failure' normalizes to error and skips approval", () => {
    useAppStore.getState().applySessionStatus('s1', 'exited', 'spawn-failure')
    expect(useAppStore.getState().sessions['s1']?.status).toBe('error')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('idle')
  })

  it('missing reason defaults to pty-exit semantics', () => {
    useAppStore.getState().applySessionStatus('s1', 'exited')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('review')
  })

  it('idempotent on unknown id', () => {
    expect(() =>
      useAppStore.getState().applySessionStatus('nope', 'exited', 'pty-exit'),
    ).not.toThrow()
  })
})
