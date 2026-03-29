import { describe, it, expect } from 'vitest'
import {
  formatTokens,
  formatCost,
  createClaudeAdapter,
  createCodexAdapter,
  ZERO_USAGE,
} from './log-adapters'

// ---------------------------------------------------------------------------
// formatTokens
// ---------------------------------------------------------------------------

describe('formatTokens', () => {
  it('returns raw number under 1000', () => {
    expect(formatTokens(500)).toBe('500')
  })

  it('returns raw "0" for zero', () => {
    expect(formatTokens(0)).toBe('0')
  })

  it('formats 1500 as "1.5k"', () => {
    expect(formatTokens(1500)).toBe('1.5k')
  })

  it('formats 12345 as "12.3k"', () => {
    expect(formatTokens(12345)).toBe('12.3k')
  })

  it('formats exactly 1000 as "1.0k"', () => {
    expect(formatTokens(1000)).toBe('1.0k')
  })
})

// ---------------------------------------------------------------------------
// formatCost
// ---------------------------------------------------------------------------

describe('formatCost', () => {
  it('returns empty string for 0', () => {
    expect(formatCost(0)).toBe('')
  })

  it('formats 0.42 as "$0.42"', () => {
    expect(formatCost(0.42)).toBe('$0.42')
  })

  it('formats 1.5 as "$1.50"', () => {
    expect(formatCost(1.5)).toBe('$1.50')
  })

  it('formats large value with 2 decimals', () => {
    expect(formatCost(12.999)).toBe('$13.00')
  })
})

// ---------------------------------------------------------------------------
// ClaudeAdapter
// ---------------------------------------------------------------------------

describe('ClaudeAdapter', () => {
  const adapter = createClaudeAdapter()

  it('has agent "claude-code"', () => {
    expect(adapter.agent).toBe('claude-code')
  })

  it('getLogDirs returns 2 dirs', () => {
    const dirs = adapter.getLogDirs('/home/rooty/my-project')
    expect(dirs).toHaveLength(2)
  })

  it('getLogDirs first entry contains path slug', () => {
    const dirs = adapter.getLogDirs('/home/rooty/my-project')
    const first = dirs[0]
    if (!first) throw new Error('Expected first dir')
    // slashes replaced by dashes
    expect(first).toContain('-home-rooty-my-project')
  })

  it('getLogDirs second entry is the glob fallback', () => {
    const dirs = adapter.getLogDirs('/home/rooty/my-project')
    const second = dirs[1]
    if (!second) throw new Error('Expected second dir')
    expect(second).toContain('~/.claude/projects/')
    // fallback dir should not contain the path slug
    expect(second).not.toContain('rooty')
  })

  it('getFilePattern returns "*.jsonl"', () => {
    expect(adapter.getFilePattern()).toBe('*.jsonl')
  })

  it('parseUsage extracts usage from Claude JSONL line', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 1500,
          output_tokens: 300,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 50,
        },
      },
      costUSD: 0.02,
      cwd: '/home/rooty/project',
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.inputTokens).toBe(1500)
    expect(result.outputTokens).toBe(300)
    expect(result.cacheReadTokens).toBe(100)
    expect(result.cacheWriteTokens).toBe(50)
    expect(result.totalCostUsd).toBeCloseTo(0.02)
  })

  it('parseUsage accumulates on top of existing accumulator', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 500,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
      costUSD: 0.01,
    })
    const acc = {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
      totalCostUsd: 0.05,
    }
    const result = adapter.parseUsage(line, acc)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.inputTokens).toBe(1500)
    expect(result.outputTokens).toBe(300)
    expect(result.totalCostUsd).toBeCloseTo(0.06)
  })

  it('parseUsage returns null for non-usage lines', () => {
    const line = JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } })
    expect(adapter.parseUsage(line, { ...ZERO_USAGE })).toBeNull()
  })

  it('parseUsage returns null for malformed JSON', () => {
    expect(adapter.parseUsage('not json{{', { ...ZERO_USAGE })).toBeNull()
  })

  it('matchSession returns true when cwd found in lines', () => {
    const lines = [JSON.stringify({ type: 'summary', cwd: '/home/rooty/project', ts: 1000 })]
    expect(adapter.matchSession(lines, '/home/rooty/project', 1000)).toBe(true)
  })

  it('matchSession returns false when cwd not found', () => {
    const lines = [JSON.stringify({ type: 'summary', cwd: '/home/rooty/other', ts: 1000 })]
    expect(adapter.matchSession(lines, '/home/rooty/project', 1000)).toBe(false)
  })

  it('matchSession returns false for empty lines', () => {
    expect(adapter.matchSession([], '/home/rooty/project', 1000)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CodexAdapter
// ---------------------------------------------------------------------------

describe('CodexAdapter', () => {
  const adapter = createCodexAdapter()

  it('has agent "codex"', () => {
    expect(adapter.agent).toBe('codex')
  })

  it('getLogDirs returns today date dir in YYYY/MM/DD format', () => {
    const dirs = adapter.getLogDirs('/home/rooty/any')
    expect(dirs).toHaveLength(1)
    const dir = dirs[0]
    if (!dir) throw new Error('Expected dir')
    expect(dir).toContain('~/.codex/sessions/')
    // Should match YYYY/MM/DD pattern at the end
    expect(dir).toMatch(/\d{4}\/\d{2}\/\d{2}$/)
  })

  it('getFilePattern returns "rollout-*.jsonl"', () => {
    expect(adapter.getFilePattern()).toBe('rollout-*.jsonl')
  })

  it('parseUsage extracts cumulative tokens from token_count event', () => {
    const line = JSON.stringify({
      type: 'event',
      payload: { type: 'token_count', input_tokens: 2000, output_tokens: 500 },
      model: 'gpt-4o',
      cwd: '/home/rooty/project',
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.inputTokens).toBe(2000)
    expect(result.outputTokens).toBe(500)
  })

  it('parseUsage replaces (not adds) accumulator for cumulative tokens', () => {
    const line = JSON.stringify({
      type: 'event',
      payload: { type: 'token_count', input_tokens: 1000, output_tokens: 200 },
      model: 'o3',
    })
    const acc = {
      inputTokens: 9999,
      outputTokens: 9999,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 99,
    }
    const result = adapter.parseUsage(line, acc)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    // REPLACE, not accumulate
    expect(result.inputTokens).toBe(1000)
    expect(result.outputTokens).toBe(200)
  })

  it('parseUsage computes cost from gpt-4o pricing map', () => {
    const line = JSON.stringify({
      type: 'event',
      payload: { type: 'token_count', input_tokens: 1_000_000, output_tokens: 1_000_000 },
      model: 'gpt-4o',
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    // gpt-4o: input $2.50/1M + output $10.00/1M = $12.50
    expect(result.totalCostUsd).toBeCloseTo(12.5)
  })

  it('parseUsage sets totalCostUsd to 0 for unknown model', () => {
    const line = JSON.stringify({
      type: 'event',
      payload: { type: 'token_count', input_tokens: 500, output_tokens: 100 },
      model: 'unknown-model-xyz',
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.totalCostUsd).toBe(0)
  })

  it('parseUsage returns null for non-token_count events', () => {
    const line = JSON.stringify({ type: 'event', payload: { type: 'output', text: 'hello' } })
    expect(adapter.parseUsage(line, { ...ZERO_USAGE })).toBeNull()
  })

  it('parseUsage returns null for malformed JSON', () => {
    expect(adapter.parseUsage('{bad json', { ...ZERO_USAGE })).toBeNull()
  })

  it('matchSession returns true when cwd found in lines', () => {
    const lines = [JSON.stringify({ type: 'event', cwd: '/home/rooty/project', ts: 1000 })]
    expect(adapter.matchSession(lines, '/home/rooty/project', 1000)).toBe(true)
  })

  it('matchSession returns false when cwd not found', () => {
    const lines = [JSON.stringify({ type: 'event', cwd: '/home/rooty/other', ts: 1000 })]
    expect(adapter.matchSession(lines, '/home/rooty/project', 1000)).toBe(false)
  })
})
