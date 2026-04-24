import { describe, expect, it } from 'vitest'
import { findModelById, contextForModel, MODELS } from './models'

describe('MODELS registry', () => {
  it('has non-zero entries', () => {
    expect(MODELS.length).toBeGreaterThan(5)
  })
})

describe('findModelById (exact match)', () => {
  it('claude-opus-4-7 → 200K', () =>
    expect(findModelById('claude-opus-4-7')?.contextWindow).toBe(200_000))
  it('claude-opus-4-7[1m] → 1M', () =>
    expect(findModelById('claude-opus-4-7[1m]')?.contextWindow).toBe(1_000_000))
  it('gpt-5.4 → 1.05M', () => expect(findModelById('gpt-5.4')?.contextWindow).toBe(1_050_000))
  it('gpt-5.3-codex → 400K', () =>
    expect(findModelById('gpt-5.3-codex')?.contextWindow).toBe(400_000))
  it('case-insensitive', () =>
    expect(findModelById('CLAUDE-OPUS-4-7')?.contextWindow).toBe(200_000))
  it('strips provider prefix', () =>
    expect(findModelById('anthropic/claude-opus-4-7')?.contextWindow).toBe(200_000))
})

describe('findModelById (pattern fallback)', () => {
  it('unknown claude-sonnet-4-99 → 200K (family)', () =>
    expect(findModelById('claude-sonnet-4-99')?.contextWindow).toBe(200_000))
  it('unknown claude-opus-4-99[1m] → 1M (family)', () =>
    expect(findModelById('claude-opus-4-99[1m]')?.contextWindow).toBe(1_000_000))
  it('gpt-5.4-mini → 400K (narrow rule before broader gpt-5.4)', () =>
    expect(findModelById('gpt-5.4-mini')?.contextWindow).toBe(400_000))
  it('gpt-5.4-nano → 400K', () =>
    expect(findModelById('gpt-5.4-nano')?.contextWindow).toBe(400_000))
  it('gemini-2.5-pro-latest → 2M', () =>
    expect(findModelById('gemini-2.5-pro-latest')?.contextWindow).toBe(2_000_000))
  it('gemini-2.5-flash-lite → 1M', () =>
    expect(findModelById('gemini-2.5-flash-lite')?.contextWindow).toBe(1_000_000))
  it('deepseek-chat → 64K', () =>
    expect(findModelById('deepseek-chat')?.contextWindow).toBe(64_000))
})

describe('findModelById (unknown)', () => {
  it('returns undefined for wholly unknown ids', () =>
    expect(findModelById('weirdnet-xyz')).toBeUndefined())
})

describe('contextForModel', () => {
  it('returns undefined for null / empty / undefined', () => {
    expect(contextForModel(null)).toBeUndefined()
    expect(contextForModel('')).toBeUndefined()
    expect(contextForModel(undefined)).toBeUndefined()
  })
  it('returns window for known id', () => expect(contextForModel('gpt-5.4')).toBe(1_050_000))
})
