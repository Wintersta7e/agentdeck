import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionHistory } from './session-history'

function tmpStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'sess-hist-')), 'session-history.json')
}

const NOW = Date.now()

function makeRec(
  over: {
    sessionId?: string
    projectId?: string
    agent?: string
    startedAt?: number
  } = {},
) {
  return {
    sessionId: 's1',
    projectId: 'p1',
    agent: 'claude-code',
    startedAt: NOW - 60_000,
    ...over,
  }
}

describe('session-history', () => {
  it('startSession creates a running row (endedAt null, filesChanged 0)', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    const rows = h.getHistory(1)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.sessionId).toBe('s1')
    expect(row.projectId).toBe('p1')
    expect(row.agent).toBe('claude-code')
    expect(row.endedAt).toBeNull()
    expect(row.filesChanged).toBe(0)
  })

  it('noteActivity with a write type increments filesChanged', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    h.noteActivity('s1', 'write')
    h.noteActivity('s1', 'write')
    const row = h.getHistory(1)[0]!
    expect(row.filesChanged).toBe(2)
  })

  it('noteActivity with a non-write type advances activity but not filesChanged', () => {
    const h = createSessionHistory()
    // startedAt is 60s ago, so any activity recorded "now" advances lastActivityAt.
    h.startSession(makeRec())
    h.noteActivity('s1', 'read')
    const row = h.getHistory(1)[0]!
    expect(row.filesChanged).toBe(0)
    expect(row.lastActivityAt).toBeGreaterThan(row.startedAt)
  })

  it('noteActivity on unknown session is a no-op', () => {
    const h = createSessionHistory()
    expect(() => h.noteActivity('unknown', 'write')).not.toThrow()
  })

  it('startSession seeds lastActivityAt to startedAt', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    const row = h.getHistory(1)[0]!
    expect(row.lastActivityAt).toBe(row.startedAt)
  })

  it('endSession returns lastActivityAt at the last activity, leaving the idle tail out', () => {
    vi.useFakeTimers()
    try {
      const start = Date.parse('2026-06-07T10:00:00Z')
      vi.setSystemTime(start)
      const h = createSessionHistory()
      h.startSession(makeRec({ startedAt: start }))

      vi.setSystemTime(start + 5 * 60_000) // last activity 5 min in
      h.noteActivity('s1', 'write')

      vi.setSystemTime(start + 3 * 60 * 60_000) // closed 3h in (idle ~2h55m)
      const rec = h.endSession('s1', { endedAt: Date.now(), status: 'exited' })

      expect(rec).not.toBeNull()
      expect(rec!.lastActivityAt).toBe(start + 5 * 60_000)
      expect(rec!.endedAt).toBe(start + 3 * 60 * 60_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('endSession sets endedAt and status', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    h.endSession('s1', { endedAt: NOW, status: 'exited' })
    const row = h.getHistory(1)[0]!
    expect(row.endedAt).toBe(NOW)
    expect(row.status).toBe('exited')
  })

  it('endSession with error status is recorded', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    h.endSession('s1', { endedAt: NOW, status: 'error' })
    const row = h.getHistory(1)[0]!
    expect(row.status).toBe('error')
  })

  it('endSession on unknown session is a no-op', () => {
    const h = createSessionHistory()
    expect(() => h.endSession('nope', { endedAt: NOW, status: 'exited' })).not.toThrow()
    expect(h.getHistory(1)).toHaveLength(0)
  })

  it('endSession is idempotent — a second call returns null and preserves the first end', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    const first = h.endSession('s1', { endedAt: NOW, status: 'exited' })
    expect(first).not.toBeNull()
    // A duplicate end (e.g. two exit listeners firing) must not re-apply.
    const second = h.endSession('s1', { endedAt: NOW + 5000, status: 'error' })
    expect(second).toBeNull()
    const row = h.getHistory(1)[0]!
    expect(row.endedAt).toBe(NOW)
    expect(row.status).toBe('exited')
  })

  it('persists and reloads across instances (survives restart)', () => {
    const store = tmpStore()
    const h1 = createSessionHistory(store)
    h1.startSession(makeRec())
    h1.noteActivity('s1', 'write')
    h1.endSession('s1', { endedAt: NOW, status: 'exited' })
    h1.flush()

    const h2 = createSessionHistory(store)
    const rows = h2.getHistory(1)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.filesChanged).toBe(1)
    expect(row.endedAt).toBe(NOW)
    expect(row.status).toBe('exited')

    rmSync(store, { force: true })
  })

  it('discards records written at an incompatible version', () => {
    const store = tmpStore()
    const h1 = createSessionHistory(store)
    h1.startSession(makeRec())
    h1.flush()

    const raw = JSON.parse(readFileSync(store, 'utf-8'))
    raw.version = 999
    writeFileSync(store, JSON.stringify(raw))

    const h2 = createSessionHistory(store)
    expect(h2.getHistory(30)).toHaveLength(0)

    rmSync(store, { force: true })
  })

  it('getHistory(days) excludes records older than the window', () => {
    const store = tmpStore()
    const h = createSessionHistory(store)
    // Recent session (within 7 days)
    h.startSession(makeRec({ sessionId: 's-recent', startedAt: NOW - 60_000 }))
    h.flush()

    // Inject an 8-day-old record directly into the JSON file
    const eightDaysAgoTs = NOW - 8 * 24 * 60 * 60 * 1000
    const raw = JSON.parse(readFileSync(store, 'utf-8'))
    raw.records.push({
      sessionId: 's-old',
      projectId: 'p1',
      agent: 'claude-code',
      startedAt: eightDaysAgoTs,
      endedAt: eightDaysAgoTs + 30_000,
      status: 'exited',
      filesChanged: 0,
    })
    writeFileSync(store, JSON.stringify(raw))

    const h2 = createSessionHistory(store)
    const rows = h2.getHistory(7)
    expect(rows.find((r) => r.sessionId === 's-old')).toBeUndefined()
    expect(rows.find((r) => r.sessionId === 's-recent')).toBeDefined()

    rmSync(store, { force: true })
  })

  it('flush is a no-op when no storePath is provided', () => {
    const h = createSessionHistory()
    h.startSession(makeRec())
    expect(() => h.flush()).not.toThrow()
  })

  it('finalizes dangling endedAt:null records on load (crash recovery)', () => {
    const store = tmpStore()

    // Write a store file that contains a record with endedAt:null (simulating a
    // hard crash before the exit handler ran).
    const raw = {
      version: 1,
      records: [
        {
          sessionId: 's-dangling',
          projectId: 'p1',
          agent: 'claude-code',
          startedAt: NOW - 120_000,
          endedAt: null,
          status: 'exited',
          filesChanged: 3,
        },
      ],
    }
    writeFileSync(store, JSON.stringify(raw))

    const h = createSessionHistory(store)
    const rows = h.getHistory(1)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // endedAt must be set (not null) so the record doesn't render as "running"
    expect(row.endedAt).not.toBeNull()
    // status must be 'error' to indicate an unclean shutdown
    expect(row.status).toBe('error')

    rmSync(store, { force: true })
  })
})
