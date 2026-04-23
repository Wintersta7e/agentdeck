import { describe, expect, it } from 'vitest'
import { isValidContextOverride, MIN_CONTEXT_OVERRIDE, MAX_CONTEXT_OVERRIDE } from './validation'

describe('isValidContextOverride', () => {
  it('accepts positive integers in range', () => {
    expect(isValidContextOverride(200_000)).toBe(true)
    expect(isValidContextOverride(MIN_CONTEXT_OVERRIDE)).toBe(true)
    expect(isValidContextOverride(MAX_CONTEXT_OVERRIDE)).toBe(true)
  })
  it('rejects out-of-range', () => {
    expect(isValidContextOverride(999)).toBe(false)
    expect(isValidContextOverride(10_000_001)).toBe(false)
  })
  it('rejects non-integer', () => {
    expect(isValidContextOverride(200_000.5)).toBe(false)
    expect(isValidContextOverride(Number.NaN)).toBe(false)
    expect(isValidContextOverride(Infinity)).toBe(false)
  })
  it('rejects non-number', () => {
    expect(isValidContextOverride('200000')).toBe(false)
    expect(isValidContextOverride(null)).toBe(false)
    expect(isValidContextOverride(undefined)).toBe(false)
  })
})
