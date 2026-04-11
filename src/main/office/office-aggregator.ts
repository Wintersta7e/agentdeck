import type { Clock, OfficeSnapshot, OfficeWorker } from '../../shared/office-types'
import type { OfficeSessionRegistry } from './office-session-registry'
import { IDLE_COFFEE_MS, IDLE_WINDOW_MS } from '../../shared/office-constants'

const SPAWNING_TICK_COUNT = 2
const TICK_INTERVAL_MS = 500

interface AggregatorDeps {
  registry: OfficeSessionRegistry
  clock: Clock
  appStore: { get(key: 'appPrefs'): { officeEnabled?: boolean | undefined } | undefined }
  onSnapshot: (snap: OfficeSnapshot) => void
}

export interface OfficeAggregator {
  resume(): void
  pause(): void
  /** Test hook — drives a snapshot build + emit. Production uses startTimer(). */
  tick(): void
  /** Start the production 500ms timer. */
  startTimer(): void
  dispose(): void
}

export function createOfficeAggregator(deps: AggregatorDeps): OfficeAggregator {
  const { registry, clock, appStore, onSnapshot } = deps
  let paused = true
  let timerHandle: ReturnType<typeof setInterval> | null = null

  const resumeBaseline = new Set<string>()
  const spawningTicksLeft = new Map<string, number>()
  const seenWorkerIds = new Set<string>()

  function isEnabled(): boolean {
    return appStore.get('appPrefs')?.officeEnabled !== false
  }

  function deriveActivity(worker: OfficeWorker): OfficeWorker['activity'] {
    const ticksLeft = spawningTicksLeft.get(worker.id) ?? 0
    if (ticksLeft > 0) return 'spawning'
    if (worker.idleMs >= IDLE_WINDOW_MS) return 'idle-window'
    if (worker.idleMs >= IDLE_COFFEE_MS) return 'idle-coffee'
    return 'working'
  }

  function tick(): void {
    if (paused) return
    if (!isEnabled()) return

    const rawWorkers = registry.getWorkers()

    for (const w of rawWorkers) {
      if (!seenWorkerIds.has(w.id)) {
        seenWorkerIds.add(w.id)
        if (!resumeBaseline.has(w.id)) {
          spawningTicksLeft.set(w.id, SPAWNING_TICK_COUNT)
        }
      }
    }

    const liveIds = new Set(rawWorkers.map((w) => w.id))
    const workers = rawWorkers.map((w) => {
      const activity = deriveActivity(w)
      const left = spawningTicksLeft.get(w.id)
      if (left !== undefined && left > 0) {
        spawningTicksLeft.set(w.id, left - 1)
      }
      return { ...w, activity }
    })

    for (const id of spawningTicksLeft.keys()) {
      if (!liveIds.has(id)) {
        spawningTicksLeft.delete(id)
        seenWorkerIds.delete(id)
      }
    }

    const snap: OfficeSnapshot = { monotonicAt: clock.now(), workers }
    onSnapshot(snap)
  }

  function resume(): void {
    if (!paused) return
    paused = false
    resumeBaseline.clear()
    for (const w of registry.getWorkers()) {
      resumeBaseline.add(w.id)
      seenWorkerIds.add(w.id)
    }
  }

  function pause(): void {
    paused = true
  }

  function startTimer(): void {
    if (timerHandle !== null) return
    timerHandle = setInterval(() => tick(), TICK_INTERVAL_MS)
  }

  function dispose(): void {
    // ARCH-07: Set paused first so a queued tick is a no-op
    paused = true
    if (timerHandle !== null) {
      clearInterval(timerHandle)
      timerHandle = null
    }
    spawningTicksLeft.clear()
    seenWorkerIds.clear()
    resumeBaseline.clear()
  }

  return { resume, pause, tick, startTimer, dispose }
}
