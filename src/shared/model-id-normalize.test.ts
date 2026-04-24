import { describe, expect, it } from 'vitest'
import { normalizeModelId } from './model-id-normalize'

describe('normalizeModelId', () => {
  it('strips provider prefix', () => {
    expect(normalizeModelId('anthropic/claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
  })
  it('preserves bracket tags', () => {
    expect(normalizeModelId('anthropic/claude-opus-4-7[1m]')).toBe('claude-opus-4-7[1m]')
  })
  it('lowercases', () => {
    expect(normalizeModelId('Anthropic/Claude-Opus-4-7')).toBe('claude-opus-4-7')
  })
  it('trims whitespace', () => {
    expect(normalizeModelId('  openai/gpt-5.4  ')).toBe('gpt-5.4')
  })
  it('returns input unchanged when no prefix', () => {
    expect(normalizeModelId('gpt-5.4')).toBe('gpt-5.4')
  })
  it('takes last segment when multiple slashes (defensive)', () => {
    expect(normalizeModelId('org/team/model-x')).toBe('model-x')
  })
  it('is idempotent', () => {
    const once = normalizeModelId('anthropic/claude-opus-4-7')
    expect(normalizeModelId(once)).toBe(once)
  })
})
