import type { EventEmitter } from 'events'
import { createLogger } from '../logger'
import { normalizeProjectPath } from '../project-store'
import type { CostTracker } from '../cost-tracker'
import type {
  Clock,
  OfficeWorker,
  PtySpawnSuccessEvent,
  PtySpawnFailedEvent,
  WorkerActivity,
} from '../../shared/office-types'
import { AGENTS, AGENT_BINARY_MAP } from '../../shared/agents'

const log = createLogger('office-registry')

const MAX_DESKS = 20

/** Idle thresholds in milliseconds. */
const IDLE_COFFEE_MS = 2 * 60 * 1000 // 2 min → idle-coffee
const IDLE_WINDOW_MS = 5 * 60 * 1000 // 5 min → idle-window
const SPAWNING_TIMEOUT_MS = 30 * 1000 // 30 s → auto-transition from spawning

export interface RegistryDeps {
  ptyBus: EventEmitter
  costTracker: Pick<CostTracker, 'getUsageForSession'>
  projectStore: {
    getProjectByPath(path: string): { id: string; name: string; path: string } | null
  }
  appStore: { get(key: 'appPrefs'): { officeEnabled?: boolean | undefined } | undefined }
  clock: Clock
}

export interface OfficeSessionRegistry {
  getWorkers(): OfficeWorker[]
  hasActiveWorker(sessionId: string): boolean
  dispose(): void
}

interface InternalWorker extends OfficeWorker {
  lastPtyDataAtMono: number
}

export function createOfficeSessionRegistry(deps: RegistryDeps): OfficeSessionRegistry {
  const { ptyBus, costTracker, projectStore, clock } = deps
  const workers = new Map<string, InternalWorker>()
  const freeDesks = new Set<number>()
  for (let i = 0; i < MAX_DESKS; i++) freeDesks.add(i)

  // Per-session listeners tracked so we can clean up on exit
  const sessionListeners = new Map<string, { dataFn: () => void; exitFn: () => void }>()

  function allocateDesk(): number | null {
    const sorted = [...freeDesks].sort((a, b) => a - b)
    const next = sorted[0]
    if (next === undefined) return null
    freeDesks.delete(next)
    return next
  }

  function releaseDesk(index: number): void {
    freeDesks.add(index)
  }

  function removeWorker(sessionId: string): void {
    const worker = workers.get(sessionId)
    if (!worker) return
    releaseDesk(worker.deskIndex)
    workers.delete(sessionId)

    // Clean up per-session listeners
    const listeners = sessionListeners.get(sessionId)
    if (listeners) {
      ptyBus.off(`data:${sessionId}`, listeners.dataFn)
      ptyBus.off(`exit:${sessionId}`, listeners.exitFn)
      sessionListeners.delete(sessionId)
    }
  }

  function deriveActivity(worker: InternalWorker): WorkerActivity {
    const idleMs = clock.now() - worker.lastPtyDataAtMono

    // spawning → working transition after first data event
    if (worker.activity === 'spawning') {
      if (idleMs === 0 || clock.now() - worker.startedAtMono > SPAWNING_TIMEOUT_MS) {
        // First data came, or spawning timed out
      } else {
        return 'spawning'
      }
    }

    if (idleMs >= IDLE_WINDOW_MS) return 'idle-window'
    if (idleMs >= IDLE_COFFEE_MS) return 'idle-coffee'
    return 'working'
  }

  function handleSpawnSuccess(event: PtySpawnSuccessEvent): void {
    // Projectless → drop
    const normalized = normalizeProjectPath(event.projectPath ?? '')
    if (normalized === '') {
      log.debug('Dropping projectless spawn event', { sessionId: event.sessionId })
      return
    }

    // Project not found → drop
    const project = projectStore.getProjectByPath(normalized)
    if (!project) {
      log.warn('Dropping spawn event for unknown project', {
        sessionId: event.sessionId,
        path: normalized,
      })
      return
    }

    // Agent not recognized → drop
    if (!(event.agent in AGENT_BINARY_MAP)) {
      log.warn('Dropping spawn event for unknown agent', {
        sessionId: event.sessionId,
        agent: event.agent,
      })
      return
    }

    // Duplicate → skip
    if (workers.has(event.sessionId)) return

    // Allocate desk
    const deskIndex = allocateDesk()
    if (deskIndex === null) {
      log.warn('Registry full — no desk available', { sessionId: event.sessionId })
      return
    }

    const agentDisplay = AGENTS.find((a) => a.id === event.agent)?.name ?? event.agent
    const sessionLabel = `${project.name} · ${agentDisplay}`

    const worker: InternalWorker = {
      id: event.sessionId,
      agentId: event.agent as OfficeWorker['agentId'],
      projectId: project.id,
      projectName: project.name,
      sessionLabel,
      startedAtEpoch: event.startedAtEpoch,
      startedAtMono: event.startedAtMono,
      deskIndex,
      activity: 'spawning',
      idleMs: 0,
      costUsd: 0,
      lastPtyDataAtMono: clock.now(),
    }
    workers.set(event.sessionId, worker)

    // Subscribe to per-session data/exit events
    const dataFn = (): void => {
      const w = workers.get(event.sessionId)
      if (w) w.lastPtyDataAtMono = clock.now()
    }
    const exitFn = (): void => {
      removeWorker(event.sessionId)
      log.info('Office worker removed on exit', { sessionId: event.sessionId })
    }
    ptyBus.on(`data:${event.sessionId}`, dataFn)
    ptyBus.on(`exit:${event.sessionId}`, exitFn)
    sessionListeners.set(event.sessionId, { dataFn, exitFn })

    log.info('Office worker created', {
      sessionId: worker.id,
      deskIndex,
      projectName: project.name,
    })
  }

  function handleSpawnFailed(event: PtySpawnFailedEvent): void {
    if (workers.has(event.sessionId)) {
      log.warn('spawn:failed for active worker — releasing desk', {
        sessionId: event.sessionId,
      })
      removeWorker(event.sessionId)
    }
  }

  // Subscribe to broadcast channels
  const successListener = (event: PtySpawnSuccessEvent): void => handleSpawnSuccess(event)
  const failedListener = (event: PtySpawnFailedEvent): void => handleSpawnFailed(event)
  ptyBus.on('spawn:success', successListener)
  ptyBus.on('spawn:failed', failedListener)

  return {
    getWorkers(): OfficeWorker[] {
      const now = clock.now()
      return [...workers.values()]
        .map((w) => {
          const idleMs = now - w.lastPtyDataAtMono
          const activity = deriveActivity(w)
          const usage = costTracker.getUsageForSession(w.id)
          return {
            id: w.id,
            agentId: w.agentId,
            projectId: w.projectId,
            projectName: w.projectName,
            sessionLabel: w.sessionLabel,
            startedAtEpoch: w.startedAtEpoch,
            startedAtMono: w.startedAtMono,
            deskIndex: w.deskIndex,
            activity,
            idleMs,
            costUsd: usage?.totalCostUsd ?? 0,
          }
        })
        .sort((a, b) => {
          if (a.startedAtMono !== b.startedAtMono) return a.startedAtMono - b.startedAtMono
          return a.id.localeCompare(b.id)
        })
    },

    hasActiveWorker(sessionId: string): boolean {
      return workers.has(sessionId)
    },

    dispose(): void {
      ptyBus.off('spawn:success', successListener)
      ptyBus.off('spawn:failed', failedListener)
      for (const [sid, listeners] of sessionListeners) {
        ptyBus.off(`data:${sid}`, listeners.dataFn)
        ptyBus.off(`exit:${sid}`, listeners.exitFn)
      }
      sessionListeners.clear()
      workers.clear()
      freeDesks.clear()
      for (let i = 0; i < MAX_DESKS; i++) freeDesks.add(i)
    },
  }
}
