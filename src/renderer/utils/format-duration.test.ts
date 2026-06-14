import { describe, it, expect } from 'vitest'
import { formatDuration, formatDurationHm, formatDurationShort } from './format-duration'

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(5 * 60_000)).toBe('5m')
  })

  it('shows hours and minutes at or over an hour', () => {
    expect(formatDuration(60 * 60_000)).toBe('1h 0m')
    expect(formatDuration(95 * 60_000)).toBe('1h 35m')
  })
})

describe('formatDurationHm', () => {
  it('always shows hours and zero-pads minutes', () => {
    expect(formatDurationHm(0)).toBe('0h 00m')
    expect(formatDurationHm(5 * 60_000)).toBe('0h 05m')
    expect(formatDurationHm((2 * 60 + 7) * 60_000)).toBe('2h 07m')
  })
})

describe('formatDurationShort', () => {
  it('renders a dash for null', () => {
    expect(formatDurationShort(null)).toBe('—')
  })

  it('renders sub-second, seconds, and minutes+seconds', () => {
    expect(formatDurationShort(500)).toBe('< 1s')
    expect(formatDurationShort(5_000)).toBe('5s')
    expect(formatDurationShort(95_000)).toBe('1m 35s')
  })
})
