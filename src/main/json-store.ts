import { renameSync, readFileSync, existsSync } from 'node:fs'
import { atomicWrite, atomicWriteSync } from './fs-atomic'
import { createLogger } from './logger'

export interface JsonStoreOptions<T> {
  /** Absolute path to the JSON file. Omit for a purely in-memory store. */
  storePath?: string | undefined
  /** Persisted schema version; a mismatch on load discards the file. */
  version: number
  /**
   * Envelope field holding the item array on disk (e.g. 'records', 'entries').
   * Must stay stable for a given store so existing files keep loading.
   */
  field: string
  /** Stable per-item key used for the in-memory map. */
  key: (item: T) => string
  /** Logger module name used for I/O warnings. */
  logName: string
  /** Debounce window for async flushes, in ms (default 5000). */
  debounceMs?: number
  /** Runs once over freshly loaded items — for in-place migration / recovery. */
  onLoad?: (items: T[]) => void
  /** Selects/orders the items to persist (default: all current values). */
  selectForWrite?: (items: T[]) => T[]
}

export interface JsonStore<T> {
  /** Live map of key → item. Mutate directly, then call scheduleFlush(). */
  readonly map: Map<string, T>
  /** Queue a debounced async flush. No-op without a storePath. */
  scheduleFlush: () => void
  /** Cancel any pending flush and write synchronously (before-quit safe). */
  flush: () => void
}

/**
 * A disk-backed, versioned JSON store: an in-memory `Map` mirrored to a single
 * file via atomic writes, with corrupt-file recovery (renames to `.bad`) and a
 * debounced async flush. Domain stores own the item shape and mutation logic;
 * this factory owns load, persistence, and lifecycle.
 */
export function createJsonStore<T>(opts: JsonStoreOptions<T>): JsonStore<T> {
  const { storePath, version, field, key, logName, onLoad, selectForWrite } = opts
  const debounceMs = opts.debounceMs ?? 5_000
  const log = createLogger(logName)

  function load(): Map<string, T> {
    if (!storePath || !existsSync(storePath)) return new Map()
    try {
      const data = JSON.parse(readFileSync(storePath, 'utf-8')) as {
        version?: number
        [k: string]: unknown
      }
      if (data.version !== undefined && data.version !== version) return new Map()
      const items = (data[field] as T[] | undefined) ?? []
      return new Map(items.map((it) => [key(it), it]))
    } catch (err) {
      try {
        renameSync(storePath, `${storePath}.bad`)
        log.error(`${logName} unreadable; preserved as .bad`, { err: String(err) })
      } catch (renameErr) {
        log.error(`${logName} unreadable AND rename failed`, {
          err: String(err),
          renameErr: String(renameErr),
        })
      }
      return new Map()
    }
  }

  const map = load()
  if (onLoad) onLoad(Array.from(map.values()))

  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function serialize(): string {
    const all = Array.from(map.values())
    const items = selectForWrite ? selectForWrite(all) : all
    return JSON.stringify({ version, [field]: items }, null, 2)
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
    map,
    scheduleFlush() {
      if (!storePath || flushTimer !== null) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        void writeAsync()
      }, debounceMs)
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
