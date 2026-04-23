import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReducedMotion } from './useReducedMotion'

describe('useReducedMotion', () => {
  it('always returns false (animations are ungated in AgentDeck)', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })
})
