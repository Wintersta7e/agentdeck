import { describe, it, expect } from 'vitest'
import { AGENTS, AGENT_BINARY_MAP, KNOWN_AGENT_IDS, SAFE_FLAGS_RE } from './agents'

describe('AGENTS', () => {
  it('has 7 agents', () => {
    expect(AGENTS).toHaveLength(7)
  })

  it('every agent has required fields', () => {
    for (const agent of AGENTS) {
      expect(agent.id).toBeTruthy()
      expect(agent.binary).toBeTruthy()
      expect(agent.icon).toBeTruthy()
      expect(agent.name).toBeTruthy()
      expect(agent.description).toBeTruthy()
    }
  })

  it('has no duplicate IDs', () => {
    const ids = AGENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('AGENT_BINARY_MAP', () => {
  it('maps claude-code to claude', () => {
    expect(AGENT_BINARY_MAP['claude-code']).toBe('claude')
  })

  it('maps gemini-cli to gemini', () => {
    expect(AGENT_BINARY_MAP['gemini-cli']).toBe('gemini')
  })

  it('maps amazon-q to q', () => {
    expect(AGENT_BINARY_MAP['amazon-q']).toBe('q')
  })

  it('has an entry for every agent', () => {
    for (const agent of AGENTS) {
      expect(AGENT_BINARY_MAP[agent.id]).toBe(agent.binary)
    }
  })
})

describe('KNOWN_AGENT_IDS', () => {
  it('contains all agent IDs', () => {
    for (const agent of AGENTS) {
      expect(KNOWN_AGENT_IDS.has(agent.id)).toBe(true)
    }
  })

  it('does not contain unknown IDs', () => {
    expect(KNOWN_AGENT_IDS.has('nonexistent')).toBe(false)
  })
})

describe('SAFE_FLAGS_RE', () => {
  it('accepts simple flags', () => {
    expect(SAFE_FLAGS_RE.test('--verbose')).toBe(true)
    expect(SAFE_FLAGS_RE.test('-v')).toBe(true)
    expect(SAFE_FLAGS_RE.test('--model=gpt-4')).toBe(true)
  })

  it('accepts flags with spaces', () => {
    expect(SAFE_FLAGS_RE.test('--model gpt-4 --verbose')).toBe(true)
  })

  it('accepts paths and URLs', () => {
    expect(SAFE_FLAGS_RE.test('--config /home/user/.config')).toBe(true)
    expect(SAFE_FLAGS_RE.test('--url http://localhost:3000')).toBe(true)
  })

  it('rejects semicolons', () => {
    expect(SAFE_FLAGS_RE.test('--flag; rm -rf /')).toBe(false)
  })

  it('rejects command substitution', () => {
    expect(SAFE_FLAGS_RE.test('$(whoami)')).toBe(false)
  })

  it('rejects backticks', () => {
    expect(SAFE_FLAGS_RE.test('`whoami`')).toBe(false)
  })

  it('rejects pipe', () => {
    expect(SAFE_FLAGS_RE.test('--flag | cat')).toBe(false)
  })

  it('rejects redirect', () => {
    expect(SAFE_FLAGS_RE.test('--flag > /tmp/out')).toBe(false)
  })

  it('rejects &&', () => {
    expect(SAFE_FLAGS_RE.test('--flag && echo pwned')).toBe(false)
  })

  it('accepts empty string', () => {
    expect(SAFE_FLAGS_RE.test('')).toBe(true)
  })
})
