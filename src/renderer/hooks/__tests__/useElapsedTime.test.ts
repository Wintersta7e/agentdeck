import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useElapsedTime } from '../useElapsedTime'

describe('useElapsedTime', () => {
  it('returns 0s for undefined', () => {
    const { result } = renderHook(() => useElapsedTime(undefined))
    expect(result.current).toBe('0s')
  })

  it('returns seconds for recent start', () => {
    const { result } = renderHook(() => useElapsedTime(Date.now() - 30_000))
    expect(result.current).toBe('30s')
  })

  it('returns minutes and seconds', () => {
    const { result } = renderHook(() => useElapsedTime(Date.now() - 90_000))
    expect(result.current).toBe('1m 30s')
  })

  it('returns hours and minutes', () => {
    const { result } = renderHook(() => useElapsedTime(Date.now() - 3_720_000))
    expect(result.current).toBe('1h 02m')
  })
})
