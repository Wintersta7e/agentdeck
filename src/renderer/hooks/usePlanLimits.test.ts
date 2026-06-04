import { describe, it, expect } from 'vitest'
import { computeActivityWindow, computeAgentActivity, resolveWindow } from './usePlanLimits'
import type { Project, Session, PlanWindow } from '../../shared/types'

const session = (over: Partial<Session>): Session =>
  ({
    id: 's',
    projectId: 'p',
    status: 'running',
    startedAt: 0,
    approvalState: 'idle',
    seedTemplateId: null,
    ...over,
  }) as Session

const project = (id: string, agent: string): Project =>
  ({
    id,
    name: id,
    path: `/home/user/${id}`,
    agents: [{ agent, isDefault: true }],
  }) as Project

describe('resolveWindow', () => {
  const now = 2_000_000 // ms
  it('passes a window through when not yet reset', () => {
    const w: PlanWindow = {
      usedPercent: 40,
      windowMinutes: 300,
      resetsAt: Math.floor(now / 1000) + 600,
    }
    expect(resolveWindow(w, now)).toEqual({
      usedPercent: 40,
      windowMinutes: 300,
      resetsAt: w.resetsAt,
      resetsInSec: 600,
    })
  })
  it('reports 0% once the window has reset (resets_at in the past)', () => {
    const w: PlanWindow = {
      usedPercent: 80,
      windowMinutes: 300,
      resetsAt: Math.floor(now / 1000) - 10,
    }
    const r = resolveWindow(w, now)
    expect(r!.usedPercent).toBe(0)
    expect(r!.resetsInSec).toBe(0)
  })
  it('returns null for a null window', () => {
    expect(resolveWindow(null, now)).toBeNull()
  })
})

describe('computeActivityWindow', () => {
  const now = 10 * 3_600_000 // 10h in ms
  const fiveHAgo = now - 5 * 3_600_000
  it('counts claude sessions active within the last 5h and sums their time', () => {
    const sessions = {
      a: session({ id: 'a', startedAt: fiveHAgo + 3_600_000 }), // 4h ago → 4h active
      old: session({ id: 'old', startedAt: fiveHAgo - 3_600_000 }), // 6h ago → excluded
    }
    const r = computeActivityWindow({ sessions, now })
    expect(r.sessions).toBe(1)
    expect(r.activeMs).toBe(4 * 3_600_000)
  })

  it('counts an exited session in the window but does not add its unmeasurable active time', () => {
    const sessions = {
      live: session({ id: 'live', startedAt: now - 600_000, status: 'running' }), // 10m, live
      done: session({ id: 'done', startedAt: fiveHAgo + 600_000, status: 'exited' }), // within 5h, exited
    }
    const r = computeActivityWindow({ sessions, now })
    expect(r.sessions).toBe(2) // both started within the last 5h
    expect(r.activeMs).toBe(600_000) // only the live session contributes elapsed time
  })
})

describe('computeAgentActivity', () => {
  const now = 10 * 3_600_000 // 10h in ms
  const fiveHAgo = now - 5 * 3_600_000

  it('groups sessions by resolved agent and returns one entry per agent', () => {
    const projects = [
      project('p-claude', 'claude-code'),
      project('p-codex', 'codex'),
      project('p-aider', 'aider'),
    ]
    const sessions = {
      c1: session({
        id: 'c1',
        projectId: 'p-claude',
        startedAt: now - 3_600_000,
        status: 'running',
      }),
      x1: session({
        id: 'x1',
        projectId: 'p-codex',
        startedAt: now - 1_800_000,
        status: 'running',
      }),
      a1: session({
        id: 'a1',
        projectId: 'p-aider',
        startedAt: fiveHAgo + 600_000,
        status: 'exited',
      }),
    }
    const result = computeAgentActivity(sessions, projects, now)
    const agents = result.map((r) => r.agent)
    expect(agents).toContain('claude-code')
    expect(agents).toContain('codex')
    expect(agents).toContain('aider')
    expect(result).toHaveLength(3)

    const claudeEntry = result.find((r) => r.agent === 'claude-code')!
    expect(claudeEntry.sessions).toBe(1)
    expect(claudeEntry.activeMs).toBe(3_600_000)

    const codexEntry = result.find((r) => r.agent === 'codex')!
    expect(codexEntry.sessions).toBe(1)
    expect(codexEntry.activeMs).toBe(1_800_000)

    const aiderEntry = result.find((r) => r.agent === 'aider')!
    expect(aiderEntry.sessions).toBe(1)
    expect(aiderEntry.activeMs).toBe(0) // exited, no elapsed time
  })

  it('excludes agents whose sessions all started outside the 5h window', () => {
    const projects = [project('p1', 'goose'), project('p2', 'gemini-cli')]
    const sessions = {
      old: session({ id: 'old', projectId: 'p1', startedAt: fiveHAgo - 3_600_000 }), // 6h ago → out
      recent: session({ id: 'recent', projectId: 'p2', startedAt: now - 600_000 }), // 10m ago → in
    }
    const result = computeAgentActivity(sessions, projects, now)
    expect(result).toHaveLength(1)
    expect(result[0]!.agent).toBe('gemini-cli')
  })

  it('sorts by activeMs desc, then sessions desc, then agent id asc', () => {
    const projects = [
      project('p1', 'aider'),
      project('p2', 'claude-code'),
      project('p3', 'opencode'),
    ]
    // aider: 1 session, 1h active
    // claude-code: 2 sessions, 2h active (most active)
    // opencode: 1 session, 1h active (same as aider → tiebreak on sessions, then id)
    const sessions = {
      a1: session({ id: 'a1', projectId: 'p1', startedAt: now - 3_600_000, status: 'running' }),
      c1: session({ id: 'c1', projectId: 'p2', startedAt: now - 7_200_000, status: 'running' }),
      c2: session({ id: 'c2', projectId: 'p2', startedAt: now - 1_000, status: 'exited' }),
      o1: session({ id: 'o1', projectId: 'p3', startedAt: now - 3_600_000, status: 'running' }),
    }
    const result = computeAgentActivity(sessions, projects, now)
    expect(result[0]!.agent).toBe('claude-code') // 2h active → first
    // aider and opencode both have 1h active, 1 session; aider < opencode alphabetically
    expect(result[1]!.agent).toBe('aider')
    expect(result[2]!.agent).toBe('opencode')
  })

  it('returns empty array when no sessions are within the window', () => {
    const projects = [project('p1', 'claude-code')]
    const sessions = {
      old: session({ id: 'old', projectId: 'p1', startedAt: fiveHAgo - 1 }),
    }
    expect(computeAgentActivity(sessions, projects, now)).toEqual([])
  })
})
