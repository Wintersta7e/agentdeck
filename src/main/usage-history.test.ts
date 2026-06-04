import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUsageHistory } from './usage-history'
import { todayIsoKey } from '../shared/date-keys'

function tmpStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'usage-hist-')), 'usage-history.json')
}

const rec = (
  over: Partial<Parameters<ReturnType<typeof createUsageHistory>['recordSession']>[0]> = {},
) => ({
  sessionId: 's1',
  agent: 'claude-code',
  projectId: 'p1',
  startedAt: 1000,
  endedAt: 61000, // 60s
  filesChanged: 3,
  ...over,
})

describe('usage-history', () => {
  it('aggregates sessions, activeMs and filesChanged into today', () => {
    const h = createUsageHistory()
    h.recordSession(rec())
    h.recordSession(rec({ sessionId: 's2', agent: 'codex', endedAt: 31000, filesChanged: 1 }))
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
    h.recordSession(rec({ endedAt: 0, filesChanged: -5 }))
    const today = h.getHistory(1)[0]!
    expect(today.activeMs).toBe(0)
    expect(today.filesChanged).toBe(0)
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
})
