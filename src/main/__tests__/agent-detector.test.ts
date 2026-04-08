import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'child_process'
import { detectAgents } from '../agent-detector'
import { AGENT_BINARY_MAP } from '../../shared/agents'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

const mockExecFile = vi.mocked(execFile)

/** Stub logger that swallows all output */
const stubLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void

/**
 * Configure execFile mock to resolve agent checks.
 * @param found - set of binary names that should be "found"
 */
function mockAgentChecks(found: Set<string>): void {
  mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
    const callback = cb as ExecCallback
    const argArr = args as string[]
    const cmdStr = argArr.join(' ')

    // Diagnostics — always succeed
    if (
      cmdStr.includes('echo $SHELL') ||
      cmdStr.includes('--status') ||
      cmdStr.includes('--version') ||
      cmdStr.includes('echo "$PATH"') ||
      cmdStr.includes('npm bin') ||
      cmdStr.includes('node --version')
    ) {
      callback(null, '/bin/bash', '')
      return undefined as never
    }

    // PATH check: `command -v <binary>`
    if (cmdStr.includes('command -v')) {
      const bin = cmdStr.split('command -v ')[1]?.trim()
      if (bin && found.has(bin)) {
        callback(null, `/usr/local/bin/${bin}`, '')
      } else {
        callback(new Error('not found'), '', '')
      }
      return undefined as never
    }

    // Fallback search script
    if (cmdStr.includes('found=""')) {
      // Check if any of the found binaries match
      const matchedBin = [...found].find((b) => cmdStr.includes(`/${b}`))
      if (matchedBin) {
        callback(null, `/home/user/.local/bin/${matchedBin}`, '')
      } else {
        callback(new Error('not found'), '', '')
      }
      return undefined as never
    }

    // Default: fail
    callback(new Error('unknown command'), '', '')
    return undefined as never
  })
}

describe('detectAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a record with all agent IDs as keys', async () => {
    mockAgentChecks(new Set())
    const result = await detectAgents(stubLog)
    const expectedKeys = Object.keys(AGENT_BINARY_MAP)
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort())
  })

  it('marks agents as true when found via PATH', async () => {
    mockAgentChecks(new Set(['claude', 'codex']))
    const result = await detectAgents(stubLog)
    expect(result['claude-code']).toBe(true)
    expect(result['codex']).toBe(true)
  })

  it('marks agents as false when not found', async () => {
    mockAgentChecks(new Set())
    const result = await detectAgents(stubLog)
    for (const val of Object.values(result)) {
      expect(val).toBe(false)
    }
  })

  it('handles mixed found/not-found results', async () => {
    mockAgentChecks(new Set(['claude']))
    const result = await detectAgents(stubLog)
    expect(result['claude-code']).toBe(true)
    expect(result['codex']).toBe(false)
    expect(result['aider']).toBe(false)
  })

  it('logs total detection time', async () => {
    mockAgentChecks(new Set())
    await detectAgents(stubLog)
    expect(stubLog.info).toHaveBeenCalledWith(expect.stringContaining('Agent detection total:'))
  })

  it('logs individual agent check results', async () => {
    mockAgentChecks(new Set(['claude']))
    await detectAgents(stubLog)
    expect(stubLog.info).toHaveBeenCalledWith(expect.stringMatching(/Agent check: claude → found/))
  })

  it('runs diagnostics without blocking agent checks', async () => {
    mockAgentChecks(new Set())
    await detectAgents(stubLog)
    // Diagnostics log via debug
    expect(stubLog.debug).toHaveBeenCalledWith(expect.stringContaining('WSL diag'))
  })

  it('respects MAX_CONCURRENT=3 (does not spawn all at once)', async () => {
    // Track concurrent calls
    let concurrent = 0
    let maxConcurrent = 0

    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      const callback = cb as ExecCallback
      const argArr = args as string[]
      const cmdStr = argArr.join(' ')

      // Diagnostics — instant
      if (!cmdStr.includes('command -v') && !cmdStr.includes('found=""')) {
        callback(null, '', '')
        return undefined as never
      }

      concurrent++
      if (concurrent > maxConcurrent) maxConcurrent = concurrent

      // Simulate async delay
      setTimeout(() => {
        concurrent--
        callback(new Error('not found'), '', '')
      }, 10)

      return undefined as never
    })

    await detectAgents(stubLog)
    // Max concurrent should be <= 3 (the MAX_CONCURRENT limit)
    // Each agent can trigger up to 2 calls (PATH + fallback), but concurrency
    // is limited at the agent level (3 agents checked simultaneously)
    expect(maxConcurrent).toBeLessThanOrEqual(6) // 3 agents × 2 calls each
  })

  it('handles execFile timeout gracefully', async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as ExecCallback
        const err = new Error('ETIMEDOUT') as NodeJS.ErrnoException
        err.code = 'ETIMEDOUT'
        callback(err, '', '')
        return undefined as never
      },
    )

    const result = await detectAgents(stubLog)
    // All agents should be false on timeout
    for (const val of Object.values(result)) {
      expect(val).toBe(false)
    }
  })

  it('returns false for agents when wsl.exe is not available', async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const callback = cb as ExecCallback
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        callback(err, '', '')
        return undefined as never
      },
    )

    const result = await detectAgents(stubLog)
    for (const val of Object.values(result)) {
      expect(val).toBe(false)
    }
  })
})
