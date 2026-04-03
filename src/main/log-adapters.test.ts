import { describe, it, expect, beforeEach } from 'vitest'
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

  it('getLogDirs returns project-specific dir only', () => {
    const dirs = adapter.getLogDirs('/home/rooty/my-project')
    expect(dirs).toHaveLength(1)
  })

  it('getLogDirs entry contains path slug', () => {
    const dirs = adapter.getLogDirs('/home/rooty/my-project')
    const first = dirs[0]
    if (!first) throw new Error('Expected first dir')
    // slashes replaced by dashes
    expect(first).toContain('-home-rooty-my-project')
    expect(first).toMatch(/~\/\.claude\/projects\/-home-rooty-my-project\/$/)
  })

  it('getFilePattern returns "*.jsonl"', () => {
    expect(adapter.getFilePattern()).toBe('*.jsonl')
  })

  it('parseUsage extracts usage from final Claude JSONL entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 3,
          output_tokens: 67,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 28750,
        },
      },
      cwd: '/home/rooty/project',
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.inputTokens).toBe(3)
    expect(result.outputTokens).toBe(67)
    expect(result.cacheReadTokens).toBe(0)
    expect(result.cacheWriteTokens).toBe(28750)
  })

  it('parseUsage computes cost from model pricing', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 10000,
          cache_creation_input_tokens: 20000,
        },
      },
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    // opus: $5/1M input, $25/1M output
    // input:       1000 × 5.0  / 1M = 0.005
    // cache read:  10000 × 5.0 × 0.1 / 1M = 0.005
    // cache write: 20000 × 5.0 × 1.25 / 1M = 0.125
    // output:      500 × 25.0 / 1M = 0.0125
    // total = 0.005 + 0.005 + 0.125 + 0.0125 = 0.1475
    expect(result.totalCostUsd).toBeCloseTo(0.1475)
  })

  it('parseUsage skips streaming partials (stop_reason: null)', () => {
    const partial = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-6',
        stop_reason: null,
        usage: {
          input_tokens: 3,
          output_tokens: 30,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 28750,
        },
      },
    })
    expect(adapter.parseUsage(partial, { ...ZERO_USAGE })).toBeNull()
  })

  it('parseUsage accumulates across multiple final entries', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 500,
          output_tokens: 100,
          cache_read_input_tokens: 28750,
          cache_creation_input_tokens: 0,
        },
      },
    })
    const acc = {
      inputTokens: 3,
      outputTokens: 67,
      cacheReadTokens: 0,
      cacheWriteTokens: 28750,
      totalCostUsd: 0.18,
    }
    const result = adapter.parseUsage(line, acc)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.inputTokens).toBe(503)
    expect(result.outputTokens).toBe(167)
    expect(result.cacheReadTokens).toBe(28750)
    expect(result.cacheWriteTokens).toBe(28750)
    expect(result.totalCostUsd).toBeGreaterThan(0.18)
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
  let adapter: ReturnType<typeof createCodexAdapter>

  beforeEach(() => {
    adapter = createCodexAdapter()
  })

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
    // First, feed a turn_context line to set the model
    const contextLine = JSON.stringify({
      type: 'turn_context',
      payload: { turn_id: 't1', model: 'gpt-4o', cwd: '/home/rooty/project' },
    })
    adapter.parseUsage(contextLine, { ...ZERO_USAGE })

    const line = JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 2000,
            output_tokens: 500,
            cached_input_tokens: 100,
            total_tokens: 2500,
          },
        },
      },
    })
    const result = adapter.parseUsage(line, { ...ZERO_USAGE })
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    // inputTokens normalized: 2000 raw - 100 cached = 1900 non-cached
    expect(result.inputTokens).toBe(1900)
    expect(result.outputTokens).toBe(500)
    expect(result.cacheReadTokens).toBe(100)
  })

  it('parseUsage replaces (not adds) accumulator for cumulative tokens', () => {
    const contextLine = JSON.stringify({
      type: 'turn_context',
      payload: { turn_id: 't1', model: 'o3' },
    })
    adapter.parseUsage(contextLine, { ...ZERO_USAGE })

    const line = JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1000,
            output_tokens: 200,
            cached_input_tokens: 0,
            total_tokens: 1200,
          },
        },
      },
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
    expect(result.inputTokens).toBe(1000)
    expect(result.outputTokens).toBe(200)
  })

  it('parseUsage computes cost from gpt-4o pricing using raw input (including cached)', () => {
    // Use the same accumulator for both calls (matches real CostTracker usage)
    const acc = { ...ZERO_USAGE }
    const contextLine = JSON.stringify({
      type: 'turn_context',
      payload: { turn_id: 't1', model: 'gpt-4o' },
    })
    adapter.parseUsage(contextLine, acc)

    const line = JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cached_input_tokens: 200_000,
            total_tokens: 2_000_000,
          },
        },
      },
    })
    const result = adapter.parseUsage(line, acc)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    // Cost uses raw input (1M) not non-cached (800K)
    // gpt-4o: input $2.50/1M + output $10.00/1M = $12.50
    expect(result.totalCostUsd).toBeCloseTo(12.5)
    // Display tokens exclude cached
    expect(result.inputTokens).toBe(800_000)
    expect(result.cacheReadTokens).toBe(200_000)
  })

  it('parseUsage sets totalCostUsd to 0 for unknown model', () => {
    // Use the same accumulator for both calls (matches real CostTracker usage)
    const acc = { ...ZERO_USAGE }
    const contextLine = JSON.stringify({
      type: 'turn_context',
      payload: { turn_id: 't1', model: 'unknown-model-xyz' },
    })
    adapter.parseUsage(contextLine, acc)

    const line = JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 500,
            output_tokens: 100,
            cached_input_tokens: 0,
            total_tokens: 600,
          },
        },
      },
    })
    const result = adapter.parseUsage(line, acc)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected result')
    expect(result.totalCostUsd).toBe(0)
  })

  it('parseUsage returns null for token_count with info: null', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: {} },
    })
    expect(adapter.parseUsage(line, { ...ZERO_USAGE })).toBeNull()
  })

  it('parseUsage returns null for non-token_count events', () => {
    const line = JSON.stringify({ type: 'event_msg', payload: { type: 'output', text: 'hello' } })
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
