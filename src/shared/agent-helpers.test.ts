import { describe, it, expect } from 'vitest'
import { getDefaultAgent, getProjectAgents, migrateProjectAgents } from './agent-helpers'
import type { Project, AgentConfig } from './types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-1',
    name: 'Test',
    path: '/test',
    ...overrides,
  }
}

describe('getDefaultAgent', () => {
  it('returns the agent marked isDefault from agents array', () => {
    const project = makeProject({
      agents: [
        { agent: 'aider', agentFlags: '--model gpt-4' },
        { agent: 'claude-code', isDefault: true },
      ],
    })
    expect(getDefaultAgent(project)).toEqual({ agent: 'claude-code', isDefault: true })
  })

  it('returns first agent if none marked isDefault', () => {
    const project = makeProject({
      agents: [{ agent: 'aider' }, { agent: 'codex' }],
    })
    expect(getDefaultAgent(project)).toEqual({ agent: 'aider' })
  })

  it('falls back to legacy agent field when agents is undefined', () => {
    const project = makeProject({ agent: 'goose', agentFlags: '--verbose' })
    expect(getDefaultAgent(project)).toEqual({
      agent: 'goose',
      agentFlags: '--verbose',
      isDefault: true,
    })
  })

  it('falls back to legacy agent field when agents is empty', () => {
    const project = makeProject({ agent: 'codex', agents: [] })
    expect(getDefaultAgent(project)).toEqual({
      agent: 'codex',
      isDefault: true,
    })
  })

  it('returns claude-code default when no agent info at all', () => {
    const project = makeProject({})
    expect(getDefaultAgent(project)).toEqual({
      agent: 'claude-code',
      isDefault: true,
    })
  })
})

describe('getProjectAgents', () => {
  it('returns agents array when defined', () => {
    const agents: AgentConfig[] = [{ agent: 'claude-code', isDefault: true }, { agent: 'aider' }]
    const project = makeProject({ agents })
    expect(getProjectAgents(project)).toEqual(agents)
  })

  it('returns single-element array from legacy field', () => {
    const project = makeProject({ agent: 'goose', agentFlags: '--verbose' })
    expect(getProjectAgents(project)).toEqual([
      { agent: 'goose', agentFlags: '--verbose', isDefault: true },
    ])
  })

  it('returns claude-code fallback when no agent info', () => {
    const project = makeProject({})
    expect(getProjectAgents(project)).toEqual([{ agent: 'claude-code', isDefault: true }])
  })
})

describe('migrateProjectAgents', () => {
  it('migrates legacy agent to agents array and cleans up legacy fields', () => {
    const project = makeProject({ agent: 'aider', agentFlags: '--model gpt-4' })
    const result = migrateProjectAgents(project)
    expect(result.agents).toEqual([
      { agent: 'aider', agentFlags: '--model gpt-4', isDefault: true },
    ])
    expect(result.agent).toBeUndefined()
    expect(result.agentFlags).toBeUndefined()
  })

  it('returns project unchanged when agents already set', () => {
    const agents: AgentConfig[] = [{ agent: 'codex', isDefault: true }]
    const project = makeProject({ agents })
    expect(migrateProjectAgents(project)).toBe(project)
  })

  it('returns project unchanged when no agent info at all', () => {
    const project = makeProject({})
    expect(migrateProjectAgents(project)).toBe(project)
  })
})
