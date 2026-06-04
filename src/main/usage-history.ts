import { renameSync, readFileSync, existsSync } from 'node:fs'
import type { DailyUsageEntry, SessionUsageRecord, UsageTotals } from '../shared/types'
import { isoKeyFromTs } from '../shared/date-keys'
import { atomicWrite, atomicWriteSync } from './fs-atomic'
import { createLogger } from './logger'

const log = createLogger('usage-history')

const PERSISTED_VERSION = 1

interface PersistedData {
  version?: number
  entries: DailyUsageEntry[]
}

export interface UsageHistory {
  recordSession: (rec: SessionUsageRecord) => void
  getHistory: (days: number) => DailyUsageEntry[]
  flush: () => void
}

function emptyTotals(): UsageTotals {
  return { sessions: 0, activeMs: 0, filesChanged: 0 }
}

function emptyEntry(date: string): DailyUsageEntry {
  return { date, ...emptyTotals(), perProject: {}, perAgent: {} }
}

function addInto(target: UsageTotals, activeMs: number, files: number): void {
  target.sessions += 1
  target.activeMs += activeMs
  target.filesChanged += files
}

function loadFromDisk(storePath: string): Map<string, DailyUsageEntry> {
  try {
    if (!existsSync(storePath)) return new Map()
    const data = JSON.parse(readFileSync(storePath, 'utf-8')) as PersistedData
    if (data.version !== undefined && data.version !== PERSISTED_VERSION) return new Map()
    return new Map((data.entries ?? []).map((e) => [e.date, e]))
  } catch (err) {
    try {
      renameSync(storePath, `${storePath}.bad`)
      log.error('usage-history unreadable; preserved as .bad', { err: String(err) })
    } catch (renameErr) {
      log.error('usage-history unreadable AND rename failed', {
        err: String(err),
        renameErr: String(renameErr),
      })
    }
    return new Map()
  }
}

export function createUsageHistory(storePath?: string): UsageHistory {
  const entries = storePath ? loadFromDisk(storePath) : new Map<string, DailyUsageEntry>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleFlush(): void {
    if (!storePath || flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void writeAsync()
    }, 5_000)
  }

  function serialize(): string {
    return JSON.stringify(
      { version: PERSISTED_VERSION, entries: Array.from(entries.values()) },
      null,
      2,
    )
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
    recordSession(rec) {
      const date = isoKeyFromTs(rec.startedAt)
      const entry = entries.get(date) ?? emptyEntry(date)
      const activeMs = Math.max(0, rec.endedAt - rec.startedAt)
      const files = Math.max(0, rec.filesChanged)

      addInto(entry, activeMs, files)
      const proj = entry.perProject[rec.projectId] ?? emptyTotals()
      addInto(proj, activeMs, files)
      entry.perProject[rec.projectId] = proj
      const ag = entry.perAgent[rec.agent] ?? emptyTotals()
      addInto(ag, activeMs, files)
      entry.perAgent[rec.agent] = ag

      entries.set(date, entry)
      scheduleFlush()
    },

    getHistory(days) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = isoKeyFromTs(cutoff.getTime())
      return Array.from(entries.values())
        .filter((e) => e.date >= cutoffStr)
        .sort((a, b) => a.date.localeCompare(b.date))
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
