import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffectiveContext } from '../useEffectiveContext'

beforeEach(() => {
  ;(globalThis as unknown as { window: Window }).window.agentDeck = {
    agents: {
      getEffectiveContext: vi.fn().mockResolvedValue({
        value: 1_000_000,
        source: 'registry-exact',
        modelId: 'claude-opus-4-7[1m]',
      }),
      getOverrides: vi.fn().mockResolvedValue({ agent: {}, model: {} }),
    },
  } as never
})

describe('useEffectiveContext', () => {
  it('starts loading then returns value', async () => {
    const { result } = renderHook(() => useEffectiveContext('claude-code'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBe(1_000_000)
    expect(result.current.source).toBe('registry-exact')
  })
})
