import { describe, it, expect } from 'vitest'
import { mergeSessionRows } from './useSessionHistory'
import type { SessionRecord, Session, Project } from '../../shared/types'

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'rec-1',
    projectId: 'proj-1',
    agent: 'claude-code',
    startedAt: 1000,
    lastActivityAt: 2000,
    endedAt: 2000,
    status: 'exited',
    filesChanged: 3,
    ...overrides,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    status: 'running',
    startedAt: 1000,
    approvalState: 'idle',
    seedTemplateId: null,
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    path: '/home/testuser/test-project',
    ...overrides,
  }
}

describe('mergeSessionRows', () => {
  it('returns rows from persisted records', () => {
    const records = [makeRecord({ sessionId: 'r1', startedAt: 100 })]
    const rows = mergeSessionRows(records, {}, {}, [])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sessionId).toBe('r1')
    expect(rows[0]?.endedAt).toBe(2000)
    expect(rows[0]?.filesChanged).toBe(3)
  })

  it('appends a live session not in records as running (endedAt null)', () => {
    const session = makeSession({ id: 'live-1', startedAt: 500, projectId: 'proj-1' })
    const projects = [makeProject({ id: 'proj-1' })]
    const rows = mergeSessionRows([], { 'live-1': session }, { 'live-1': 7 }, projects)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sessionId).toBe('live-1')
    expect(rows[0]?.endedAt).toBeNull()
    expect(rows[0]?.filesChanged).toBe(7)
    expect(rows[0]?.agent).toBe('claude-code')
  })

  it('record wins when a live session also appears in records (no duplication)', () => {
    const record = makeRecord({ sessionId: 'shared-1', endedAt: 9999, filesChanged: 10 })
    const session = makeSession({ id: 'shared-1', startedAt: 1000 })
    const rows = mergeSessionRows([record], { 'shared-1': session }, { 'shared-1': 99 }, [])
    expect(rows).toHaveLength(1)
    // Record is authoritative — endedAt and filesChanged come from the record
    expect(rows[0]?.endedAt).toBe(9999)
    expect(rows[0]?.filesChanged).toBe(10)
  })

  it('sorts rows by startedAt ascending', () => {
    const records = [
      makeRecord({ sessionId: 'r-late', startedAt: 3000, endedAt: 4000 }),
      makeRecord({ sessionId: 'r-early', startedAt: 1000, endedAt: 2000 }),
    ]
    const rows = mergeSessionRows(records, {}, {}, [])
    expect(rows.map((r) => r.sessionId)).toEqual(['r-early', 'r-late'])
  })

  it('live session filesChanged defaults to 0 when not in writeCounts', () => {
    const session = makeSession({ id: 'no-writes' })
    const rows = mergeSessionRows([], { 'no-writes': session }, {}, [])
    expect(rows[0]?.filesChanged).toBe(0)
  })
})
