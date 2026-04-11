import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createOfficeAggregator } from './office-aggregator'
import type { Clock, OfficeSnapshot, OfficeWorker } from '../../shared/office-types'
import type { OfficeSessionRegistry } from './office-session-registry'

function makeWorker(overrides: Partial<OfficeWorker> = {}): OfficeWorker {
  return {
    id: 'w1',
    agentId: 'claude-code' as OfficeWorker['agentId'],
    projectId: 'p1',
    projectName: 'proj',
    sessionLabel: 'proj · Claude',
    startedAtEpoch: 1000,
    startedAtMono: 1000,
    deskIndex: 0,
    activity: 'working',
    idleMs: 0,
    costUsd: 0,
    ...overrides,
  }
}

describe('OfficeAggregator', () => {
  let currentTime: number
  let clock: Clock
  let workers: OfficeWorker[]
  let fakeRegistry: OfficeSessionRegistry
  let fakeAppStore: { get: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    currentTime = 10_000
    clock = { now: () => currentTime }
    workers = []
    fakeRegistry = {
      getWorkers: () => workers,
      hasActiveWorker: (id) => workers.some((w) => w.id === id),
      dispose: () => {},
    }
    fakeAppStore = { get: vi.fn().mockReturnValue({ officeEnabled: true }) }
  })

  function makeDeps(onSnapshot: (s: OfficeSnapshot) => void) {
    return {
      registry: fakeRegistry,
      clock,
      appStore: fakeAppStore as never,
      onSnapshot,
    }
  }

  it('does not emit snapshots while paused (initial state)', () => {
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    currentTime += 2000
    agg.tick()
    expect(onSnapshot).not.toHaveBeenCalled()
    agg.dispose()
  })

  it('emits a snapshot on tick after resume', () => {
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.tick()
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    const snap = onSnapshot.mock.calls[0]![0] as OfficeSnapshot
    expect(snap.workers).toHaveLength(1)
    agg.dispose()
  })

  it('transitions new workers from spawning to working after 2 ticks', () => {
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()

    // Worker appears after resume → gets spawning ticks
    workers = [makeWorker({ id: 'w-new', idleMs: 0 })]
    agg.tick() // spawning (2 ticks left → 1)
    agg.tick() // spawning (1 tick left → 0)
    agg.tick() // working

    const activities = onSnapshot.mock.calls.map(
      (c) => (c[0] as OfficeSnapshot).workers[0]!.activity,
    )
    expect(activities).toEqual(['spawning', 'spawning', 'working'])
    agg.dispose()
  })

  it('maps idle thresholds correctly', () => {
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()

    // Burn through spawning ticks for the initial worker
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    agg.tick()
    agg.tick()
    onSnapshot.mockClear()

    // working threshold
    workers = [makeWorker({ id: 'w1', idleMs: 119_999 })]
    agg.tick()
    expect((onSnapshot.mock.calls.at(-1)![0] as OfficeSnapshot).workers[0]!.activity).toBe(
      'working',
    )

    // idle-coffee threshold
    workers = [makeWorker({ id: 'w1', idleMs: 120_000 })]
    agg.tick()
    expect((onSnapshot.mock.calls.at(-1)![0] as OfficeSnapshot).workers[0]!.activity).toBe(
      'idle-coffee',
    )

    // still idle-coffee
    workers = [makeWorker({ id: 'w1', idleMs: 299_999 })]
    agg.tick()
    expect((onSnapshot.mock.calls.at(-1)![0] as OfficeSnapshot).workers[0]!.activity).toBe(
      'idle-coffee',
    )

    // idle-window threshold
    workers = [makeWorker({ id: 'w1', idleMs: 300_000 })]
    agg.tick()
    expect((onSnapshot.mock.calls.at(-1)![0] as OfficeSnapshot).workers[0]!.activity).toBe(
      'idle-window',
    )

    agg.dispose()
  })

  it('does not force spawning for workers that existed at resume time', () => {
    // Worker appears BEFORE resume
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume() // baseline captures w1
    agg.tick()

    const snap = onSnapshot.mock.calls[0]![0] as OfficeSnapshot
    expect(snap.workers[0]!.activity).toBe('working')
    agg.dispose()
  })

  it('does not emit snapshots when kill switch is off', () => {
    fakeAppStore.get.mockReturnValue({ officeEnabled: false })
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.tick()
    expect(onSnapshot).not.toHaveBeenCalled()
    agg.dispose()
  })

  it('pause stops snapshot emission', () => {
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.tick()
    expect(onSnapshot).toHaveBeenCalledTimes(1)

    agg.pause()
    agg.tick()
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    agg.dispose()
  })

  it('prunes spawning state for removed workers', () => {
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()

    workers = [makeWorker({ id: 'w-temp', idleMs: 0 })]
    agg.tick() // spawning

    // Worker exits
    workers = []
    agg.tick()

    // Worker comes back — should get new spawning ticks
    workers = [makeWorker({ id: 'w-temp', idleMs: 0 })]
    agg.tick()

    const lastSnap = onSnapshot.mock.calls.at(-1)![0] as OfficeSnapshot
    expect(lastSnap.workers[0]!.activity).toBe('spawning')
    agg.dispose()
  })

  // COV-01: startTimer() drives tick() on the 500ms interval
  it('startTimer drives tick on 500ms interval', () => {
    vi.useFakeTimers()
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.startTimer()

    vi.advanceTimersByTime(500)
    expect(onSnapshot).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(500)
    expect(onSnapshot).toHaveBeenCalledTimes(2)

    agg.dispose()
    vi.advanceTimersByTime(1000)
    expect(onSnapshot).toHaveBeenCalledTimes(2) // no more after dispose
    vi.useRealTimers()
  })

  // COV-01: startTimer is idempotent
  it('startTimer called twice creates only one interval', () => {
    vi.useFakeTimers()
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.startTimer()
    agg.startTimer() // second call should be a no-op

    vi.advanceTimersByTime(500)
    expect(onSnapshot).toHaveBeenCalledTimes(1) // not 2

    agg.dispose()
    vi.useRealTimers()
  })

  // COV-08: resume() idempotency — second resume is a no-op
  it('resume called twice does not re-snapshot baseline', () => {
    workers = [makeWorker({ id: 'w1', idleMs: 0 })]
    const onSnapshot = vi.fn()
    const agg = createOfficeAggregator(makeDeps(onSnapshot))
    agg.resume()
    agg.resume() // should be a no-op
    agg.tick()

    const snap = onSnapshot.mock.calls[0]![0] as OfficeSnapshot
    // Worker existed at resume — should be working, not spawning
    expect(snap.workers[0]!.activity).toBe('working')
    agg.dispose()
  })
})
