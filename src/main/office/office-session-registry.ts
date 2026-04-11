import type { EventEmitter } from 'events'
import { createLogger } from '../logger'
import { normalizeProjectPath } from '../project-store'
import type { CostTracker } from '../cost-tracker'
import type {
  Clock,
  OfficeWorker,
  PtySpawnSuccessEvent,
  PtySpawnFailedEvent,
} from '../../shared/office-types'
import type { AgentId } from '../../shared/agents'
import { AGENTS } from '../../shared/agents'
import { MAX_PROJECT_NAME_LEN, MAX_SESSION_LABEL_LEN } from '../../shared/office-constants'

const log = createLogger('office-registry')

const MAX_DESKS = 20

// ARCH-04: Proper type guard for AgentId
const KNOWN_AGENT_IDS = new Set<string>(AGENTS.map((a) => a.id))
function isAgentId(s: string): s is AgentId {
  return KNOWN_AGENT_IDS.has(s)
}

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

interface InternalWorker {
  id: string
  agentId: AgentId
  projectId: string
  projectName: string
  sessionLabel: string
  startedAtEpoch: number
  startedAtMono: number
  deskIndex: number
  lastPtyDataAtMono: number
  lastActivityTitle: string
  lastActivityType: string
}

export function createOfficeSessionRegistry(deps: RegistryDeps): OfficeSessionRegistry {
  const { ptyBus, costTracker, projectStore, clock } = deps
  const workers = new Map<string, InternalWorker>()
  const freeDesks = new Set<number>()
  for (let i = 0; i < MAX_DESKS; i++) freeDesks.add(i)

  const sessionListeners = new Map<
    string,
    {
      dataFn: () => void
      exitFn: () => void
      activityFn: (event: { type: string; title: string }) => void
    }
  >()

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

    const listeners = sessionListeners.get(sessionId)
    if (listeners) {
      ptyBus.off(`data:${sessionId}`, listeners.dataFn)
      ptyBus.off(`exit:${sessionId}`, listeners.exitFn)
      ptyBus.off(`activity:${sessionId}`, listeners.activityFn)
      sessionListeners.delete(sessionId)
    }
  }

  function handleSpawnSuccess(event: PtySpawnSuccessEvent): void {
    const normalized = normalizeProjectPath(event.projectPath ?? '')
    if (normalized === '') {
      log.debug('Dropping projectless spawn event', { sessionId: event.sessionId })
      return
    }

    const project = projectStore.getProjectByPath(normalized)
    if (!project) {
      log.warn('Dropping spawn event for unknown project', {
        sessionId: event.sessionId,
        path: normalized,
      })
      return
    }

    // ARCH-04: Proper type guard instead of unsound cast
    if (!isAgentId(event.agent)) {
      log.warn('Dropping spawn event for unknown agent', {
        sessionId: event.sessionId,
        agent: event.agent,
      })
      return
    }

    if (workers.has(event.sessionId)) return

    const deskIndex = allocateDesk()
    if (deskIndex === null) {
      log.warn('Registry full — no desk available', { sessionId: event.sessionId })
      return
    }

    const agentDisplay = AGENTS.find((a) => a.id === event.agent)?.name ?? event.agent
    // SEC-04: Cap string lengths in snapshot payloads
    const cappedProjectName = project.name.slice(0, MAX_PROJECT_NAME_LEN)
    const sessionLabel = `${cappedProjectName} · ${agentDisplay}`.slice(0, MAX_SESSION_LABEL_LEN)

    const worker: InternalWorker = {
      id: event.sessionId,
      agentId: event.agent,
      projectId: project.id,
      projectName: cappedProjectName,
      sessionLabel,
      startedAtEpoch: event.startedAtEpoch,
      startedAtMono: event.startedAtMono,
      deskIndex,
      lastPtyDataAtMono: clock.now(),
      lastActivityTitle: '',
      lastActivityType: '',
    }
    workers.set(event.sessionId, worker)

    const dataFn = (): void => {
      const w = workers.get(event.sessionId)
      if (w) w.lastPtyDataAtMono = clock.now()
    }
    const exitFn = (): void => {
      removeWorker(event.sessionId)
      log.info('Office worker removed on exit', { sessionId: event.sessionId })
    }
    const activityFn = (actEvent: { type: string; title: string }): void => {
      const w = workers.get(event.sessionId)
      if (w) {
        w.lastActivityTitle = actEvent.title
        w.lastActivityType = actEvent.type
      }
    }
    ptyBus.on(`data:${event.sessionId}`, dataFn)
    ptyBus.on(`exit:${event.sessionId}`, exitFn)
    ptyBus.on(`activity:${event.sessionId}`, activityFn)
    sessionListeners.set(event.sessionId, { dataFn, exitFn, activityFn })

    log.info('Office worker created', {
      sessionId: worker.id,
      deskIndex,
      projectName: cappedProjectName,
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

  const successListener = (event: PtySpawnSuccessEvent): void => handleSpawnSuccess(event)
  const failedListener = (event: PtySpawnFailedEvent): void => handleSpawnFailed(event)
  ptyBus.on('spawn:success', successListener)
  ptyBus.on('spawn:failed', failedListener)

  return {
    // BUG-03: Removed dead deriveActivity — aggregator is the single source of truth for activity.
    // Registry returns raw idleMs and costUsd; aggregator applies activity thresholds.
    getWorkers(): OfficeWorker[] {
      const now = clock.now()
      return [...workers.values()]
        .map((w) => {
          // BUG-04: Clamp idleMs to >= 0
          const idleMs = Math.max(0, now - w.lastPtyDataAtMono)
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
            activity: 'working' as const, // neutral default — aggregator overrides
            idleMs,
            costUsd: usage?.totalCostUsd ?? 0,
            lastActivityTitle: w.lastActivityTitle,
            lastActivityType: w.lastActivityType,
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
        ptyBus.off(`activity:${sid}`, listeners.activityFn)
      }
      sessionListeners.clear()
      workers.clear()
      freeDesks.clear()
      for (let i = 0; i < MAX_DESKS; i++) freeDesks.add(i)
    },
  }
}
