import type { DailyUsageEntry, SessionUsageRecord, UsageTotals } from '../shared/types'
import { isoKeyFromTs } from '../shared/date-keys'
import { createJsonStore } from './json-store'

const PERSISTED_VERSION = 1

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

export function createUsageHistory(storePath?: string): UsageHistory {
  const store = createJsonStore<DailyUsageEntry>({
    storePath,
    version: PERSISTED_VERSION,
    field: 'entries',
    key: (e) => e.date,
    logName: 'usage-history',
  })
  const entries = store.map

  return {
    recordSession(rec) {
      const date = isoKeyFromTs(rec.startedAt)
      const entry = entries.get(date) ?? emptyEntry(date)
      const activeMs = Math.max(0, rec.lastActivityAt - rec.startedAt)
      const files = Math.max(0, rec.filesChanged)

      addInto(entry, activeMs, files)
      const proj = entry.perProject[rec.projectId] ?? emptyTotals()
      addInto(proj, activeMs, files)
      entry.perProject[rec.projectId] = proj
      const ag = entry.perAgent[rec.agent] ?? emptyTotals()
      addInto(ag, activeMs, files)
      entry.perAgent[rec.agent] = ag

      entries.set(date, entry)
      store.scheduleFlush()
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
      store.flush()
    },
  }
}
