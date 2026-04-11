import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ptyBus } from './pty-bus'
import type { PtySpawnSuccessEvent, PtySpawnFailedEvent } from '../shared/office-types'

// Mock node-pty before importing pty-manager
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}))

// Mock logger to suppress output
vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock wsl-utils
vi.mock('./wsl-utils', () => ({
  toWslPath: (p: string) => p,
}))

import * as nodePty from 'node-pty'
import { createPtyManager } from './pty-manager'

describe('pty-manager spawn events', () => {
  const fakeMainWindow = {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    ptyBus.removeAllListeners()
  })

  it('emits spawn:success:<id> after a successful pty.spawn()', () => {
    const fakePty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(nodePty.spawn).mockReturnValue(fakePty as never)

    const manager = createPtyManager(fakeMainWindow)
    const successHandler = vi.fn()
    ptyBus.on('spawn:success:sess-1', successHandler)

    manager.spawn('sess-1', 80, 24, '/home/rooty/project', [], {}, 'claude-code', '')

    expect(successHandler).toHaveBeenCalledTimes(1)
    const payload = successHandler.mock.calls[0]![0] as PtySpawnSuccessEvent
    expect(payload.sessionId).toBe('sess-1')
    expect(payload.projectPath).toBe('/home/rooty/project')
    expect(payload.agent).toBe('claude-code')
    expect(payload.startedAtEpoch).toBeGreaterThan(0)
    expect(payload.startedAtMono).toBeGreaterThan(0)
  })

  it('emits broadcast spawn:success after a successful pty.spawn()', () => {
    const fakePty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(nodePty.spawn).mockReturnValue(fakePty as never)

    const manager = createPtyManager(fakeMainWindow)
    const broadcastHandler = vi.fn()
    ptyBus.on('spawn:success', broadcastHandler)

    manager.spawn('sess-2', 80, 24, '/home/rooty/project', [], {}, 'codex', '')

    expect(broadcastHandler).toHaveBeenCalledTimes(1)
    const payload = broadcastHandler.mock.calls[0]![0] as PtySpawnSuccessEvent
    expect(payload.sessionId).toBe('sess-2')
    expect(payload.agent).toBe('codex')
  })

  it('emits spawn:failed:<id> when pty.spawn() throws', () => {
    vi.mocked(nodePty.spawn).mockImplementation(() => {
      throw new Error('binary not found')
    })

    const manager = createPtyManager(fakeMainWindow)
    const failedHandler = vi.fn()
    ptyBus.on('spawn:failed:sess-3', failedHandler)

    manager.spawn('sess-3', 80, 24, '/home/rooty/project', [], {}, 'claude-code', '')

    expect(failedHandler).toHaveBeenCalledTimes(1)
    const payload = failedHandler.mock.calls[0]![0] as PtySpawnFailedEvent
    expect(payload.sessionId).toBe('sess-3')
    expect(payload.reason).toContain('binary not found')
  })

  it('emits broadcast spawn:failed when pty.spawn() throws', () => {
    vi.mocked(nodePty.spawn).mockImplementation(() => {
      throw new Error('permission denied')
    })

    const manager = createPtyManager(fakeMainWindow)
    const broadcastHandler = vi.fn()
    ptyBus.on('spawn:failed', broadcastHandler)

    manager.spawn('sess-4', 80, 24, '/home/rooty/project', [], {}, 'claude-code', '')

    expect(broadcastHandler).toHaveBeenCalledTimes(1)
  })

  it('does not emit success if pty.spawn() throws', () => {
    vi.mocked(nodePty.spawn).mockImplementation(() => {
      throw new Error('permission denied')
    })

    const manager = createPtyManager(fakeMainWindow)
    const successHandler = vi.fn()
    ptyBus.on('spawn:success:sess-5', successHandler)

    manager.spawn('sess-5', 80, 24, '/home/rooty/project', [], {}, 'claude-code', '')

    expect(successHandler).not.toHaveBeenCalled()
  })

  it('includes undefined projectPath when spawning without a project', () => {
    const fakePty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    }
    vi.mocked(nodePty.spawn).mockReturnValue(fakePty as never)

    const manager = createPtyManager(fakeMainWindow)
    const handler = vi.fn()
    ptyBus.on('spawn:success:sess-6', handler)

    manager.spawn('sess-6', 80, 24, undefined, [], {}, 'claude-code', '')

    expect(handler).toHaveBeenCalledTimes(1)
    const payload = handler.mock.calls[0]![0] as PtySpawnSuccessEvent
    expect(payload.projectPath).toBeUndefined()
  })
})
