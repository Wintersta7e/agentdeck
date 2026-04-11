import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import { createOfficeSessionRegistry } from './office-session-registry'
import type { Clock, PtySpawnSuccessEvent } from '../../shared/office-types'
import type { CostTracker } from '../cost-tracker'

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('OfficeSessionRegistry', () => {
  let fakeClock: Clock
  let currentTime: number
  let fakeBus: EventEmitter
  let fakeCostTracker: Pick<CostTracker, 'getUsageForSession'>
  let fakeProjectStore: { getProjectByPath: ReturnType<typeof vi.fn> }
  let fakeAppStore: { get: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    currentTime = 1000
    fakeClock = { now: () => currentTime }
    fakeBus = new EventEmitter()
    fakeCostTracker = {
      getUsageForSession: vi.fn().mockReturnValue({ totalCostUsd: 0 }),
    }
    fakeProjectStore = {
      getProjectByPath: vi.fn().mockImplementation((path: string) => {
        if (path === '/home/rooty/proj') {
          return { id: 'proj-1', name: 'proj', path: '/home/rooty/proj' }
        }
        return null
      }),
    }
    fakeAppStore = { get: vi.fn().mockReturnValue({ officeEnabled: true }) }
  })

  function makeDeps() {
    return {
      ptyBus: fakeBus,
      costTracker: fakeCostTracker as CostTracker,
      projectStore: fakeProjectStore as never,
      appStore: fakeAppStore as never,
      clock: fakeClock,
    }
  }

  function makeEvent(
    id: string,
    overrides: Partial<PtySpawnSuccessEvent> = {},
  ): PtySpawnSuccessEvent {
    return {
      sessionId: id,
      agent: 'claude-code',
      projectPath: '/home/rooty/proj',
      startedAtEpoch: 1000,
      startedAtMono: 1000,
      ...overrides,
    }
  }

  // ─── Spawn success ─────────────────────────────────────────────

  it('creates a worker on spawn:success with valid projectPath', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))

    const workers = registry.getWorkers()
    expect(workers).toHaveLength(1)
    expect(workers[0]!.id).toBe('sess-1')
    expect(workers[0]!.projectId).toBe('proj-1')
    expect(workers[0]!.projectName).toBe('proj')
    expect(workers[0]!.deskIndex).toBe(0)
    expect(workers[0]!.agentId).toBe('claude-code')

    registry.dispose()
  })

  it('drops projectless spawn events', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-2', { projectPath: undefined }))

    expect(registry.getWorkers()).toHaveLength(0)
    registry.dispose()
  })

  it('drops spawn events for unknown projects', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-3', { projectPath: '/unknown/path' }))

    expect(registry.getWorkers()).toHaveLength(0)
    registry.dispose()
  })

  it('drops spawn events for unknown agents', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-4', { agent: 'not-real' }))

    expect(registry.getWorkers()).toHaveLength(0)
    registry.dispose()
  })

  it('allocates the lowest free desk index', () => {
    const registry = createOfficeSessionRegistry(makeDeps())

    fakeBus.emit('spawn:success', makeEvent('a'))
    fakeBus.emit('spawn:success', makeEvent('b'))
    fakeBus.emit('spawn:success', makeEvent('c'))

    const desks = registry
      .getWorkers()
      .map((w) => w.deskIndex)
      .sort()
    expect(desks).toEqual([0, 1, 2])

    registry.dispose()
  })

  it('ignores duplicate spawn events for the same session', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    fakeBus.emit('spawn:success', makeEvent('sess-1'))

    expect(registry.getWorkers()).toHaveLength(1)
    registry.dispose()
  })

  // ─── Data / exit events ────────────────────────────────────────

  it('updates lastPtyDataAt on data events and computes idleMs', () => {
    const registry = createOfficeSessionRegistry(makeDeps())

    currentTime = 1000
    fakeBus.emit('spawn:success', makeEvent('sess-1'))

    currentTime = 5000
    fakeBus.emit('data:sess-1', 'some output')

    currentTime = 8000
    const workers = registry.getWorkers()
    expect(workers[0]!.idleMs).toBe(3000)

    registry.dispose()
  })

  it('removes worker on exit event and releases desk', () => {
    const registry = createOfficeSessionRegistry(makeDeps())

    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    fakeBus.emit('exit:sess-1', 0)
    expect(registry.getWorkers()).toHaveLength(0)

    // Next spawn should reuse desk 0
    fakeBus.emit(
      'spawn:success',
      makeEvent('sess-2', { startedAtMono: 2000, startedAtEpoch: 2000 }),
    )
    expect(registry.getWorkers()[0]!.deskIndex).toBe(0)

    registry.dispose()
  })

  it('still tracks events when officeEnabled is false', () => {
    fakeAppStore.get.mockReturnValue({ officeEnabled: false })
    const registry = createOfficeSessionRegistry(makeDeps())

    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    // Registry stays hot — only the aggregator pauses
    expect(registry.getWorkers()).toHaveLength(1)

    registry.dispose()
  })

  // ─── Spawn failed ──────────────────────────────────────────────

  it('removes worker on spawn:failed if one exists', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    fakeBus.emit('spawn:failed', { sessionId: 'sess-1', reason: 'crash' })

    expect(registry.getWorkers()).toHaveLength(0)
    registry.dispose()
  })

  it('ignores spawn:failed for unknown sessions', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    // Should not throw
    fakeBus.emit('spawn:failed', { sessionId: 'nope', reason: 'whatever' })
    expect(registry.getWorkers()).toHaveLength(0)
    registry.dispose()
  })

  // ─── hasActiveWorker ───────────────────────────────────────────

  it('hasActiveWorker returns true for live sessions', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    expect(registry.hasActiveWorker('sess-1')).toBe(true)
    expect(registry.hasActiveWorker('nope')).toBe(false)
    registry.dispose()
  })

  // ─── Cost tracking ─────────────────────────────────────────────

  it('includes cost from costTracker in worker snapshot', () => {
    vi.mocked(fakeCostTracker.getUsageForSession).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0.42,
    })
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))

    const workers = registry.getWorkers()
    expect(workers[0]!.costUsd).toBe(0.42)

    registry.dispose()
  })

  // ─── Desk exhaustion (COV-03) ───────────────────────────────────

  it('drops spawn events when all 20 desks are occupied', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    for (let i = 0; i < 20; i++) {
      fakeBus.emit('spawn:success', makeEvent(`s-${i}`, { startedAtMono: 1000 + i }))
    }
    expect(registry.getWorkers()).toHaveLength(20)

    // 21st should be silently dropped
    fakeBus.emit('spawn:success', makeEvent('s-overflow', { startedAtMono: 2000 }))
    expect(registry.getWorkers()).toHaveLength(20)

    registry.dispose()
  })

  // ─── idleMs clamping (BUG-04) ─────────────────────────────────

  it('clamps idleMs to >= 0', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    currentTime = 1000
    fakeBus.emit('spawn:success', makeEvent('sess-1'))

    // Simulate clock regression (shouldn't happen, but defensive)
    currentTime = 500
    const workers = registry.getWorkers()
    expect(workers[0]!.idleMs).toBe(0)

    registry.dispose()
  })

  // ─── Dispose ───────────────────────────────────────────────────

  it('dispose cleans up all listeners', () => {
    const registry = createOfficeSessionRegistry(makeDeps())
    fakeBus.emit('spawn:success', makeEvent('sess-1'))
    registry.dispose()

    // After dispose, new events should not create workers
    fakeBus.emit('spawn:success', makeEvent('sess-2', { startedAtMono: 2000 }))
    expect(registry.getWorkers()).toHaveLength(0)
  })
})
