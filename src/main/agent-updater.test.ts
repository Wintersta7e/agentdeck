import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The module under test calls execFile(cmd, args, opts, callback) directly.
 * We mock execFile to invoke the callback with controlled stdout/stderr/err.
 */

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
const { checkAgentVersion, updateAgent, checkAllUpdates } = await import('./agent-updater')

/** Queue of results to return from mockExecFile — consumed in order */
let callQueue: Array<{ stdout: string; stderr?: string; err?: Error }>

function enqueue(...results: Array<{ stdout: string; stderr?: string; err?: Error }>): void {
  callQueue.push(...results)
  mockExecFile.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
      const r = callQueue.shift() ?? { stdout: '', err: new Error('unexpected call') }
      cb(r.err ?? null, r.stdout, r.stderr ?? '')
    },
  )
}

beforeEach(() => {
  mockExecFile.mockReset()
  callQueue = []
})

// ─── checkAgentVersion ──────────────────────────────────────────────

describe('checkAgentVersion', () => {
  it('returns updateAvailable=true when current and latest differ', async () => {
    enqueue({ stdout: 'Claude Code v2.1.69 (stable)\n' }, { stdout: '2.2.0\n' })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: '2.1.69',
      latest: '2.2.0',
      updateAvailable: true,
    })
  })

  it('returns updateAvailable=false when versions match', async () => {
    enqueue({ stdout: '1.5.0\n' }, { stdout: '1.5.0\n' })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: '1.5.0',
      latest: '1.5.0',
      updateAvailable: false,
    })
  })

  it('returns all nulls for unknown agent', async () => {
    const info = await checkAgentVersion('nonexistent-agent')

    expect(info).toEqual({
      agentId: 'nonexistent-agent',
      current: null,
      latest: null,
      updateAvailable: false,
    })
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('returns null current when version command fails, still gets latest', async () => {
    enqueue({ stdout: '', err: new Error('command not found') }, { stdout: '2.2.0\n' })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: null,
      latest: '2.2.0',
      updateAvailable: false,
    })
  })

  it('returns null latest when registry check fails', async () => {
    enqueue({ stdout: '2.1.0\n' }, { stdout: '', err: new Error('npm registry unreachable') })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: '2.1.0',
      latest: null,
      updateAvailable: false,
    })
  })

  it('extracts semver from complex version strings', async () => {
    enqueue({ stdout: 'codex-cli 0.107.0\n' }, { stdout: '0.108.0\n' })

    const info = await checkAgentVersion('codex')

    expect(info).toEqual({
      agentId: 'codex',
      current: '0.107.0',
      latest: '0.108.0',
      updateAvailable: true,
    })
  })

  it('tolerates stderr noise when stdout has data', async () => {
    enqueue(
      { stdout: '2.1.69\n', stderr: 'fnm: command not found', err: new Error('exit 1') },
      { stdout: '2.2.0\n' },
    )

    const info = await checkAgentVersion('claude-code')

    expect(info.current).toBe('2.1.69')
    expect(info.latest).toBe('2.2.0')
  })
})

// ─── updateAgent ────────────────────────────────────────────────────

describe('updateAgent', () => {
  it('returns success when update command succeeds', async () => {
    enqueue(
      { stdout: 'updated\n' }, // update cmd
      { stdout: '2.3.0\n' }, // re-check: version
      { stdout: '2.3.0\n' }, // re-check: latest
    )

    const result = await updateAgent('claude-code')

    expect(result).toEqual({
      agentId: 'claude-code',
      success: true,
      newVersion: '2.3.0',
      message: 'Updated to 2.3.0',
    })
    expect(mockExecFile).toHaveBeenCalledTimes(3)
  })

  it('returns failure when update command errors', async () => {
    enqueue({ stdout: '', err: new Error('permission denied') })

    const result = await updateAgent('claude-code')

    expect(result).toEqual({
      agentId: 'claude-code',
      success: false,
      newVersion: null,
      message: 'permission denied',
    })
  })

  it('returns "Unknown agent" for invalid agentId', async () => {
    const result = await updateAgent('fake-agent')

    expect(result).toEqual({
      agentId: 'fake-agent',
      success: false,
      newVersion: null,
      message: 'Unknown agent',
    })
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('succeeds when update has stderr noise but stdout is present', async () => {
    enqueue(
      { stdout: 'added 1 package\n', stderr: 'fnm: command not found', err: new Error('exit 1') },
      { stdout: '2.3.0\n' },
      { stdout: '2.3.0\n' },
    )

    const result = await updateAgent('claude-code')

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe('2.3.0')
  })
})

// ─── checkAllUpdates ────────────────────────────────────────────────

describe('checkAllUpdates', () => {
  it('sends IPC for each installed agent', async () => {
    const send = vi.fn()
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as import('electron').BrowserWindow

    const installed: Record<string, boolean> = {
      'claude-code': true,
      codex: true,
      aider: false,
    }

    // Use command-string matching since calls are concurrent
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
        const cmd = args[3] as string
        if (cmd.includes('claude --version')) {
          cb(null, '2.1.0\n', '')
        } else if (cmd.includes('@anthropic-ai/claude-code version')) {
          cb(null, '2.2.0\n', '')
        } else if (cmd.includes('npm list -g @openai/codex')) {
          cb(null, '0.107.0\n', '')
        } else if (cmd.includes('@openai/codex version')) {
          cb(null, '0.107.0\n', '')
        } else {
          cb(new Error(`unexpected cmd: ${cmd}`), '', '')
        }
      },
    )

    checkAllUpdates(win, installed)

    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledTimes(2)
    })

    expect(send).toHaveBeenCalledWith('agents:versionInfo', {
      agentId: 'claude-code',
      current: '2.1.0',
      latest: '2.2.0',
      updateAvailable: true,
    })
    expect(send).toHaveBeenCalledWith('agents:versionInfo', {
      agentId: 'codex',
      current: '0.107.0',
      latest: '0.107.0',
      updateAvailable: false,
    })

    expect(mockExecFile).toHaveBeenCalledTimes(4)
  })
})
