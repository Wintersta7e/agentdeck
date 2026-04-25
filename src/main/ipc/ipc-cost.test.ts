import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CostTracker } from '../cost-tracker'
import type { CostHistory } from '../cost-history'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

const { registerCostHandlers } = await import('./ipc-cost')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

describe('ipc-cost', () => {
  let tracker: { bindSession: ReturnType<typeof vi.fn>; unbindSession: ReturnType<typeof vi.fn> }
  let history: {
    recordCost: ReturnType<typeof vi.fn>
    getHistory: ReturnType<typeof vi.fn>
    getBudget: ReturnType<typeof vi.fn>
    setBudget: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    handlers.clear()
    tracker = { bindSession: vi.fn(), unbindSession: vi.fn() }
    history = {
      recordCost: vi.fn(),
      getHistory: vi.fn(() => [{ date: '2026-04-14', totalCostUsd: 1 } as never]),
      getBudget: vi.fn(() => 5),
      setBudget: vi.fn(),
      flush: vi.fn(),
    }
    registerCostHandlers(() => tracker as unknown as CostTracker, history as unknown as CostHistory)
  })

  describe('cost:bind', () => {
    const validOpts = {
      agent: 'claude-code',
      projectPath: '/home/x',
      cwd: '/home/x',
      spawnAt: 1_000_000,
    }

    it('rejects an unsafe sessionId', () => {
      expect(() => call('cost:bind', './evil', validOpts)).toThrow(/sessionId/)
    })

    it('rejects unknown agent ids', () => {
      expect(() => call('cost:bind', 'sess-1', { ...validOpts, agent: 'gpt-hacker' })).toThrow(
        /known agent/,
      )
    })

    it('rejects non-finite spawnAt', () => {
      expect(() => call('cost:bind', 'sess-1', { ...validOpts, spawnAt: Number.NaN })).toThrow(
        /spawnAt/,
      )
    })

    it('delegates to the tracker on valid input', () => {
      call('cost:bind', 'sess-1', validOpts)
      expect(tracker.bindSession).toHaveBeenCalledWith('sess-1', validOpts)
    })
  })

  describe('cost:unbind', () => {
    it('rejects an unsafe sessionId', () => {
      expect(() => call('cost:unbind', '..')).toThrow(/sessionId/)
    })

    it('delegates to the tracker on valid input', () => {
      call('cost:unbind', 'sess-1')
      expect(tracker.unbindSession).toHaveBeenCalledWith('sess-1')
    })
  })

  describe('cost:getHistory', () => {
    it('rejects days outside [1, 365]', () => {
      expect(() => call('cost:getHistory', 0)).toThrow(/days/)
      expect(() => call('cost:getHistory', 500)).toThrow(/days/)
    })

    it('returns history.getHistory for valid days', () => {
      const out = call('cost:getHistory', 7)
      expect(history.getHistory).toHaveBeenCalledWith(7)
      expect(out).toEqual([{ date: '2026-04-14', totalCostUsd: 1 }])
    })
  })

  describe('cost:setBudget', () => {
    it('rejects negative amounts', () => {
      expect(() => call('cost:setBudget', -1)).toThrow(/budget/)
    })

    it('accepts null (clear budget)', () => {
      call('cost:setBudget', null)
      expect(history.setBudget).toHaveBeenCalledWith(null)
    })

    it('accepts non-negative numbers', () => {
      call('cost:setBudget', 15)
      expect(history.setBudget).toHaveBeenCalledWith(15)
    })
  })
})
