import { describe, it, expect, beforeEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { PtyManager } from '../pty-manager'
import { AgentRegistry } from '../agent-registry'
import { makeHandlersMap, makeIpcCall, makeIpcElectronMock } from '../../__test__/ipc-harness'

const handlers = makeHandlersMap()
vi.mock('electron', () => makeIpcElectronMock(handlers))

vi.mock('../git-status', () => ({
  invalidateGitCache: vi.fn(),
}))

vi.mock('../pty-bus', () => ({
  ptyBus: { once: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const { registerPtyHandlers } = await import('./ipc-pty')

const call = makeIpcCall(handlers)

const stubSessionHistory = (): Parameters<typeof registerPtyHandlers>[1]['sessionHistory'] => ({
  startSession: vi.fn(),
  noteActivity: vi.fn(),
  endSession: vi.fn(() => null),
  getHistory: vi.fn(() => []),
  flush: vi.fn(),
})

const stubUsageHistory = (): Parameters<typeof registerPtyHandlers>[1]['usageHistory'] => ({
  recordSession: vi.fn(),
  getHistory: vi.fn(() => []),
  flush: vi.fn(),
})

type MockMgr = {
  spawn: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  hasSession: ReturnType<typeof vi.fn>
}

function makeMockMgr(overrides: Partial<MockMgr> = {}): MockMgr {
  return {
    spawn: vi.fn(() => ({ ok: true })),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    hasSession: vi.fn(() => true),
    ...overrides,
  }
}

// Builtins-only registry (no agents.toml on disk) — these IO/kill/resize tests
// never exercise the spawn agent-gate, but the dep is required.
const stubRegistry = (): AgentRegistry => {
  const reg = new AgentRegistry(join(tmpdir(), 'agdeck-pty-io-nonexistent.toml'))
  reg.load()
  return reg
}

function register(mgr: MockMgr): void {
  registerPtyHandlers(() => mgr as unknown as PtyManager, {
    getMainWindow: () => null,
    getProjectId: () => null,
    reviewTracker: {
      addReview: vi.fn(),
      getReviews: vi.fn(() => []),
      dismissReview: vi.fn(),
    } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
    sessionHistory: stubSessionHistory(),
    usageHistory: stubUsageHistory(),
    agentRegistry: stubRegistry(),
  })
}

describe('pty:write IPC handler', () => {
  let mgr: MockMgr

  beforeEach(() => {
    handlers.clear()
    mgr = makeMockMgr()
    register(mgr)
  })

  it('rejects an unsafe sessionId and does NOT call mgr.write', () => {
    const result = call('pty:write', './bad', 'data') as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/sessionId/)
    expect(mgr.write).not.toHaveBeenCalled()
  })

  it('rejects non-string data and does NOT call mgr.write', () => {
    const result = call('pty:write', 'sess-1', 123 as unknown as string) as {
      ok: boolean
      error?: string
    }
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/data/)
    expect(mgr.write).not.toHaveBeenCalled()
  })

  it('returns ok:false and does NOT call mgr.write when the session is unknown', () => {
    mgr.hasSession.mockReturnValue(false)
    const result = call('pty:write', 'sess-1', 'data') as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(mgr.write).not.toHaveBeenCalled()
  })

  it('writes valid data to the manager and returns ok:true', () => {
    const result = call('pty:write', 'sess-1', 'hello') as { ok: boolean }
    expect(result).toEqual({ ok: true })
    expect(mgr.write).toHaveBeenCalledTimes(1)
    expect(mgr.write).toHaveBeenCalledWith('sess-1', 'hello')
  })

  it('chunks an oversized payload into <=1 MiB writes', () => {
    // MAX_CHUNK is 1 MiB; a 2.5 MiB payload must arrive as 3 sequential writes.
    const big = 'x'.repeat(1_048_576 * 2 + 100)
    const result = call('pty:write', 'sess-1', big) as { ok: boolean }
    expect(result).toEqual({ ok: true })
    expect(mgr.write).toHaveBeenCalledTimes(3)
    // Reassembled chunks equal the original payload (no bytes dropped).
    const reassembled = mgr.write.mock.calls.map((c) => c[1] as string).join('')
    expect(reassembled).toBe(big)
  })
})

describe('pty:kill IPC handler', () => {
  let mgr: MockMgr

  beforeEach(() => {
    handlers.clear()
    mgr = makeMockMgr()
    register(mgr)
  })

  it('throws on an unsafe sessionId and does NOT call mgr.kill', () => {
    expect(() => call('pty:kill', '../escape')).toThrow(/sessionId/)
    expect(mgr.kill).not.toHaveBeenCalled()
  })

  it('throws on a non-string sessionId and does NOT call mgr.kill', () => {
    expect(() => call('pty:kill', 42 as unknown as string)).toThrow(/sessionId/)
    expect(mgr.kill).not.toHaveBeenCalled()
  })

  it('kills a valid session', () => {
    call('pty:kill', 'sess-1')
    expect(mgr.kill).toHaveBeenCalledTimes(1)
    expect(mgr.kill).toHaveBeenCalledWith('sess-1')
  })
})

describe('pty:resize IPC handler', () => {
  let mgr: MockMgr

  beforeEach(() => {
    handlers.clear()
    mgr = makeMockMgr()
    register(mgr)
  })

  it('silently drops an unsafe sessionId (no throw, no mgr.resize)', () => {
    expect(() => call('pty:resize', './bad', 80, 24)).not.toThrow()
    expect(mgr.resize).not.toHaveBeenCalled()
  })

  it('silently drops a non-string sessionId', () => {
    expect(() => call('pty:resize', {} as unknown as string, 80, 24)).not.toThrow()
    expect(mgr.resize).not.toHaveBeenCalled()
  })

  it('drops non-positive cols (no mgr.resize)', () => {
    call('pty:resize', 'sess-1', 0, 24)
    expect(mgr.resize).not.toHaveBeenCalled()
  })

  it('drops non-positive rows (no mgr.resize)', () => {
    call('pty:resize', 'sess-1', 80, 0)
    expect(mgr.resize).not.toHaveBeenCalled()
  })

  it('forwards valid sessionId and positive dims to mgr.resize', () => {
    call('pty:resize', 'sess-1', 120, 40)
    expect(mgr.resize).toHaveBeenCalledTimes(1)
    expect(mgr.resize).toHaveBeenCalledWith('sess-1', 120, 40)
  })
})
