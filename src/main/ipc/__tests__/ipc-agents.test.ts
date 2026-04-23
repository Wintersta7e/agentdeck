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

vi.mock('../../active-model-cache', () => ({
  resolveActiveModel: vi.fn(() => Promise.resolve({ modelId: null })),
  invalidateAll: vi.fn(),
}))

const { registerAgentHandlers } = await import('../ipc-agents')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

interface MiniPrefs {
  visibleAgents: string[] | null
  agentContextOverrides?: Record<string, number>
  modelContextOverrides?: Record<string, number>
}

interface MiniStore {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  _prefs: MiniPrefs
}

function makeStore(): MiniStore {
  const s: MiniStore = {
    _prefs: { visibleAgents: null },
    get: vi.fn((key: string) => (key === 'appPrefs' ? s._prefs : undefined)),
    set: vi.fn((key: string, val: MiniPrefs) => {
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

describe('agents:getEffectiveContext', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
    )
  })

  it('registers the handler', () => {
    expect(handlers.has('agents:getEffectiveContext')).toBe(true)
  })

  it('validates agentId — unknown string returns error', async () => {
    const r = await call('agents:getEffectiveContext', 'not-a-real-agent')
    expect(r).toEqual({ error: 'invalid agentId' })
  })

  it('validates agentId — non-string returns error', async () => {
    const r = await call('agents:getEffectiveContext', 42)
    expect(r).toEqual({ error: 'invalid agentId' })
  })

  it('returns a result object for a known agentId', async () => {
    const r = await call('agents:getEffectiveContext', 'claude-code')
    // resolveActiveModel is mocked to return { modelId: null }, so we get default source
    expect(r).toMatchObject({ value: expect.any(Number), source: expect.any(String) })
  })
})

describe('agents:getEffectiveContextForModel', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
    )
  })

  it('registers the handler', () => {
    expect(handlers.has('agents:getEffectiveContextForModel')).toBe(true)
  })

  it('validates agentId', async () => {
    const r = await call('agents:getEffectiveContextForModel', 'nope', 'some-model')
    expect(r).toEqual({ error: 'invalid agentId' })
  })

  it('validates modelId — empty string', async () => {
    const r = await call('agents:getEffectiveContextForModel', 'claude-code', '')
    expect(r).toEqual({ error: 'invalid modelId' })
  })

  it('validates modelId — non-string', async () => {
    const r = await call('agents:getEffectiveContextForModel', 'claude-code', null)
    expect(r).toEqual({ error: 'invalid modelId' })
  })

  it('returns a result object for valid inputs', async () => {
    const r = await call('agents:getEffectiveContextForModel', 'claude-code', 'some-model-xyz')
    expect(r).toMatchObject({ value: expect.any(Number), source: expect.any(String) })
  })
})

describe('agents:setContextOverride', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
    )
  })

  it('registers the handler', () => {
    expect(handlers.has('agents:setContextOverride')).toBe(true)
  })

  it('persists per-agent override', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: 500_000,
    })
    expect(r).toEqual({ ok: true })
    expect(store._prefs.agentContextOverrides?.['claude-code']).toBe(500_000)
  })

  it('clears per-agent override when value is undefined', async () => {
    await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: 500_000,
    })
    await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: undefined,
    })
    expect(store._prefs.agentContextOverrides?.['claude-code']).toBeUndefined()
  })

  it('rejects out-of-range numeric (too low)', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: 500,
    })
    expect(r).toMatchObject({ ok: false })
  })

  it('rejects out-of-range numeric (too high)', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: 10_000_001,
    })
    expect(r).toMatchObject({ ok: false })
  })

  it('rejects unknown agentId for kind=agent', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'nope',
      value: 500_000,
    })
    expect(r).toMatchObject({ ok: false })
  })

  it('rejects invalid kind', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'session',
      agentId: 'claude-code',
      value: 500_000,
    })
    expect(r).toMatchObject({ ok: false })
  })

  it('rejects non-object payload', async () => {
    const r = await call('agents:setContextOverride', 'bad')
    expect(r).toMatchObject({ ok: false })
  })

  it('persists per-model override', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'model',
      modelId: 'weirdnet-xyz',
      value: 500_000,
    })
    expect(r).toEqual({ ok: true })
    expect(store._prefs.modelContextOverrides?.['weirdnet-xyz']).toBe(500_000)
  })

  it('clears per-model override when value is undefined', async () => {
    await call('agents:setContextOverride', {
      kind: 'model',
      modelId: 'weirdnet-xyz',
      value: 500_000,
    })
    await call('agents:setContextOverride', {
      kind: 'model',
      modelId: 'weirdnet-xyz',
      value: undefined,
    })
    expect(store._prefs.modelContextOverrides?.['weirdnet-xyz']).toBeUndefined()
  })

  it('rejects empty modelId for kind=model', async () => {
    const r = await call('agents:setContextOverride', {
      kind: 'model',
      modelId: '',
      value: 500_000,
    })
    expect(r).toMatchObject({ ok: false })
  })
})

describe('agents:getOverrides', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
    )
  })

  it('registers the handler', () => {
    expect(handlers.has('agents:getOverrides')).toBe(true)
  })

  it('returns empty maps when no overrides set', async () => {
    const r = await call('agents:getOverrides')
    expect(r).toEqual({ agent: {}, model: {} })
  })

  it('returns both maps after overrides are seeded', async () => {
    await call('agents:setContextOverride', {
      kind: 'agent',
      agentId: 'claude-code',
      value: 500_000,
    })
    await call('agents:setContextOverride', {
      kind: 'model',
      modelId: 'weirdnet-xyz',
      value: 100_000,
    })
    const r = await call('agents:getOverrides')
    expect(r).toEqual({
      agent: { 'claude-code': 500_000 },
      model: { 'weirdnet-xyz': 100_000 },
    })
  })
})
