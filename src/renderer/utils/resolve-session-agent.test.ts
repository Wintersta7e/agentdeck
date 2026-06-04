import { describe, it, expect } from 'vitest'
import { resolveSessionAgent } from './resolve-session-agent'
import type { Project, Session } from '../../shared/types'

function makeSession(over: Partial<Session>): Session {
  return {
    id: 's1',
    projectId: 'p1',
    status: 'running',
    startedAt: 0,
    approvalState: 'idle',
    seedTemplateId: null,
    ...over,
  } as Session
}

function makeProject(over: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Project 1',
    path: '/home/user/project',
    ...over,
  } as Project
}

describe('resolveSessionAgent', () => {
  it('returns agentOverride when explicitly set', () => {
    const session = makeSession({ projectId: 'p1', agentOverride: 'codex' })
    const project = makeProject({ id: 'p1', agents: [{ agent: 'claude-code', isDefault: true }] })
    expect(resolveSessionAgent(session, [project])).toBe('codex')
  })

  it('falls back to project default agent when no override', () => {
    const session = makeSession({ projectId: 'p1', agentOverride: undefined })
    const project = makeProject({ id: 'p1', agents: [{ agent: 'aider', isDefault: true }] })
    expect(resolveSessionAgent(session, [project])).toBe('aider')
  })

  it('uses legacy project.agent field when agents array is absent', () => {
    const session = makeSession({ projectId: 'p1', agentOverride: undefined })
    const project = makeProject({ id: 'p1', agent: 'goose' })
    expect(resolveSessionAgent(session, [project])).toBe('goose')
  })

  it('falls back to claude-code when no project matches', () => {
    const session = makeSession({ projectId: 'unknown', agentOverride: undefined })
    expect(resolveSessionAgent(session, [])).toBe('claude-code')
  })

  it('falls back to claude-code when project has no agent configured', () => {
    const session = makeSession({ projectId: 'p1', agentOverride: undefined })
    const project = makeProject({ id: 'p1' }) // no agents or agent field
    expect(resolveSessionAgent(session, [project])).toBe('claude-code')
  })
})
