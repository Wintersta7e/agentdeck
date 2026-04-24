import { describe, expect, it } from 'vitest'
import { getEffectiveContextWindow } from './context-window'

const AGENT_DEFAULTS = {
  'claude-code': 200_000,
  codex: 400_000,
  aider: 128_000,
  goose: 128_000,
  'gemini-cli': 1_000_000,
  'amazon-q': 128_000,
  opencode: 128_000,
}

const base = {
  agentId: 'codex' as const,
  activeModel: null as string | null,
  overrides: { agent: {}, model: {} } as {
    agent: Record<string, number>
    model: Record<string, number>
  },
  agentDefaults: AGENT_DEFAULTS,
}

describe('getEffectiveContextWindow — 7-branch precedence', () => {
  it('1. override-model wins over everything', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'claude-code',
      activeModel: 'claude-opus-4-7[1m]',
      cliContextOverride: 999_999,
      overrides: {
        agent: { 'claude-code': 111_111 },
        model: { 'claude-opus-4-7[1m]': 777_777 },
      },
    })
    expect(r.value).toBe(777_777)
    expect(r.source).toBe('override-model')
  })

  it('2. cli-context-override wins when no model override', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'codex',
      activeModel: 'gpt-5.4',
      cliContextOverride: 333_000,
    })
    expect(r.value).toBe(333_000)
    expect(r.source).toBe('cli-context-override')
  })

  it('3. registry-exact', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'claude-code',
      activeModel: 'claude-opus-4-7[1m]',
    })
    expect(r.value).toBe(1_000_000)
    expect(r.source).toBe('registry-exact')
  })

  it('4. heuristic wins over registry-pattern', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'codex',
      activeModel: 'gpt-5.x-1m',
    })
    expect(r.value).toBe(1_000_000)
    expect(r.source).toBe('heuristic')
  })

  it('5. registry-pattern', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'codex',
      activeModel: 'gpt-5.9-mystery',
    })
    expect(r.value).toBe(400_000)
    expect(r.source).toBe('registry-pattern')
  })

  it('6. override-agent when activeModel is null', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'aider',
      activeModel: null,
      overrides: { agent: { aider: 555_000 }, model: {} },
    })
    expect(r.value).toBe(555_000)
    expect(r.source).toBe('override-agent')
  })

  it('6. override-agent when activeModel is unknown', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'aider',
      activeModel: 'totally-unknown-model',
      overrides: { agent: { aider: 444_000 }, model: {} },
    })
    expect(r.value).toBe(444_000)
    expect(r.source).toBe('override-agent')
  })

  it('7. default when nothing matches', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'aider',
      activeModel: null,
    })
    expect(r.value).toBe(128_000)
    expect(r.source).toBe('default')
    expect(r.modelId).toBeNull()
  })

  it('7. default with unknown model returns unknownModelHint', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'aider',
      activeModel: 'weirdnet-xyz',
    })
    expect(r.value).toBe(128_000)
    expect(r.source).toBe('default')
    expect(r.modelId).toBe('weirdnet-xyz')
    expect(r.unknownModelHint).toBe('weirdnet-xyz')
  })

  it('modelId is returned as-is (raw, unnormalized)', () => {
    const r = getEffectiveContextWindow({
      ...base,
      agentId: 'opencode',
      activeModel: 'anthropic/claude-opus-4-7',
    })
    expect(r.modelId).toBe('anthropic/claude-opus-4-7')
    expect(r.value).toBe(200_000)
  })
})
