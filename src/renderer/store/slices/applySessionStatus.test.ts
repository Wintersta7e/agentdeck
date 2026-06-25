import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../appStore'

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

  it('no-ops on unknown id: inserts no phantom session, leaves others intact', () => {
    const before = useAppStore.getState().sessions['s1']
    expect(before).toBeDefined()

    useAppStore.getState().applySessionStatus('nope', 'exited', 'pty-exit')

    // No phantom session was created for the unknown id.
    expect(useAppStore.getState().sessions['nope']).toBeUndefined()
    // The pre-existing session is untouched (same reference, same fields).
    const after = useAppStore.getState().sessions['s1']
    expect(after).toBe(before)
    expect(after?.status).toBe('running')
    expect(after?.approvalState).toBe('idle')
  })

  it("pty:exit -1 marker routed via 'spawn-failure' yields error+idle (not exited+review)", () => {
    // Simulates the TerminalPane onExit handler: exitCode === -1 is the spawn
    // failure marker emitted by pty-manager.ts. The handler must branch on
    // that marker and pass reason='spawn-failure' rather than 'pty-exit', so
    // the session lands as status='error' + approvalState='idle' instead of
    // the default 'pty-exit' transition (exited + review).
    const exitCode: number = -1
    const reason: 'spawn-failure' | 'pty-exit' = exitCode === -1 ? 'spawn-failure' : 'pty-exit'
    useAppStore.getState().applySessionStatus('s1', 'exited', reason)
    expect(useAppStore.getState().sessions['s1']?.status).toBe('error')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('idle')
  })

  it('pty:exit non-negative marker routes via pty-exit (running -> review)', () => {
    const exitCode: number = 0
    const reason: 'spawn-failure' | 'pty-exit' = exitCode === -1 ? 'spawn-failure' : 'pty-exit'
    useAppStore.getState().applySessionStatus('s1', 'exited', reason)
    expect(useAppStore.getState().sessions['s1']?.status).toBe('exited')
    expect(useAppStore.getState().sessions['s1']?.approvalState).toBe('review')
  })
})
