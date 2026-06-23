import { describe, it, expect } from 'vitest'
import {
  validateCustomAgent,
  looksLikeCredentialKey,
  AGENT_BINARY_RE,
  CURATED_COLOR_VARS,
  BLOCKED_ENV_KEYS,
} from './custom-agents'

const NO_BUILTINS = new Set<string>()
const BUILTINS = new Set<string>(['codex', 'claude-code'])

function ok(raw: unknown, builtins = NO_BUILTINS) {
  const r = validateCustomAgent(raw, builtins)
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`)
  return r.value
}
function err(raw: unknown, builtins = NO_BUILTINS) {
  const r = validateCustomAgent(raw, builtins)
  if (r.ok) throw new Error('expected error, got ok')
  return r.error
}

describe('validateCustomAgent', () => {
  it('accepts a minimal valid agent', () => {
    const v = ok({ id: 'my-agent', binary: 'my-agent-bin', ui: { name: 'My Agent' } })
    expect(v.id).toBe('my-agent')
    expect(v.binary).toBe('my-agent-bin')
    expect(v.ui.name).toBe('My Agent')
    expect(v.source).toBe('user')
    expect(v.ui.colorVar).toBe('--accent') // defaulted
  })

  it('accepts a full valid agent and preserves args/env/ui', () => {
    const v = ok({
      id: 'ollama-llama3',
      binary: 'ollama',
      args: ['run', 'llama3'],
      env: { OLLAMA_HOST: '127.0.0.1:11434' },
      ui: {
        name: 'Ollama llama3',
        icon: '🦙',
        short: 'OL',
        colorVar: '--green',
        contextWindow: 8192,
      },
    })
    expect(v.args).toEqual(['run', 'llama3'])
    expect(v.env).toEqual({ OLLAMA_HOST: '127.0.0.1:11434' })
    expect(v.ui.colorVar).toBe('--green')
    expect(v.ui.contextWindow).toBe(8192)
  })

  it('rejects a missing/invalid id', () => {
    expect(err({ binary: 'x', ui: { name: 'X' } })).toMatch(/id/i)
    expect(err({ id: 'has space', binary: 'x', ui: { name: 'X' } })).toMatch(/id/i)
    expect(err({ id: 'a'.repeat(129), binary: 'x', ui: { name: 'X' } })).toMatch(/id/i)
  })

  it('rejects shadowing a built-in id', () => {
    expect(err({ id: 'codex', binary: 'x', ui: { name: 'X' } }, BUILTINS)).toMatch(/built-?in/i)
  })

  it('rejects a missing binary or a binary with shell metacharacters', () => {
    expect(err({ id: 'x', ui: { name: 'X' } })).toMatch(/binary/i)
    expect(err({ id: 'x', binary: 'a; rm -rf ~', ui: { name: 'X' } })).toMatch(/binary/i)
    expect(err({ id: 'x', binary: '-flag', ui: { name: 'X' } })).toMatch(/binary/i) // leading dash
    expect(err({ id: 'x', binary: 'a'.repeat(257), ui: { name: 'X' } })).toMatch(/binary/i)
  })

  it('rejects a missing or over-long name', () => {
    expect(err({ id: 'x', binary: 'x', ui: {} })).toMatch(/name/i)
    expect(err({ id: 'x', binary: 'x', ui: { name: 'n'.repeat(65) } })).toMatch(/name/i)
  })

  it('defaults an unknown colorVar to --accent', () => {
    expect(ok({ id: 'x', binary: 'x', ui: { name: 'X', colorVar: '--nope' } }).ui.colorVar).toBe(
      '--accent',
    )
  })

  it('rejects credential-shaped env keys', () => {
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { OPENAI_API_KEY: 'v' } })).toMatch(
      /secret|credential|phase 2/i,
    )
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { MY_TOKEN: 'v' } })).toMatch(
      /secret|credential|phase 2/i,
    )
  })

  it('rejects process-hijack (BLOCKED_ENV) keys', () => {
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { LD_PRELOAD: '/x.so' } })).toMatch(
      /not allowed|blocked/i,
    )
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { NODE_OPTIONS: '--x' } })).toMatch(
      /not allowed|blocked/i,
    )
  })

  it('rejects malformed env keys and over-long values', () => {
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { '1bad': 'v' } })).toMatch(/env/i)
    expect(
      err({ id: 'x', binary: 'x', ui: { name: 'X' }, env: { GOOD: 'v'.repeat(513) } }),
    ).toMatch(/env/i)
  })

  it('rejects over-limit args count', () => {
    expect(err({ id: 'x', binary: 'x', ui: { name: 'X' }, args: Array(33).fill('--a') })).toMatch(
      /args/i,
    )
  })

  it('derives a short label from name when omitted', () => {
    expect(ok({ id: 'x', binary: 'x', ui: { name: 'My Agent' } }).ui.short).toBeTruthy()
  })
})

describe('looksLikeCredentialKey', () => {
  it('flags credential-shaped keys', () => {
    for (const k of [
      'OPENAI_API_KEY',
      'MY_TOKEN',
      'AWS_SECRET',
      'DB_PASSWORD',
      'X_PAT',
      'authToken',
      'apikey',
    ])
      expect(looksLikeCredentialKey(k)).toBe(true)
  })
  it('passes benign keys', () => {
    for (const k of ['OLLAMA_HOST', 'MY_VAR', 'PORT', 'BASE_URL'])
      expect(looksLikeCredentialKey(k)).toBe(false)
  })
})

describe('constants', () => {
  it('AGENT_BINARY_RE accepts command names and rejects metacharacters', () => {
    expect(AGENT_BINARY_RE.test('ollama')).toBe(true)
    expect(AGENT_BINARY_RE.test('my-agent-bin')).toBe(true)
    expect(AGENT_BINARY_RE.test('a; rm')).toBe(false)
    expect(AGENT_BINARY_RE.test('')).toBe(false)
  })
  it('CURATED_COLOR_VARS are real theme-variant tokens', () => {
    expect(CURATED_COLOR_VARS).toContain('--accent')
    expect(CURATED_COLOR_VARS).toContain('--green')
  })
  it('BLOCKED_ENV_KEYS contains the linker + startup-hook hijack vars', () => {
    for (const k of [
      'LD_PRELOAD',
      'LD_AUDIT',
      'BASH_ENV',
      'ENV',
      'NODE_OPTIONS',
      'ELECTRON_RUN_AS_NODE',
    ])
      expect(BLOCKED_ENV_KEYS.has(k)).toBe(true)
  })
})
