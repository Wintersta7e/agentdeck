import { renameSync, readFileSync, existsSync } from 'node:fs'
import type { SessionRecord } from '../shared/types'
import { atomicWrite, atomicWriteSync } from './fs-atomic'
import { createLogger } from './logger'

const log = createLogger('session-history')
const PERSISTED_VERSION = 1
const MAX_RECORDS = 10_000
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000

interface PersistedData {
  version?: number
  records: SessionRecord[]
}

export interface SessionHistory {
  startSession: (rec: {
    sessionId: string
    projectId: string
    agent: string
    startedAt: number
  }) => void
  noteWrite: (sessionId: string) => void
  endSession: (sessionId: string, end: { endedAt: number; status: 'exited' | 'error' }) => void
  getHistory: (days: number) => SessionRecord[]
  flush: () => void
}

function loadFromDisk(storePath: string): Map<string, SessionRecord> {
  try {
    if (!existsSync(storePath)) return new Map()
    const data = JSON.parse(readFileSync(storePath, 'utf-8')) as PersistedData
    if (data.version !== undefined && data.version !== PERSISTED_VERSION) return new Map()
    return new Map((data.records ?? []).map((r) => [r.sessionId, r]))
  } catch (err) {
    try {
      renameSync(storePath, `${storePath}.bad`)
      log.error('session-history unreadable; preserved as .bad', { err: String(err) })
    } catch (renameErr) {
      log.error('session-history unreadable AND rename failed', {
        err: String(err),
        renameErr: String(renameErr),
      })
    }
    return new Map()
  }
}

export function createSessionHistory(storePath?: string): SessionHistory {
  const records = storePath ? loadFromDisk(storePath) : new Map<string, SessionRecord>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleFlush(): void {
    if (!storePath || flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void writeAsync()
    }, 5_000)
  }

  function prunedRecords(): SessionRecord[] {
    const cutoff = Date.now() - RETENTION_MS
    let arr = Array.from(records.values())
      .filter((r) => r.startedAt >= cutoff)
      .sort((a, b) => a.startedAt - b.startedAt)
    if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS)
    return arr
  }

  function serialize(): string {
    return JSON.stringify({ version: PERSISTED_VERSION, records: prunedRecords() }, null, 2)
  }

  async function writeAsync(): Promise<void> {
    if (!storePath) return
    try {
      await atomicWrite(storePath, serialize())
    } catch (err) {
      log.warn('async flush failed', { err: String(err) })
    }
  }

  function writeSync(): void {
    if (!storePath) return
    try {
      atomicWriteSync(storePath, serialize())
    } catch (err) {
      log.warn('sync flush failed', { err: String(err) })
    }
  }

  return {
    startSession(rec) {
      records.set(rec.sessionId, {
        sessionId: rec.sessionId,
        projectId: rec.projectId,
        agent: rec.agent,
        startedAt: rec.startedAt,
        endedAt: null,
        status: 'exited',
        filesChanged: 0,
      })
      scheduleFlush()
    },
    noteWrite(sessionId) {
      const r = records.get(sessionId)
      if (r) r.filesChanged += 1 // persisted on endSession / next scheduled flush
    },
    endSession(sessionId, end) {
      const r = records.get(sessionId)
      if (!r) return
      r.endedAt = end.endedAt
      r.status = end.status
      scheduleFlush()
    },
    getHistory(days) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      return Array.from(records.values())
        .filter((r) => r.startedAt >= cutoff)
        .sort((a, b) => a.startedAt - b.startedAt)
    },
    flush() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      writeSync()
    },
  }
}
