import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../store/appStore'

const invocations: string[] = []
const makeMock = () => {
  invocations.length = 0
  return {
    worktree: {
      inspect: vi.fn(async () => {
        invocations.push('inspect')
        return { hasChanges: false, hasUnmerged: false, branch: 'main' }
      }),
      discard: vi.fn(async () => {
        invocations.push('discard')
      }),
      keep: vi.fn(async () => {
        invocations.push('keep')
      }),
      releasePrimary: vi.fn(async () => {
        invocations.push('releasePrimary')
      }),
    },
    pty: {
      kill: vi.fn(async () => {
        invocations.push('pty.kill')
      }),
    },
    cost: {
      unbind: vi.fn(async () => {
        invocations.push('cost.unbind')
      }),
    },
    log: {
      send: vi.fn(),
    },
  }
}

describe('closeSession orchestrator', () => {
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
      openSessionIds: ['s1'],
      paneSessions: ['s1', '', ''],
      activeSessionId: 's1',
      paneLayout: 1,
      focusedPane: 0,
      notifications: [],
      worktreePaths: { s1: { isolated: true, path: '/tmp/wt' } },
    } as never)
    globalThis.window = globalThis.window || ({} as Window & typeof globalThis)
    // @ts-expect-error patching window.agentDeck with a minimal test shim
    window.agentDeck = makeMock()
  })

  it('clean-worktree path: inspect -> applySessionStatus -> kill -> re-inspect -> discard -> releasePrimary -> prune', async () => {
    const { closeSession } = await import('../session-close')
    await closeSession('s1')
    expect(invocations).toEqual([
      'inspect',
      'cost.unbind',
      'pty.kill',
      'inspect',
      'discard',
      'releasePrimary',
    ])
    expect(useAppStore.getState().sessions['s1']).toBeUndefined()
    // H3: worktreePaths entry cleared before prune
    expect(useAppStore.getState().worktreePaths['s1']).toBeUndefined()
  })

  it('cancel path: returns without calling pty.kill or mutating sessions', async () => {
    ;(window.agentDeck.worktree.inspect as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        invocations.push('inspect')
        return { hasChanges: true, hasUnmerged: false, branch: 'x' }
      },
    )
    setTimeout(() => {
      const n = useAppStore.getState().notifications.at(-1) as
        | { resolve: (v: string) => void }
        | undefined
      n?.resolve('cancel')
    }, 10)
    const { closeSession } = await import('../session-close')
    await closeSession('s1')
    expect(invocations).toEqual(['inspect'])
    expect(useAppStore.getState().sessions['s1']).toBeDefined()
  })

  it('unknown id: no-op', async () => {
    const { closeSession } = await import('../session-close')
    await expect(closeSession('nope')).resolves.toBeUndefined()
  })

  it('in-flight guard: concurrent close(s1) calls -> only one orchestration runs', async () => {
    const { closeSession, __resetCloseSessionGuardForTest } = await import('../session-close')
    __resetCloseSessionGuardForTest()

    type Inspection = { hasChanges: boolean; hasUnmerged: boolean; branch: string }
    // Slow the first worktree.inspect so the second closeSession call lands
    // while the first is still in orchestration. Resolver is exposed via the
    // closure so the test can unblock the first inspect deterministically.
    const gate: { resolve: (v: Inspection) => void } = { resolve: () => {} }
    ;(window.agentDeck.worktree.inspect as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<Inspection>((resolve) => {
          invocations.push('inspect')
          gate.resolve = resolve
        }),
    )

    const first = closeSession('s1')
    // Second call fires while first is mid-inspect; should early-return via the guard.
    const second = closeSession('s1')
    // Let the microtask queue settle so the second call runs its early return.
    await Promise.resolve()

    // Second has already resolved (guard early return) even though first hasn't resolved yet.
    await expect(Promise.race([second, Promise.resolve('pending')])).resolves.toBeUndefined()

    // Only one inspect call has been pushed at this point.
    expect(invocations.filter((x) => x === 'inspect')).toHaveLength(1)

    // Resolve the first inspect so the first orchestration completes.
    gate.resolve({ hasChanges: false, hasUnmerged: false, branch: 'main' })
    await first

    // Post-orchestration: exactly ONE pty.kill call, not two.
    expect(invocations.filter((x) => x === 'pty.kill')).toHaveLength(1)
    // Also exactly one releasePrimary — the second call never reached it.
    expect(invocations.filter((x) => x === 'releasePrimary')).toHaveLength(1)
  })
})
