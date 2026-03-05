import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The module under test does:
 *   import { execFile } from 'child_process'
 *   import { promisify } from 'util'
 *   const execFileAsync = promisify(execFile)   // captured at module scope
 *
 * We mock `util.promisify` to return a single stable mock function.
 * The module captures that reference once, then tests control it via
 * mockRunCmd.mockResolvedValueOnce / mockRejectedValueOnce / etc.
 */

const mockRunCmd = vi.fn()

vi.mock('util', () => ({
  promisify: () => mockRunCmd,
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(),
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

beforeEach(() => {
  mockRunCmd.mockReset()
})

// ─── checkAgentVersion ──────────────────────────────────────────────

describe('checkAgentVersion', () => {
  it('returns updateAvailable=true when current and latest differ', async () => {
    mockRunCmd
      .mockResolvedValueOnce({ stdout: 'Claude Code v2.1.69 (stable)\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '2.2.0\n', stderr: '' })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: '2.1.69',
      latest: '2.2.0',
      updateAvailable: true,
    })
  })

  it('returns updateAvailable=false when versions match', async () => {
    mockRunCmd
      .mockResolvedValueOnce({ stdout: '1.5.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '1.5.0\n', stderr: '' })

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
    expect(mockRunCmd).not.toHaveBeenCalled()
  })

  it('returns null current when version command fails, still gets latest', async () => {
    mockRunCmd
      .mockRejectedValueOnce(new Error('command not found'))
      .mockResolvedValueOnce({ stdout: '2.2.0\n', stderr: '' })

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: null,
      latest: '2.2.0',
      updateAvailable: false,
    })
  })

  it('returns null latest when registry check fails', async () => {
    mockRunCmd
      .mockResolvedValueOnce({ stdout: '2.1.0\n', stderr: '' })
      .mockRejectedValueOnce(new Error('npm registry unreachable'))

    const info = await checkAgentVersion('claude-code')

    expect(info).toEqual({
      agentId: 'claude-code',
      current: '2.1.0',
      latest: null,
      updateAvailable: false,
    })
  })

  it('extracts semver from complex version strings', async () => {
    mockRunCmd
      .mockResolvedValueOnce({ stdout: 'codex-cli 0.107.0\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '0.108.0\n', stderr: '' })

    const info = await checkAgentVersion('codex')

    expect(info).toEqual({
      agentId: 'codex',
      current: '0.107.0',
      latest: '0.108.0',
      updateAvailable: true,
    })
  })
})

// ─── updateAgent ────────────────────────────────────────────────────

describe('updateAgent', () => {
  it('returns success when update command succeeds', async () => {
    // Call 1: update command itself
    mockRunCmd.mockResolvedValueOnce({ stdout: 'updated\n', stderr: '' })
    // Calls 2 & 3: checkAgentVersion after update (version + latest)
    mockRunCmd.mockResolvedValueOnce({ stdout: '2.3.0\n', stderr: '' })
    mockRunCmd.mockResolvedValueOnce({ stdout: '2.3.0\n', stderr: '' })

    const result = await updateAgent('claude-code')

    expect(result).toEqual({
      agentId: 'claude-code',
      success: true,
      newVersion: '2.3.0',
      message: 'Updated to 2.3.0',
    })
    expect(mockRunCmd).toHaveBeenCalledTimes(3)
  })

  it('returns failure when update command errors', async () => {
    mockRunCmd.mockRejectedValueOnce(new Error('permission denied'))

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
    expect(mockRunCmd).not.toHaveBeenCalled()
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

    // Two agents installed, one not
    const installed: Record<string, boolean> = {
      'claude-code': true,
      codex: true,
      aider: false,
    }

    // checkAllUpdates fires concurrent checkAgentVersion calls, so
    // mockResolvedValueOnce ordering is non-deterministic. Use
    // mockImplementation that inspects the WSL command string.
    mockRunCmd.mockImplementation((_bin: string, args: string[]) => {
      const cmd = args[3] as string // NODE_INIT + actual command
      if (cmd.includes('claude --version')) {
        return Promise.resolve({ stdout: '2.1.0\n', stderr: '' })
      }
      if (cmd.includes('@anthropic-ai/claude-code version')) {
        return Promise.resolve({ stdout: '2.2.0\n', stderr: '' })
      }
      if (cmd.includes('codex --version')) {
        return Promise.resolve({ stdout: '0.107.0\n', stderr: '' })
      }
      if (cmd.includes('@openai/codex version')) {
        return Promise.resolve({ stdout: '0.107.0\n', stderr: '' })
      }
      return Promise.reject(new Error(`unexpected cmd: ${cmd}`))
    })

    checkAllUpdates(win, installed)

    // Wait for the fire-and-forget promises to settle
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

    // aider was false, so only 4 runWslCmd calls total (2 per agent)
    expect(mockRunCmd).toHaveBeenCalledTimes(4)
  })
})
