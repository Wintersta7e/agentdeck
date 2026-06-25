import type { SessionRecord } from '../shared/types'
import { createJsonStore } from './json-store'

const PERSISTED_VERSION = 1
const MAX_RECORDS = 10_000
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000

export interface SessionHistory {
  startSession: (rec: {
    sessionId: string
    projectId: string
    agent: string
    startedAt: number
  }) => void
  noteActivity: (sessionId: string, type: string) => void
  endSession: (
    sessionId: string,
    end: { endedAt: number; status: 'exited' | 'error' },
  ) => SessionRecord | null
  getHistory: (days: number) => SessionRecord[]
  flush: () => void
}

export function createSessionHistory(storePath?: string): SessionHistory {
  const store = createJsonStore<SessionRecord>({
    storePath,
    version: PERSISTED_VERSION,
    field: 'records',
    key: (r) => r.sessionId,
    logName: 'session-history',
    onLoad: (records) => {
      for (const rec of records) {
        // Back-compat: records written before lastActivityAt existed default to startedAt.
        if (rec.lastActivityAt === undefined) rec.lastActivityAt = rec.startedAt
        // Recover dangling records from an unclean shutdown — a null endedAt means the
        // app exited before the session's exit was recorded. Finalize at the last known
        // activity so the record never renders as a perpetual "running" row.
        if (rec.endedAt === null) {
          rec.endedAt = rec.lastActivityAt
          rec.status = 'error'
        }
      }
    },
    selectForWrite: (records) => {
      const cutoff = Date.now() - RETENTION_MS
      let arr = records
        .filter((r) => r.startedAt >= cutoff)
        .sort((a, b) => a.startedAt - b.startedAt)
      if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS)
      return arr
    },
  })
  const records = store.map

  return {
    startSession(rec) {
      records.set(rec.sessionId, {
        sessionId: rec.sessionId,
        projectId: rec.projectId,
        agent: rec.agent,
        startedAt: rec.startedAt,
        lastActivityAt: rec.startedAt,
        endedAt: null,
        status: 'exited',
        filesChanged: 0,
      })
      store.scheduleFlush()
    },
    noteActivity(sessionId, type) {
      const r = records.get(sessionId)
      if (!r) return
      // A finalized record must not be re-mutated by a late activity event (e.g. a
      // buffered PTY flush arriving after exit) — its active-time and file count are
      // already settled. Mirrors endSession's idempotency guard.
      if (r.endedAt !== null) return
      // Any activity advances the active-time clock; only writes bump filesChanged.
      // Persisted on endSession / next scheduled flush.
      r.lastActivityAt = Date.now()
      if (type === 'write') r.filesChanged += 1
    },
    endSession(sessionId, end) {
      const r = records.get(sessionId)
      if (!r) return null
      // Idempotent: an already-ended session must not re-apply — guards against
      // duplicate exit listeners double-counting usage downstream.
      if (r.endedAt !== null) return null
      r.endedAt = end.endedAt
      r.status = end.status
      store.scheduleFlush()
      return r
    },
    getHistory(days) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      return Array.from(records.values())
        .filter((r) => r.startedAt >= cutoff)
        .sort((a, b) => a.startedAt - b.startedAt)
    },
    flush() {
      store.flush()
    },
  }
}
