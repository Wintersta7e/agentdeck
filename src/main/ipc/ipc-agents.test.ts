import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CH } from '../../shared/ipc-channels'
import { makeHandlersMap, makeIpcCall, makeIpcElectronMock } from '../../__test__/ipc-harness'
import { AgentRegistry } from '../agent-registry'

const handlers = makeHandlersMap()
vi.mock('electron', () => makeIpcElectronMock(handlers))

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

vi.mock('../agent-detector', () => ({
  detectAgents: vi.fn(() => Promise.resolve({ 'claude-code': true, codex: false })),
  setVisibleAgents: vi.fn(),
}))

vi.mock('../agent-updater', () => ({
  checkAllUpdates: vi.fn(() => Promise.resolve({})),
  updateAgent: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('../active-model-cache', () => ({
  resolveActiveModel: vi.fn(() => Promise.resolve({ modelId: null })),
  invalidateAll: vi.fn(),
}))

const { registerAgentHandlers } = await import('./ipc-agents')

const call = makeIpcCall(handlers)

// A real (temp-backed) registry so the new agents:getRegistry/saveCustom/
// deleteCustom handlers exercise actual persistence, mirroring agent-registry.test.ts.
let regDir: string
let registry: AgentRegistry

beforeEach(() => {
  regDir = mkdtempSync(join(tmpdir(), 'agdeck-ipc-reg-'))
  registry = new AgentRegistry(join(regDir, 'agents.toml'))
  registry.load()
})
afterEach(() => rmSync(regDir, { recursive: true, force: true }))

const VALID_SPEC = {
  id: 'my-agent',
  binary: 'my-agent-bin',
  args: ['--x'],
  ui: { name: 'My Agent' },
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
      registry,
    )
  })

  it('registers every CH.agents* channel via the shared constants', () => {
    // Pin the contract through the constants file: renaming a CH key without
    // updating the handler dispatcher fails this check, not just the
    // individual handler call below.
    const expected = [
      CH.agentsCheck,
      CH.agentsSetVisible,
      CH.agentsGetEffectiveContext,
      CH.agentsGetEffectiveContextForLaunch,
      CH.agentsGetEffectiveContextForModel,
      CH.agentsSetContextOverride,
      CH.agentsGetOverrides,
      CH.agentsGetRegistry,
      CH.agentsSaveCustom,
      CH.agentsDeleteCustom,
    ]
    for (const ch of expected) {
      expect(handlers.has(ch)).toBe(true)
    }
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
      registry,
    )
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

describe('agents:getEffectiveContextForLaunch', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
      registry,
    )
  })

  it('validates agentId', async () => {
    const fn = handlers.get('agents:getEffectiveContextForLaunch')!
    const r = await fn({}, 'not-a-real-agent')
    expect(r).toEqual({ error: 'invalid agentId' })
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
      registry,
    )
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
      registry,
    )
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
      registry,
    )
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

describe('agents registry IPC', () => {
  let store: MiniStore

  beforeEach(() => {
    handlers.clear()
    store = makeStore()
    registerAgentHandlers(
      () => null,
      store as unknown as Parameters<typeof registerAgentHandlers>[1],
      registry,
    )
  })

  it('agents:getRegistry returns the builtins', async () => {
    const r = (await call('agents:getRegistry')) as Array<{ id: string; source: string }>
    expect(r.some((a) => a.id === 'codex' && a.source === 'builtin')).toBe(true)
    expect(r.some((a) => a.source === 'user')).toBe(false)
  })

  it('agents:getRegistry includes a saved custom agent', async () => {
    await call('agents:saveCustom', VALID_SPEC)
    const r = (await call('agents:getRegistry')) as Array<{ id: string; source: string }>
    expect(r.some((a) => a.id === 'my-agent' && a.source === 'user')).toBe(true)
  })

  it('agents:saveCustom with a valid spec returns ok and the registry then contains it', async () => {
    const res = await call('agents:saveCustom', VALID_SPEC)
    expect(res).toMatchObject({ ok: true })
    expect(registry.has('my-agent')).toBe(true)
    expect(registry.binaryFor('my-agent')).toBe('my-agent-bin')
  })

  it('agents:saveCustom with an invalid spec returns an error without throwing', async () => {
    const res = (await call('agents:saveCustom', {
      id: 'x',
      binary: 'bad bin',
      ui: { name: 'X' },
    })) as { ok: boolean; error?: string }
    expect(res.ok).toBe(false)
    expect(typeof res.error).toBe('string')
    expect(registry.has('x')).toBe(false)
  })

  it('agents:deleteCustom removes a previously-saved custom agent', async () => {
    await call('agents:saveCustom', VALID_SPEC)
    expect(registry.has('my-agent')).toBe(true)
    const ok = await call('agents:deleteCustom', 'my-agent')
    expect(ok).toBe(true)
    expect(registry.has('my-agent')).toBe(false)
  })

  it('agents:deleteCustom returns false for an unknown / non-string id', async () => {
    expect(await call('agents:deleteCustom', 'nope')).toBe(false)
    expect(await call('agents:deleteCustom', 42)).toBe(false)
  })
})
