import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUsageHistory } from './usage-history'
import { todayIsoKey, isoKeyFromTs } from '../shared/date-keys'

function tmpStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'usage-hist-')), 'usage-history.json')
}

// Use today timestamps so isoKeyFromTs(startedAt) == todayIsoKey()
const BASE_START = Date.now() - 60_000
const BASE_END = Date.now()

const rec = (
  over: Partial<Parameters<ReturnType<typeof createUsageHistory>['recordSession']>[0]> = {},
) => ({
  sessionId: 's1',
  agent: 'claude-code',
  projectId: 'p1',
  startedAt: BASE_START,
  lastActivityAt: BASE_END, // ~60s of activity
  filesChanged: 3,
  ...over,
})

describe('usage-history', () => {
  it('aggregates sessions, activeMs and filesChanged into today', () => {
    const h = createUsageHistory()
    h.recordSession(rec()) // 60s
    h.recordSession(
      rec({
        sessionId: 's2',
        agent: 'codex',
        startedAt: BASE_START,
        lastActivityAt: BASE_START + 30000,
        filesChanged: 1,
      }),
    ) // 30s
    const today = h.getHistory(1)[0]!
    expect(today.date).toBe(todayIsoKey())
    expect(today.sessions).toBe(2)
    expect(today.activeMs).toBe(60000 + 30000)
    expect(today.filesChanged).toBe(4)
    expect(today.perAgent['claude-code']).toEqual({ sessions: 1, activeMs: 60000, filesChanged: 3 })
    expect(today.perProject['p1']!.sessions).toBe(2)
  })

  it('clamps negative durations/files to zero', () => {
    const h = createUsageHistory()
    h.recordSession(rec({ lastActivityAt: 0, filesChanged: -5 }))
    const today = h.getHistory(1)[0]!
    expect(today.activeMs).toBe(0)
    expect(today.filesChanged).toBe(0)
  })

  it('counts active time up to the last activity, not the session lifespan', () => {
    const h = createUsageHistory()
    // Started ~60s ago but the last activity was only 2s in — the idle tail
    // (a session left open) must not inflate active time.
    h.recordSession(rec({ startedAt: BASE_START, lastActivityAt: BASE_START + 2_000 }))
    expect(h.getHistory(1)[0]!.activeMs).toBe(2_000)
  })

  it('persists and reloads across instances (survives restart)', () => {
    const store = tmpStore()
    const h1 = createUsageHistory(store)
    h1.recordSession(rec({ filesChanged: 7 }))
    h1.flush()
    const h2 = createUsageHistory(store)
    expect(h2.getHistory(1)[0]!.filesChanged).toBe(7)
    rmSync(store, { force: true })
  })

  it('discards entries written at an incompatible version', () => {
    const store = tmpStore()
    const h1 = createUsageHistory(store)
    h1.recordSession(rec())
    h1.flush()
    const raw = JSON.parse(readFileSync(store, 'utf-8'))
    raw.version = 999
    writeFileSync(store, JSON.stringify(raw))
    const h2 = createUsageHistory(store)
    expect(h2.getHistory(30)).toHaveLength(0)
    rmSync(store, { force: true })
  })

  // COV-02: multi-day window — old entry outside window is excluded
  it('excludes entries older than the requested day window', () => {
    const store = tmpStore()
    const h = createUsageHistory(store)
    // Record a session today
    h.recordSession(rec())
    h.flush()
    // Inject an 8-day-old entry directly into the JSON file
    const eightDaysAgoTs = Date.now() - 8 * 24 * 60 * 60 * 1000
    const oldDate = isoKeyFromTs(eightDaysAgoTs)
    const raw = JSON.parse(readFileSync(store, 'utf-8'))
    raw.entries.push({
      date: oldDate,
      sessions: 1,
      activeMs: 1000,
      filesChanged: 1,
      perProject: {},
      perAgent: {},
    })
    writeFileSync(store, JSON.stringify(raw))
    const h2 = createUsageHistory(store)
    const history = h2.getHistory(7)
    expect(history.find((e) => e.date === oldDate)).toBeUndefined()
    expect(history.find((e) => e.date === todayIsoKey())).toBeDefined()
    rmSync(store, { force: true })
  })

  // COV-03: distinct project and agent keys are tracked independently
  it('tracks perProject and perAgent independently across sessions', () => {
    const h = createUsageHistory()
    h.recordSession(
      rec({ sessionId: 's1', projectId: 'p1', agent: 'claude-code', filesChanged: 2 }),
    )
    h.recordSession(
      rec({
        sessionId: 's2',
        projectId: 'p2',
        agent: 'codex',
        startedAt: BASE_START,
        lastActivityAt: BASE_START + 30000,
        filesChanged: 5,
      }),
    )
    const today = h.getHistory(1)[0]!
    expect(today.perProject['p1']!.sessions).toBe(1)
    expect(today.perProject['p1']!.filesChanged).toBe(2)
    expect(today.perProject['p2']!.sessions).toBe(1)
    expect(today.perProject['p2']!.filesChanged).toBe(5)
    expect(today.perAgent['claude-code']!.sessions).toBe(1)
    expect(today.perAgent['codex']!.sessions).toBe(1)
    expect(today.perAgent['codex']!.activeMs).toBe(30000)
  })

  // COV-07: flush on an in-memory-only instance (no storePath) must not throw
  it('flush is a no-op when no storePath is provided', () => {
    const h = createUsageHistory()
    h.recordSession(rec())
    expect(() => h.flush()).not.toThrow()
  })
})
