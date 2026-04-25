import { describe, it, expect } from 'vitest'
import { validScrollback } from './terminal-utils'

describe('validScrollback', () => {
  it('returns 5000 for undefined', () => {
    expect(validScrollback(undefined)).toBe(5000)
  })

  it('returns 5000 for NaN', () => {
    expect(validScrollback(NaN)).toBe(5000)
  })

  it('returns 5000 for Infinity', () => {
    expect(validScrollback(Infinity)).toBe(5000)
  })

  it('returns 5000 for negative values', () => {
    expect(validScrollback(-1)).toBe(5000)
    expect(validScrollback(-100)).toBe(5000)
  })

  it('returns 5000 for values below 1000', () => {
    expect(validScrollback(0)).toBe(5000)
    expect(validScrollback(500)).toBe(5000)
    expect(validScrollback(999)).toBe(5000)
  })

  it('returns the value for exactly 1000', () => {
    expect(validScrollback(1000)).toBe(1000)
  })

  it('returns the value for values above 1000', () => {
    expect(validScrollback(1001)).toBe(1001)
    expect(validScrollback(10000)).toBe(10000)
    expect(validScrollback(50000)).toBe(50000)
  })
})
