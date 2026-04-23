import { describe, it, expect } from 'vitest'
import { AGENTS } from '../../../shared/agents'
import { AGENT_BY_ID, AGENT_IDS, agentColor, agentColorVar, agentShort } from '../agent-ui'

describe('agentColor / agentColorVar', () => {
  it('returns a var() expression for known agents', () => {
    expect(agentColor('claude-code')).toBe('var(--agent-claude)')
    expect(agentColor('codex')).toBe('var(--agent-codex)')
    expect(agentColor('opencode')).toBe('var(--agent-opencode)')
  })

  it('falls back to --accent for unknown or nullish ids', () => {
    expect(agentColor(null)).toBe('var(--accent)')
    expect(agentColor(undefined)).toBe('var(--accent)')
    expect(agentColor('')).toBe('var(--accent)')
    expect(agentColor('not-an-agent')).toBe('var(--accent)')
  })

  it('agentColorVar returns the raw var name for inline styles', () => {
    expect(agentColorVar('claude-code')).toBe('--agent-claude')
    expect(agentColorVar('aider')).toBe('--agent-aider')
    expect(agentColorVar(null)).toBe('--accent')
    expect(agentColorVar('made-up')).toBe('--accent')
  })
})

describe('agentShort', () => {
  it('returns canonical two-letter mnemonics for known agents', () => {
    expect(agentShort('claude-code')).toBe('CC')
    expect(agentShort('codex')).toBe('CX')
    expect(agentShort('gemini-cli')).toBe('GM')
    expect(agentShort('amazon-q')).toBe('AQ')
  })

  it('falls back to a single glyph for nullish ids', () => {
    expect(agentShort(null)).toBe('·')
    expect(agentShort(undefined)).toBe('·')
    expect(agentShort('')).toBe('·')
  })

  it('falls back to uppercase-2-char slice for unknown ids', () => {
    expect(agentShort('llama')).toBe('LL')
    expect(agentShort('xyz-tool')).toBe('XY')
  })
})

describe('AGENT_BY_ID / AGENT_IDS', () => {
  it('AGENT_BY_ID resolves every canonical id from AGENTS', () => {
    for (const a of AGENTS) {
      expect(AGENT_BY_ID.get(a.id)).toBe(a)
    }
  })

  it('AGENT_IDS length matches AGENTS length and preserves order', () => {
    expect(AGENT_IDS).toHaveLength(AGENTS.length)
    AGENT_IDS.forEach((id, i) => expect(id).toBe(AGENTS[i]?.id))
  })
})
