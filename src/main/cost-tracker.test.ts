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

/**
 * Standard mock that routes calls based on the shell command content.
 * $HOME is resolved once at tracker creation; subsequent calls are
 * find, head, and tail commands.
 */
function makeRoutingMock(overrides?: {
  home?: string
  findResult?: string
  headResult?: string
  tailResults?: string[]
}): void {
  const home = overrides?.home ?? '/home/rooty'
  const findResult =
    overrides?.findResult ?? '/home/rooty/.claude/projects/test/sessions/abc.jsonl\n'
  const headResult = overrides?.headResult ?? '{"cwd":"/home/rooty/project"}\n'
  const tailResults = overrides?.tailResults ?? ['80\n{"line":"one"}\n{"line":"two"}\n', '80\n']
  let tailIndex = 0

  mockExecFile.mockImplementation(
    (_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
      const cmd = Array.isArray(args) ? args.join(' ') : ''
      if (cmd.includes('echo "$HOME"')) {
        cb(null, `${home}\n`, '')
      } else if (cmd.includes('CLAUDE_CONFIG_DIR') || cmd.includes('CODEX_HOME')) {
        // Agent env var resolution — return empty (use defaults)
        cb(null, '\n', '')
      } else if (cmd.includes('find ')) {
        cb(null, findResult, '')
      } else if (cmd.includes('head ')) {
        cb(null, headResult, '')
      } else if (cmd.includes('stat ') || cmd.includes('tail ')) {
        const result = tailResults[tailIndex] ?? tailResults[tailResults.length - 1] ?? '0\n'
        if (tailIndex < tailResults.length - 1) tailIndex++
        cb(null, result, '')
      } else {
        cb(null, '', '')
      }
    },
  )
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
  it('is a no-op for unsupported agents', async () => {
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ agent: 'claude-code' })
    const tracker = createCostTracker(win, [adapter])

    // Wait for $HOME resolution
    await vi.advanceTimersByTimeAsync(0)

    mockExecFile.mockReset()
    tracker.bindSession('s1', { ...BIND_OPTS, agent: 'goose' })

    // No WSL calls should have been made (beyond the initial $HOME)
    expect(mockExecFile).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('starts discovery polling for a supported agent', async () => {
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    // Wait for $HOME resolution
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)

    // Advance past first discovery poll
    await vi.advanceTimersByTimeAsync(2000)

    // find command should have been called
    const findCalls = mockExecFile.mock.calls.filter((c: unknown[]) => {
      const args = c[1] as string[]
      const cmd = Array.isArray(args) ? args.join(' ') : ''
      return cmd.includes('find ')
    })
    expect(findCalls.length).toBeGreaterThan(0)

    tracker.destroy()
  })
})

// ─── unbindSession ──────────────────────────────────────────────────

describe('unbindSession', () => {
  it('clears session and stops timers', async () => {
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)
    tracker.unbindSession('s1')

    // Advancing timers should NOT trigger any more WSL calls
    mockExecFile.mockReset()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockExecFile).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('is a no-op for unknown sessionId', () => {
    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(null, '/home/rooty\n', '')
      },
    )
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
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

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
  it('resolves $HOME once and reuses for all sessions', async () => {
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])

    // Wait for initial $HOME resolution
    await vi.advanceTimersByTimeAsync(0)

    // Count $HOME calls so far
    const homeCallsBefore = mockExecFile.mock.calls.filter((c: unknown[]) => {
      const args = c[1] as string[]
      return Array.isArray(args) && args.join(' ').includes('echo "$HOME"')
    }).length
    expect(homeCallsBefore).toBe(1)

    // Bind two sessions
    tracker.bindSession('s1', BIND_OPTS)
    tracker.bindSession('s2', { ...BIND_OPTS })

    // Advance through several discovery cycles
    await vi.advanceTimersByTimeAsync(10_000)

    // $HOME should still have been called only once (at creation)
    const homeCallsAfter = mockExecFile.mock.calls.filter((c: unknown[]) => {
      const args = c[1] as string[]
      return Array.isArray(args) && args.join(' ').includes('echo "$HOME"')
    }).length
    expect(homeCallsAfter).toBe(1)

    tracker.destroy()
  })

  it('finds a log file and begins tailing', async () => {
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ matchSession: () => true })
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

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
    makeRoutingMock()
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ matchSession: () => false })
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)

    // Advance 32s — well past the 30s discovery timeout
    await vi.advanceTimersByTimeAsync(32_000)

    // After discovery timeout, no more find/head calls should happen
    const callsBefore = mockExecFile.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    // Only the existing calls, no new find/head calls
    const newCalls = mockExecFile.mock.calls.slice(callsBefore).filter((c: unknown[]) => {
      const args = c[1] as string[]
      const cmd = Array.isArray(args) ? args.join(' ') : ''
      return cmd.includes('find ') || cmd.includes('head ')
    })
    expect(newCalls.length).toBe(0)

    tracker.destroy()
  })

  it('skips files already bound to another session', async () => {
    const file = '/home/rooty/.claude/projects/test/sessions/abc.jsonl'
    const matchSession = vi.fn(() => true)
    makeRoutingMock({ findResult: `${file}\n` })
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ matchSession })
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

    // Session 1 binds to the file
    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000) // discovery finds and matches

    // Reset to track calls for session 2
    matchSession.mockClear()

    // Session 2 starts — find returns the same file
    tracker.bindSession('s2', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)

    // matchSession should NOT have been called for session 2 (file was skipped)
    expect(matchSession).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('releases bound file on unbind so other sessions can claim it', async () => {
    const file = '/home/rooty/.claude/projects/test/sessions/abc.jsonl'
    makeRoutingMock({ findResult: `${file}\n` })
    const win = makeMockWindow()
    const adapter = makeTestAdapter({ matchSession: () => true })
    const tracker = createCostTracker(win, [adapter])

    await vi.advanceTimersByTimeAsync(0)

    // Session 1 binds, then unbinds
    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    tracker.unbindSession('s1')

    // Session 2 should now be able to claim the same file
    tracker.bindSession('s2', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000) // tail poll

    expect(win.webContents.send).toHaveBeenCalledWith(
      'cost:update',
      expect.objectContaining({ sessionId: 's2' }),
    )

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

    makeRoutingMock({
      tailResults: ['80\n{"line":"one"}\n{"line":"two"}\n', '80\n'],
    })

    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0) // $HOME

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

    makeRoutingMock({
      tailResults: [
        '60\n{"line":"one"}\n{"line":"tw', // partial line
        '80\no"}\n', // completes the partial
        '80\n',
      ],
    })

    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery (find + head) + first tail
    await vi.advanceTimersByTimeAsync(2000)
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

    makeRoutingMock({
      tailResults: [
        '80\n{"line":"one"}\n', // first tail: 80 bytes
        '20\n{"line":"reset"}\n', // truncated: stat says 20, less than offset
        '20\n', // after reset and re-read
      ],
    })

    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)

    // Discovery + first tail
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

    makeRoutingMock()
    const adapter = makeTestAdapter()
    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0)

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

    makeRoutingMock({
      tailResults: ['10\n\n\n', '10\n'],
    })

    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(parseUsage).not.toHaveBeenCalled()

    tracker.destroy()
  })
})

// ─── Cost history persistence ───────────────────────────────────────

describe('cost history persistence', () => {
  it('records per-poll cost delta to CostHistory when usage changes', async () => {
    const win = makeMockWindow()
    const recordCost = vi.fn()
    const costHistory = { recordCost }

    const adapter = makeTestAdapter({
      // Each line adds $0.01 and 150 tokens (100 input + 50 output)
      parseUsage: (_line: string, acc: TokenUsage): TokenUsage | null => ({
        inputTokens: acc.inputTokens + 100,
        outputTokens: acc.outputTokens + 50,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 0.01,
      }),
    })

    makeRoutingMock({
      tailResults: [
        // Poll 1: two lines → +$0.02, +300 tokens
        '80\n{"line":"one"}\n{"line":"two"}\n',
        // Poll 2: one line → +$0.01, +150 tokens
        '120\n{"line":"three"}\n',
        // Poll 3: no new data
        '120\n',
      ],
    })

    const tracker = createCostTracker(win, [adapter], costHistory)
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)
    // Discovery (find + head)
    await vi.advanceTimersByTimeAsync(2000)
    // Tail poll 1
    await vi.advanceTimersByTimeAsync(3000)
    // Tail poll 2
    await vi.advanceTimersByTimeAsync(3000)

    expect(recordCost).toHaveBeenCalledTimes(2)
    // Poll 1 delta: $0.02, 300 tokens
    const call1 = recordCost.mock.calls[0]
    expect(call1?.[0]).toBe('claude-code')
    expect(call1?.[1]).toBeCloseTo(0.02, 8)
    expect(call1?.[2]).toBe(300)
    // Poll 2 delta: $0.01, 150 tokens (NOT cumulative — just what changed this poll)
    const call2 = recordCost.mock.calls[1]
    expect(call2?.[0]).toBe('claude-code')
    expect(call2?.[1]).toBeCloseTo(0.01, 8)
    expect(call2?.[2]).toBe(150)

    tracker.destroy()
  })

  it('skips recordCost call when tail poll produces no usage change', async () => {
    const win = makeMockWindow()
    const recordCost = vi.fn()
    const costHistory = { recordCost }

    // Adapter that never produces usage
    const adapter = makeTestAdapter({
      parseUsage: () => null,
    })

    makeRoutingMock({
      tailResults: ['40\n{"noise":"data"}\n', '40\n'],
    })

    const tracker = createCostTracker(win, [adapter], costHistory)
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(recordCost).not.toHaveBeenCalled()

    tracker.destroy()
  })

  it('is optional — tracker works without costHistory argument', async () => {
    const win = makeMockWindow()
    const adapter = makeTestAdapter()

    makeRoutingMock()

    // No third argument — existing call sites keep working
    const tracker = createCostTracker(win, [adapter])
    await vi.advanceTimersByTimeAsync(0)

    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    // IPC still fires — back-compat guaranteed
    expect(win.webContents.send).toHaveBeenCalledWith(
      'cost:update',
      expect.objectContaining({ sessionId: 's1' }),
    )

    tracker.destroy()
  })

  it('does not record when the per-poll delta is below COST_DELTA_EPSILON_USD (float noise)', async () => {
    const win = makeMockWindow()
    const recordCost = vi.fn()
    const costHistory = { recordCost }

    // Adapter emits a sub-epsilon cost delta (5e-10 USD)
    const adapter = makeTestAdapter({
      parseUsage: (_line: string, acc: TokenUsage): TokenUsage | null => ({
        inputTokens: acc.inputTokens + 1,
        outputTokens: acc.outputTokens,
        cacheReadTokens: acc.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
        totalCostUsd: acc.totalCostUsd + 5e-10,
      }),
    })

    makeRoutingMock({
      tailResults: ['40\n{"line":"one"}\n', '40\n'],
    })

    const tracker = createCostTracker(win, [adapter], costHistory)
    await vi.advanceTimersByTimeAsync(0)
    tracker.bindSession('s1', BIND_OPTS)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(3000)

    expect(recordCost).not.toHaveBeenCalled()

    tracker.destroy()
  })
})
