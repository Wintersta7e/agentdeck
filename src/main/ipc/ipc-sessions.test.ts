import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, (...a: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
}))

const { registerSessionHistoryHandlers } = await import('./ipc-sessions')
const { CH } = await import('../../shared/ipc-channels')

const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!(null, ...args)

describe('ipc-sessions', () => {
  beforeEach(() => handlers.clear())

  it('passes a valid days value through to getHistory', () => {
    const getHistory = vi.fn(() => [])
    registerSessionHistoryHandlers({
      startSession: vi.fn(),
      noteWrite: vi.fn(),
      endSession: vi.fn(),
      getHistory,
      flush: vi.fn(),
    })
    call(CH.sessionsGetHistory, 7)
    expect(getHistory).toHaveBeenCalledWith(7)
  })

  it('rejects days = 0', () => {
    const getHistory = vi.fn(() => [])
    registerSessionHistoryHandlers({
      startSession: vi.fn(),
      noteWrite: vi.fn(),
      endSession: vi.fn(),
      getHistory,
      flush: vi.fn(),
    })
    expect(() => call(CH.sessionsGetHistory, 0)).toThrow('Invalid days parameter')
    expect(getHistory).not.toHaveBeenCalled()
  })

  it('rejects days = 999', () => {
    const getHistory = vi.fn(() => [])
    registerSessionHistoryHandlers({
      startSession: vi.fn(),
      noteWrite: vi.fn(),
      endSession: vi.fn(),
      getHistory,
      flush: vi.fn(),
    })
    expect(() => call(CH.sessionsGetHistory, 999)).toThrow('Invalid days parameter')
    expect(getHistory).not.toHaveBeenCalled()
  })

  it('rejects non-number days', () => {
    const getHistory = vi.fn(() => [])
    registerSessionHistoryHandlers({
      startSession: vi.fn(),
      noteWrite: vi.fn(),
      endSession: vi.fn(),
      getHistory,
      flush: vi.fn(),
    })
    expect(() => call(CH.sessionsGetHistory, 'seven')).toThrow('Invalid days parameter')
    expect(getHistory).not.toHaveBeenCalled()
  })
})
