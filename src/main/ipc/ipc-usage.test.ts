import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, (...a: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
}))

const { registerUsageHandlers } = await import('./ipc-usage')
const { CH } = await import('../../shared/ipc-channels')

const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!(null, ...args)

describe('ipc-usage', () => {
  beforeEach(() => handlers.clear())

  it('validates the days param on getHistory', () => {
    const getHistory = vi.fn(() => [])
    registerUsageHandlers({ recordSession: vi.fn(), getHistory, flush: vi.fn() })
    call(CH.usageGetHistory, 7)
    expect(getHistory).toHaveBeenCalledWith(7)
    expect(() => call(CH.usageGetHistory, 0)).toThrow()
    expect(() => call(CH.usageGetHistory, 999)).toThrow()
  })
})
