import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LogAdapter, TokenUsage } from './log-adapters'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type ExecFileCb = (err: Error | null, stdout: string, stderr: string) => void

const mockExecFile = vi.fn()

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}))

// Dynamic import so mocks are wired before module evaluation
const { createCostTracker } = await import('./cost-tracker')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockWindow(destroyed = false): import('electron').BrowserWindow {
  const send = vi.fn()
  return {
    isDestroyed: () => destroyed,
    webContents: { send },
  } as unknown as import('electron').BrowserWindow
}

/** Create a minimal adapter for testing */
function makeTestAdapter(overrides: Partial<LogAdapter> = {}): LogAdapter {
  return {
    agent: 'claude-code',
    getLogDirs: () => ['~/.claude/projects/test/sessions/'],
    getFilePattern: () => '*.jsonl',
    matchSession: () => true,
    parseUsage: (_line: string, acc: TokenUsage): TokenUsage | null => {
      return {
        inputTokens: acc.inputTokens + 100,
        outputTokens: acc.outputTokens + 50,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 0.01,
      }
    },
    ...overrides,
  }
}

const BIND_OPTS = {
  agent: 'claude-code',
  projectPath: '/home/rooty/project',
  cwd: '/home/rooty/project',
  spawnAt: Date.now(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  mockExecFile.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── bindSession ────────────────────────────────────────────────────

describe('bindSession', () => {
  it('is a no-op for unsupported agents', () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ agent: 'claude-code' })
    const tracker = createCostTracker(win, [adapter])

    tracker.bindSession('s1', { ...BIND_OPTS, agent: 'goose' })

    // No WSL calls should have been made
    expect(mockExecFile).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('starts discovery polling for a supported agent', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(null, '', '')
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Advance past first discovery poll — async version flushes microtasks
    await vi.advanceTimersByTimeAsync(2000)

    expect(mockExecFile).toHaveBeenCalled()

    tracker.destroy()
  })
})

// ─── unbindSession ──────────────────────────────────────────────────

describe('unbindSession', () => {
  it('clears session and stops timers', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(null, '', '')
      },
    )

    tracker.bindSession('s1', BIND_OPTS)
    tracker.unbindSession('s1')

    // Advancing timers should NOT trigger any more WSL calls
    mockExecFile.mockReset()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockExecFile).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('is a no-op for unknown sessionId', () => {
    const win = makeMockWindow()
    const tracker = createCostTracker(win, [])

    // Should not throw
    tracker.unbindSession('nonexistent')

    tracker.destroy()
  })
})

// ─── destroy ────────────────────────────────────────────────────────

describe('destroy', () => {
  it('clears all sessions and stops all timers', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(null, '', '')
      },
    )

    tracker.bindSession('s1', BIND_OPTS)
    tracker.bindSession('s2', { ...BIND_OPTS, agent: 'claude-code' })
    tracker.destroy()

    // Advancing timers should NOT trigger any more WSL calls
    mockExecFile.mockReset()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockExecFile).not.toHaveBeenCalled()
  })
})

// ─── File discovery ─────────────────────────────────────────────────

describe('file discovery', () => {
  it('finds a log file and begins tailing', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter({
      matchSession: () => true,
    })
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        if (callCount === 1) {
          // Discovery: find returns a file
          cb(null, '/home/rooty/.claude/projects/test/sessions/abc.jsonl\n', '')
        } else if (callCount === 2) {
          // Read first 3 lines for matchSession
          cb(null, '{"cwd":"/home/rooty/project"}\n{"type":"init"}\n{"type":"start"}\n', '')
        } else {
          // Tailing poll: stat size + new content
          cb(null, '50\n{"message":{"usage":{"input_tokens":100}}}\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery poll at 2s (find + head resolve via microtasks)
    await vi.advanceTimersByTimeAsync(2000)

    // Tailing poll at 3s after discovery
    await vi.advanceTimersByTimeAsync(3000)

    expect(win.webContents.send).toHaveBeenCalledWith(
      'cost:update',
      expect.objectContaining({ sessionId: 's1' }),
    )

    tracker.destroy()
  })

  it('stops discovery after 30s with no match', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter({
      matchSession: () => false,
    })
    const tracker = createCostTracker(win, [adapter])

    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        // find always returns a file, but matchSession always returns false
        cb(null, '/home/rooty/.claude/projects/test/sessions/abc.jsonl\n', '')
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Advance 32s — well past the 30s discovery timeout
    await vi.advanceTimersByTimeAsync(32_000)

    // After discovery timeout, no more calls should happen
    mockExecFile.mockReset()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockExecFile).not.toHaveBeenCalled()

    tracker.destroy()
  })
})

// ─── File tailing ───────────────────────────────────────────────────

describe('file tailing', () => {
  it('parses complete lines and sends cost:update IPC', async () => {
    const win = makeMockWindow()
    const send = (win.webContents as unknown as { send: ReturnType<typeof vi.fn> }).send
    const parseUsage = vi.fn((_line: string, acc: TokenUsage): TokenUsage | null => {
      return {
        inputTokens: acc.inputTokens + 100,
        outputTokens: acc.outputTokens + 50,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 0.01,
      }
    })
    const adapter = makeTestAdapter({ parseUsage })
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        const cmd = Array.isArray(args) ? args.join(' ') : ''
        if (cmd.includes('echo "$HOME"')) {
          // R4-01: Home resolution call added by startDiscovery
          cb(null, '/home/rooty\n', '')
        } else if (callCount === 2) {
          // Discovery: find returns a file
          cb(null, '/home/rooty/.claude/sessions/abc.jsonl\n', '')
        } else if (callCount === 3) {
          // head: session match
          cb(null, '{"cwd":"/home/rooty/project"}\n', '')
        } else if (callCount === 4) {
          // First tail poll: stat + content with two complete lines
          cb(null, '80\n{"line":"one"}\n{"line":"two"}\n', '')
        } else {
          // Subsequent polls: no new data
          cb(null, '80\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery poll (find + head)
    await vi.advanceTimersByTimeAsync(2000)

    // Tail poll
    await vi.advanceTimersByTimeAsync(3000)

    // parseUsage should have been called for each complete line
    expect(parseUsage).toHaveBeenCalledTimes(2)

    // cost:update IPC should have been sent
    expect(send).toHaveBeenCalledWith(
      'cost:update',
      expect.objectContaining({
        sessionId: 's1',
        usage: expect.objectContaining({
          inputTokens: 200,
          outputTokens: 100,
        }),
      }),
    )

    tracker.destroy()
  })

  it('buffers partial lines until the next poll completes them', async () => {
    const win = makeMockWindow()
    const parseUsage = vi.fn((_line: string, acc: TokenUsage): TokenUsage | null => {
      return {
        inputTokens: acc.inputTokens + 100,
        outputTokens: acc.outputTokens + 50,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 0.01,
      }
    })
    const adapter = makeTestAdapter({ parseUsage })
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        const cmd = Array.isArray(args) ? args.join(' ') : ''
        if (cmd.includes('echo "$HOME"')) {
          cb(null, '/home/rooty\n', '')
        } else if (callCount === 2) {
          cb(null, '/home/rooty/.claude/sessions/abc.jsonl\n', '')
        } else if (callCount === 3) {
          cb(null, '{"cwd":"/home/rooty/project"}\n', '')
        } else if (callCount === 4) {
          // First tail: one complete line + one partial (no trailing newline)
          cb(null, '60\n{"line":"one"}\n{"line":"tw', '')
        } else if (callCount === 5) {
          // Second tail: completes the partial line
          cb(null, '80\no"}\n', '')
        } else {
          cb(null, '80\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery (home resolve + find + head)
    await vi.advanceTimersByTimeAsync(2000)

    // First tail — only line one is complete
    await vi.advanceTimersByTimeAsync(3000)
    expect(parseUsage).toHaveBeenCalledTimes(1)

    // Second tail — completes the partial line
    await vi.advanceTimersByTimeAsync(3000)
    expect(parseUsage).toHaveBeenCalledTimes(2)

    tracker.destroy()
  })

  it('resets offset when file is truncated (stat size < offset)', async () => {
    const win = makeMockWindow()
    const parseUsage = vi.fn((_line: string, acc: TokenUsage): TokenUsage | null => {
      return {
        inputTokens: acc.inputTokens + 100,
        outputTokens: acc.outputTokens + 50,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 0.01,
      }
    })
    const adapter = makeTestAdapter({ parseUsage })
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        const cmd = Array.isArray(args) ? args.join(' ') : ''
        if (cmd.includes('echo "$HOME"')) {
          cb(null, '/home/rooty\n', '')
        } else if (callCount === 2) {
          cb(null, '/home/rooty/.claude/sessions/abc.jsonl\n', '')
        } else if (callCount === 3) {
          cb(null, '{"cwd":"/home/rooty/project"}\n', '')
        } else if (callCount === 4) {
          // First tail: 80 bytes of content
          cb(null, '80\n{"line":"one"}\n', '')
        } else if (callCount === 5) {
          // File was truncated: stat says 20 bytes, which is less than our offset
          // The tracker should reset and re-read from beginning
          cb(null, '20\n{"line":"reset"}\n', '')
        } else {
          cb(null, '20\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery (home resolve + find + head) + first tail
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)
    expect(parseUsage).toHaveBeenCalledTimes(1)

    // Truncation tail — re-polls immediately after reset, then the re-read
    await vi.advanceTimersByTimeAsync(3000)
    expect(parseUsage).toHaveBeenCalledTimes(2)

    tracker.destroy()
  })

  it('does not send IPC when window is destroyed', async () => {
    const win = makeMockWindow(true) // destroyed
    const send = (win.webContents as unknown as { send: ReturnType<typeof vi.fn> }).send
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        if (callCount === 1) {
          cb(null, '/home/rooty/.claude/sessions/abc.jsonl\n', '')
        } else if (callCount === 2) {
          cb(null, '{"cwd":"/home/rooty/project"}\n', '')
        } else {
          cb(null, '80\n{"line":"one"}\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(send).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('does not call parseUsage when line is empty', async () => {
    const win = makeMockWindow()
    const parseUsage = vi.fn()
    const adapter = makeTestAdapter({ parseUsage })
    const tracker = createCostTracker(win, [adapter])

    let callCount = 0
    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        callCount++
        if (callCount === 1) {
          cb(null, '/home/rooty/.claude/sessions/abc.jsonl\n', '')
        } else if (callCount === 2) {
          cb(null, '{"cwd":"/home/rooty/project"}\n', '')
        } else {
          // Tail returns stat + empty lines only
          cb(null, '10\n\n\n', '')
        }
      },
    )

    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(parseUsage).not.toHaveBeenCalled()

    tracker.destroy()
  })
})
