import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

vi.mock('../../agent-detector', () => ({
  detectAgents: vi.fn(() => Promise.resolve({ 'claude-code': true, codex: false })),
  setVisibleAgents: vi.fn(),
}))

vi.mock('../../agent-updater', () => ({
  checkAllUpdates: vi.fn(() => Promise.resolve({})),
  updateAgent: vi.fn(() => Promise.resolve({ ok: true })),
}))

const { registerAgentHandlers } = await import('../ipc-agents')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

interface MiniStore {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  _prefs: { visibleAgents: string[] | null }
}

function makeStore(): MiniStore {
  const s: MiniStore = {
    _prefs: { visibleAgents: null },
    get: vi.fn((key: string) => (key === 'appPrefs' ? s._prefs : undefined)),
    set: vi.fn((key: string, val: { visibleAgents: string[] | null }) => {
      if (key === 'appPrefs') s._prefs = val
    }),
  }
  return s
}

describe('ipc-agents', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
    )
  })

  it('registers the expected channels', () => {
    expect(handlers.has('agents:check')).toBe(true)
    expect(handlers.has('agents:setVisible')).toBe(true)
  })

  it('agents:setVisible filters unknown agent ids before persisting', () => {
    call('agents:setVisible', ['claude-code', 'definitely-not-an-agent', 'codex'])
    expect(store._prefs.visibleAgents).toEqual(['claude-code', 'codex'])
  })

  it('agents:setVisible returns the current preference when given a non-array', () => {
    store._prefs.visibleAgents = ['claude-code']
    expect(call('agents:setVisible', 'not-an-array')).toEqual(['claude-code'])
  })
})
