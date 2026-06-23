import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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

// Builtins-only registry (no agents.toml on disk) for the gate checks that only
// care about builtins / unknown ids. The custom-id case uses a temp-backed one.
const stubRegistry = (): AgentRegistry => {
  const reg = new AgentRegistry(join(tmpdir(), 'agdeck-pty-spawn-nonexistent.toml'))
  reg.load()
  return reg
}

describe('pty:spawn IPC validation', () => {
  let mgr: { spawn: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handlers.clear()
    mgr = { spawn: vi.fn(() => ({ ok: true })) }
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
  })

  it('rejects unsafe sessionId', () => {
    expect(() => call('pty:spawn', './bad', 80, 24)).toThrow(/sessionId/)
  })

  it('rejects unknown agent ids', () => {
    expect(() =>
      call('pty:spawn', 'sess-1', 80, 24, '/p', undefined, undefined, 'gpt-hacker'),
    ).toThrow(/agent/)
  })

  it('rejects agentFlags containing shell metacharacters', () => {
    expect(() =>
      call('pty:spawn', 'sess-1', 80, 24, '/p', undefined, undefined, 'claude-code', '; rm -rf /'),
    ).toThrow(/agentFlags/)
  })

  it('rejects agentFlags exceeding length cap', () => {
    expect(() =>
      call(
        'pty:spawn',
        'sess-1',
        80,
        24,
        '/p',
        undefined,
        undefined,
        'claude-code',
        'a'.repeat(600),
      ),
    ).toThrow(/agentFlags/)
  })

  it('accepts safe agentFlags and delegates to pty manager', () => {
    expect(() =>
      call(
        'pty:spawn',
        'sess-1',
        80,
        24,
        '/p',
        undefined,
        undefined,
        'claude-code',
        '--model claude-opus-4 --verbose',
      ),
    ).not.toThrow()
    expect(mgr.spawn).toHaveBeenCalled()
  })

  it('rejects startupCommands array exceeding MAX_STARTUP_COMMANDS', () => {
    const many = Array.from({ length: 60 }, () => 'echo hi')
    expect(() => call('pty:spawn', 'sess-1', 80, 24, '/p', many)).toThrow(/startupCommands/)
  })

  it('rejects startupCommands entry exceeding MAX_STARTUP_CMD_LEN', () => {
    const bad = ['a'.repeat(5000)]
    expect(() => call('pty:spawn', 'sess-1', 80, 24, '/p', bad)).toThrow(/startupCommands entry/)
  })

  it('silently strips BLOCKED_ENV keys from env before spawning', () => {
    call(
      'pty:spawn',
      'sess-1',
      80,
      24,
      '/p',
      undefined,
      { LD_PRELOAD: '/evil.so', NORMAL: 'ok' },
      'claude-code',
    )
    // spawn signature: (sessionId, cols, rows, projectPath, startupCommands, safeEnv, agent, flags)
    const spawnCall = mgr.spawn.mock.calls[0]
    const passedEnv = spawnCall?.[5] as Record<string, string> | undefined
    expect(passedEnv).toBeDefined()
    expect(passedEnv?.['LD_PRELOAD']).toBeUndefined()
    expect(passedEnv?.['NORMAL']).toBe('ok')
  })

  it('strips the wider shared BLOCKED_ENV_KEYS (e.g. BASH_ENV) the old local set missed', () => {
    // BASH_ENV / LD_AUDIT are in the shared denylist but were NOT in the old
    // local 5-key BLOCKED_ENV; they must now be stripped on the renderer path.
    call(
      'pty:spawn',
      'sess-1',
      80,
      24,
      '/p',
      undefined,
      { BASH_ENV: '/evil.sh', LD_AUDIT: '/evil.so', NORMAL: 'ok' },
      'claude-code',
    )
    const passedEnv = mgr.spawn.mock.calls[0]?.[5] as Record<string, string> | undefined
    expect(passedEnv).toBeDefined()
    expect(passedEnv?.['BASH_ENV']).toBeUndefined()
    expect(passedEnv?.['LD_AUDIT']).toBeUndefined()
    expect(passedEnv?.['NORMAL']).toBe('ok')
  })

  it('rejects projectPath over 1024 characters', () => {
    const longPath = '/home/' + 'x'.repeat(1100)
    expect(() => call('pty:spawn', 'sess-1', 80, 24, longPath)).toThrow(/projectPath/)
  })

  it('rejects a non-string projectPath', () => {
    expect(() => call('pty:spawn', 'sess-1', 80, 24, 42 as unknown as string)).toThrow(
      /projectPath/,
    )
    expect(() => call('pty:spawn', 'sess-1', 80, 24, {} as unknown as string)).toThrow(
      /projectPath/,
    )
  })

  it('throws when the pty manager is uninitialized', () => {
    handlers.clear()
    registerPtyHandlers(() => null, {
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
    expect(() => call('pty:spawn', 'sess-1', 80, 24, '/p')).toThrow(/PTY manager not initialized/)
  })
})

describe('pty:spawn exit-code → session recording', () => {
  // These cases exercise the ptyBus.once exit listener registered in registerPtyHandlers.
  // We capture the callback registered via ptyBus.once and invoke it directly.

  async function makeSetup(exitCode: number | null) {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const sessionHistoryStub = stubSessionHistory()
    // lastActivityAt is deliberately DISTINCT from endedAt: usage-history must
    // be fed the last-activity instant (idle-trim source), not the wall-clock
    // end. A regression passing rec.endedAt would inflate active time and still
    // satisfy a bare "recordSession was called" assertion — so we pin a
    // recognizable lastActivityAt and assert it propagates verbatim.
    const lastActivityAt = 1_700_000_000_000
    const rec = {
      sessionId: 'sess-exit',
      projectId: 'proj-1',
      agent: 'claude-code',
      startedAt: Date.now() - 5000,
      lastActivityAt,
      endedAt: (lastActivityAt + 60_000) as number | null,
      status: 'exited' as 'exited' | 'error',
      filesChanged: 2,
    }
    ;(sessionHistoryStub.endSession as ReturnType<typeof vi.fn>).mockReturnValue(rec)

    const usageHistoryStub = stubUsageHistory()

    const mgr = { spawn: vi.fn(() => ({ ok: true })) }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: (path) => (path === '/proj' ? 'proj-1' : null),
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
      sessionHistory: sessionHistoryStub,
      usageHistory: usageHistoryStub,
      agentRegistry: stubRegistry(),
    })

    call('pty:spawn', 'sess-exit', 80, 24, '/proj', undefined, undefined, 'claude-code')

    // Find the once callback registered for this session's exit event
    const exitCall = onceSpy.mock.calls.find((c) => c[0] === 'exit:sess-exit')
    expect(exitCall).toBeDefined()
    const exitCb = exitCall![1] as (code: number | null) => void

    // Invoke the exit callback with the given exitCode
    exitCb(exitCode)

    return { sessionHistoryStub, usageHistoryStub, lastActivityAt }
  }

  it('records session when exitCode is 0 (clean exit)', async () => {
    const { sessionHistoryStub, usageHistoryStub, lastActivityAt } = await makeSetup(0)
    expect(sessionHistoryStub.endSession).toHaveBeenCalledWith('sess-exit', {
      endedAt: expect.any(Number),
      status: 'exited',
    })
    expect(usageHistoryStub.recordSession).toHaveBeenCalledTimes(1)
    // Active time is derived from lastActivityAt, not endedAt — recordSession
    // must receive the record's lastActivityAt verbatim (idle-trim source).
    expect(usageHistoryStub.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ lastActivityAt }),
    )
  })

  it('records session when exitCode is null (SIGTERM / user kill)', async () => {
    const { sessionHistoryStub, usageHistoryStub, lastActivityAt } = await makeSetup(null)
    expect(sessionHistoryStub.endSession).toHaveBeenCalledWith('sess-exit', {
      endedAt: expect.any(Number),
      status: 'exited',
    })
    expect(usageHistoryStub.recordSession).toHaveBeenCalledTimes(1)
    expect(usageHistoryStub.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ lastActivityAt }),
    )
  })

  it('records session even when exitCode is non-zero (maps to error status)', async () => {
    const { sessionHistoryStub, usageHistoryStub, lastActivityAt } = await makeSetup(1)
    expect(sessionHistoryStub.endSession).toHaveBeenCalledWith('sess-exit', {
      endedAt: expect.any(Number),
      status: 'error',
    })
    // All sessions are recorded regardless of status
    expect(usageHistoryStub.recordSession).toHaveBeenCalledTimes(1)
    expect(usageHistoryStub.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ lastActivityAt }),
    )
  })
})

describe('pty:spawn review-detection wiring', () => {
  it('registers a one-shot exit listener when projectPath resolves to a projectId', async () => {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const mgr = { spawn: vi.fn(() => ({ ok: true })) }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: (path) => (path === '/known/path' ? 'proj-42' : null),
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
      sessionHistory: stubSessionHistory(),
      usageHistory: stubUsageHistory(),
      agentRegistry: stubRegistry(),
    })

    call('pty:spawn', 'sess-known', 80, 24, '/known/path', undefined, undefined, 'claude-code')

    expect(onceSpy).toHaveBeenCalledWith('exit:sess-known', expect.any(Function))
  })

  it('does NOT register an exit listener when projectPath has no projectId', async () => {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const mgr = { spawn: vi.fn(() => ({ ok: true })) }
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

    call('pty:spawn', 'sess-orphan', 80, 24, '/unknown/path', undefined, undefined, 'claude-code')

    expect(onceSpy).not.toHaveBeenCalled()
  })

  it('does NOT register an exit listener when there is no projectPath at all', async () => {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const mgr = { spawn: vi.fn(() => ({ ok: true })) }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: () => 'should-not-be-called',
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
      sessionHistory: stubSessionHistory(),
      usageHistory: stubUsageHistory(),
      agentRegistry: stubRegistry(),
    })

    call('pty:spawn', 'sess-no-project', 80, 24)

    expect(onceSpy).not.toHaveBeenCalled()
  })
})

describe('pty:spawn session-reuse (no double session-init)', () => {
  // pty-manager.spawn returns { reused: true } when an existing PTY is reused
  // (e.g. a session moved between panes). The handler must NOT re-run
  // startSession (which would reset the record) or register a second exit
  // listener (which would double-count usage on exit).
  it('skips startSession and exit-listener registration when the PTY was reused', async () => {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const sessionHistoryStub = stubSessionHistory()
    const mgr = { spawn: vi.fn(() => ({ ok: true, reused: true })) }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: () => 'proj-1',
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
      sessionHistory: sessionHistoryStub,
      usageHistory: stubUsageHistory(),
      agentRegistry: stubRegistry(),
    })

    call('pty:spawn', 'sess-reuse', 80, 24, '/proj', undefined, undefined, 'claude-code')

    expect(sessionHistoryStub.startSession).not.toHaveBeenCalled()
    expect(onceSpy).not.toHaveBeenCalled()
  })

  it('runs startSession and registers exactly one exit listener on a fresh spawn', async () => {
    handlers.clear()
    const { ptyBus } = await import('../pty-bus')
    const onceSpy = vi.mocked(ptyBus.once)
    onceSpy.mockClear()

    const sessionHistoryStub = stubSessionHistory()
    const mgr = { spawn: vi.fn(() => ({ ok: true, reused: false })) }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: () => 'proj-1',
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
      sessionHistory: sessionHistoryStub,
      usageHistory: stubUsageHistory(),
      agentRegistry: stubRegistry(),
    })

    call('pty:spawn', 'sess-fresh', 80, 24, '/proj', undefined, undefined, 'claude-code')

    expect(sessionHistoryStub.startSession).toHaveBeenCalledTimes(1)
    expect(onceSpy).toHaveBeenCalledWith('exit:sess-fresh', expect.any(Function))
  })
})

describe('pty:spawn custom-agent gate (registry.has)', () => {
  let regDir: string
  let registry: AgentRegistry
  let mgr: { spawn: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    handlers.clear()
    regDir = mkdtempSync(join(tmpdir(), 'agdeck-pty-spawn-reg-'))
    registry = new AgentRegistry(join(regDir, 'agents.toml'))
    registry.load()
    // A persisted custom agent that the spawn gate must now accept.
    await registry.saveCustom({ id: 'my-agent', binary: 'my-agent-bin', ui: { name: 'My Agent' } })

    mgr = { spawn: vi.fn(() => ({ ok: true })) }
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
      agentRegistry: registry,
    })
  })

  afterEach(() => rmSync(regDir, { recursive: true, force: true }))

  it('accepts a custom registry agent id and delegates to the pty manager', () => {
    expect(() =>
      call('pty:spawn', 'sess-c', 80, 24, '/p', undefined, undefined, 'my-agent'),
    ).not.toThrow()
    expect(mgr.spawn).toHaveBeenCalled()
  })

  it('still rejects an id that is neither a builtin nor a registered custom agent', () => {
    expect(() =>
      call('pty:spawn', 'sess-c', 80, 24, '/p', undefined, undefined, 'gpt-hacker'),
    ).toThrow(/agent/)
    expect(mgr.spawn).not.toHaveBeenCalled()
  })
})
