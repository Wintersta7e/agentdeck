import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, (...a: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
}))

const { registerUsageHandlers } = await import('./ipc-usage')
const { CH } = await import('../../shared/ipc-channels')

const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!(null, ...args)

const validRec = {
  sessionId: 'session-abc',
  agent: 'claude-code',
  projectId: 'p1',
  startedAt: 1000,
  endedAt: 2000,
  filesChanged: 2,
}

describe('ipc-usage', () => {
  beforeEach(() => handlers.clear())

  it('records a valid session once and dedups repeats', () => {
    const recordSession = vi.fn()
    registerUsageHandlers({ recordSession, getHistory: vi.fn(() => []), flush: vi.fn() })
    call(CH.usageRecordSession, validRec)
    call(CH.usageRecordSession, validRec) // duplicate sessionId
    expect(recordSession).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid record', () => {
    const recordSession = vi.fn()
    registerUsageHandlers({ recordSession, getHistory: vi.fn(() => []), flush: vi.fn() })
    expect(() => call(CH.usageRecordSession, { ...validRec, sessionId: 'bad id!' })).toThrow()
    expect(() => call(CH.usageRecordSession, { ...validRec, startedAt: 'x' })).toThrow()
    expect(recordSession).not.toHaveBeenCalled()
  })

  it('validates the days param on getHistory', () => {
    const getHistory = vi.fn(() => [])
    registerUsageHandlers({ recordSession: vi.fn(), getHistory, flush: vi.fn() })
    call(CH.usageGetHistory, 7)
    expect(getHistory).toHaveBeenCalledWith(7)
    expect(() => call(CH.usageGetHistory, 0)).toThrow()
    expect(() => call(CH.usageGetHistory, 999)).toThrow()
  })
})
