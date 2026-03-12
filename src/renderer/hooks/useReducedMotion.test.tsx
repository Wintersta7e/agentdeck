import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReducedMotion } from './useReducedMotion'

describe('useReducedMotion', () => {
  let listeners: Map<string, EventListener>
  let matches: boolean
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    listeners = new Map()
    matches = false
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches,
        media: query,
        addEventListener: (_e: string, cb: EventListener) => {
          listeners.set(_e, cb)
        },
        removeEventListener: (_e: string) => {
          listeners.delete(_e)
        },
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    })
    vi.restoreAllMocks()
  })

  it('returns false when motion is not reduced', () => {
    matches = false
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('returns true when motion is reduced', () => {
    matches = true
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('updates when preference changes', () => {
    matches = false
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    const cb = listeners.get('change')
    if (cb) {
      act(() => {
        ;(cb as (e: unknown) => void)({ matches: true })
      })
    }
    expect(result.current).toBe(true)
  })
})
