import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PtyManager } from '../../pty-manager'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
    on: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('../../git-status', () => ({
  invalidateGitCache: vi.fn(),
}))

vi.mock('../../pty-bus', () => ({
  ptyBus: { once: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const { registerPtyHandlers } = await import('../ipc-pty')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

describe('pty:spawn IPC validation', () => {
  let mgr: { spawn: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handlers.clear()
    mgr = { spawn: vi.fn() }
    registerPtyHandlers(() => mgr as unknown as PtyManager, {
      getMainWindow: () => null,
      getProjectId: () => null,
      reviewTracker: {
        addReview: vi.fn(),
        getReviews: vi.fn(() => []),
        dismissReview: vi.fn(),
      } as unknown as Parameters<typeof registerPtyHandlers>[1]['reviewTracker'],
    })
  })

  it('rejects unsafe sessionId', () => {
    expect(() => call('pty:spawn', '../bad', 80, 24)).toThrow(/sessionId/)
  })

  it('rejects unknown agent ids', () => {
    expect(() =>
      call('pty:spawn', 'sess-1', 80, 24, '/p', undefined, undefined, 'gpt-hacker'),
    ).toThrow(/agent/)
  })

  it('rejects agentFlags containing shell metacharacters (SEC2-01)', () => {
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
})
