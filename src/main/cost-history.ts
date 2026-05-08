import { writeFile } from 'node:fs/promises'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import type { DailyCostEntry } from '../shared/types'
import { todayIsoKey, isoKeyFromTs } from '../shared/date-keys'
import { createLogger } from './logger'

const log = createLogger('cost-history')

export interface CostHistory {
  recordCost: (agentId: string, costUsd: number, tokens: number) => void
  getHistory: (days: number) => DailyCostEntry[]
  getBudget: () => number | null
  setBudget: (amount: number | null) => void
  flush: () => void
}

/**
 * Persisted shape on disk. `version` is bumped whenever the
 * DailyCostEntry shape changes incompatibly so old snapshots can be
 * detected and discarded rather than silently producing partial entries
 * with `undefined` numeric fields.
 */
const PERSISTED_VERSION = 1

interface PersistedData {
  version?: number
  entries: DailyCostEntry[]
  budget: number | null
}

function loadFromDisk(storePath: string): {
  entries: Map<string, DailyCostEntry>
  budget: number | null
} {
  try {
    if (!existsSync(storePath)) return { entries: new Map(), budget: null }
    const raw = readFileSync(storePath, 'utf-8')
    const data = JSON.parse(raw) as PersistedData
    if (data.version !== undefined && data.version !== PERSISTED_VERSION) {
      // Incompatible schema — discard rather than load entries with
      // possibly-mismatched fields. Next flush will rewrite at the
      // current version with whatever in-memory state is fresh.
      return { entries: new Map(), budget: null }
    }
    const entries = new Map<string, DailyCostEntry>((data.entries ?? []).map((e) => [e.date, e]))
    return { entries, budget: data.budget ?? null }
  } catch {
    return { entries: new Map(), budget: null }
  }
}

export function createCostHistory(storePath?: string): CostHistory {
  const { entries, budget: savedBudget } = storePath
    ? loadFromDisk(storePath)
    : { entries: new Map<string, DailyCostEntry>(), budget: null }
  let dailyBudget: number | null = savedBudget

  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function schedulFlush(): void {
    if (!storePath) return
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void writeToDiskAsync()
    }, 5_000)
  }

  function serialize(): string {
    const data: PersistedData = {
      version: PERSISTED_VERSION,
      entries: Array.from(entries.values()),
      budget: dailyBudget,
    }
    return JSON.stringify(data, null, 2)
  }

  async function writeToDiskAsync(): Promise<void> {
    if (!storePath) return
    try {
      await writeFile(storePath, serialize(), 'utf-8')
    } catch (err) {
      log.warn('async flush failed', { err: String(err) })
    }
  }

  function writeToDiskSync(): void {
    if (!storePath) return
    try {
      writeFileSync(storePath, serialize(), 'utf-8')
    } catch (err) {
      log.warn('sync flush failed', { err: String(err) })
    }
  }

  return {
    recordCost(agentId, costUsd, tokens) {
      const date = todayIsoKey()
      const existing = entries.get(date)
      if (existing) {
        existing.totalCostUsd += costUsd
        existing.perAgent[agentId] = (existing.perAgent[agentId] ?? 0) + costUsd
        existing.sessionCount += 1
        existing.tokenCount += tokens
      } else {
        entries.set(date, {
          date,
          totalCostUsd: costUsd,
          perAgent: { [agentId]: costUsd },
          sessionCount: 1,
          tokenCount: tokens,
        })
      }
      schedulFlush()
    },

    getHistory(days) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      // Use the shared local-time key so the cutoff matches entries written by recordCost
      const cutoffStr = isoKeyFromTs(cutoff.getTime())

      return Array.from(entries.values())
        .filter((e) => e.date >= cutoffStr)
        .sort((a, b) => a.date.localeCompare(b.date))
    },

    getBudget() {
      return dailyBudget
    },

    setBudget(amount) {
      dailyBudget = amount
      schedulFlush()
    },

    flush() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      // Synchronous at shutdown — `before-quit` handlers can't await a promise
      writeToDiskSync()
    },
  }
}
