/**
 * Shell-node execution hardening (runShellNode):
 *  - generous maxBuffer so a successful-but-chatty command is not killed and
 *    misreported as a failure (execFile's 1 MiB default)
 *  - a non-numeric execFile error code (e.g. ERR_CHILD_PROCESS_STDIO_MAXBUFFER)
 *    is coerced to a numeric exit code, never a string in the numeric map
 *  - a timed-out command force-kills the whole WSL process tree (taskkill /F /T),
 *    not just SIGTERM to wsl.exe (which orphans the Linux process)
 *
 * runShellNode is driven directly with a hand-built NodeRunnerDeps and a mocked
 * child_process, mirroring node-runners-custom-agents.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'child_process'
import type { ShellNode } from '../shared/types'
import type { AgentRegistry } from './agent-registry'

const { mockSpawn, mockExecFile } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFile: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { runShellNode } = await import('./node-runners')

const emptyRegistry = (): AgentRegistry =>
  ({
    has: () => false,
    isCustom: () => false,
    binaryFor: () => undefined,
    argsFor: () => [],
    envFor: () => ({}),
  }) as unknown as AgentRegistry

function makeDeps(): Parameters<typeof runShellNode>[1] {
  return {
    workflowId: 'wf-1',
    projectPath: undefined,
    push: vi.fn(),
    nodeOutputs: new Map(),
    conditionOutputs: new Map(),
    nodeExitCodes: new Map(),
    activeChildProcesses: new Set<ChildProcess>(),
    isStopped: () => false,
    agentRegistry: emptyRegistry(),
  }
}

function makeShellNode(overrides: Partial<ShellNode> = {}): ShellNode {
  return { id: 'n1', type: 'shell', name: 'S', x: 0, y: 0, command: 'echo hi', ...overrides }
}

/** Find the options object passed to the wsl.exe execFile call. */
function wslExecOpts(): Record<string, unknown> | undefined {
  const call = mockExecFile.mock.calls.find((c) => c[0] === 'wsl.exe')
  return call?.[2] as Record<string, unknown> | undefined
}

beforeEach(() => {
  mockSpawn.mockReset()
  mockExecFile.mockReset()
  // Default: every execFile (the shell command + taskkill) succeeds immediately.
  mockExecFile.mockImplementation(
    (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
      if (cmd === 'wsl.exe' && typeof cb === 'function') {
        process.nextTick(() => cb(null, 'output', ''))
      } else if (typeof cb === 'function') {
        cb(null, '', '')
      }
      return { pid: 999, kill: vi.fn() }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runShellNode — output buffering', () => {
  it('requests a maxBuffer well above Node’s 1 MiB default', async () => {
    await runShellNode(makeShellNode(), makeDeps())
    const opts = wslExecOpts()
    expect(opts).toBeDefined()
    expect(typeof opts?.maxBuffer).toBe('number')
    expect(opts?.maxBuffer as number).toBeGreaterThan(1024 * 1024)
  })

  it('coerces a non-numeric error code (maxBuffer overflow) to a numeric exit code', async () => {
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          const err = new Error('stdout maxBuffer length exceeded') as NodeJS.ErrnoException
          err.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
          process.nextTick(() => cb(err, 'x'.repeat(100), ''))
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    const deps = makeDeps()
    await runShellNode(makeShellNode(), deps).catch(() => undefined)
    const code = deps.nodeExitCodes.get('n1')
    expect(typeof code).toBe('number')
    expect(code).not.toBe(0)
  })
})

describe('runShellNode — timeout', () => {
  it('force-kills the WSL process tree (taskkill /F /T) when the command times out', async () => {
    vi.useFakeTimers()
    // wsl.exe hangs (callback never fires); taskkill resolves.
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'taskkill' && typeof cb === 'function') cb(null, '', '')
        return { pid: 4321, kill: vi.fn() }
      },
    )
    const deps = makeDeps()
    const promise = runShellNode(makeShellNode({ timeout: 1000 }), deps)
    const settled = promise.then(
      () => 'resolved',
      () => 'rejected',
    )

    await vi.advanceTimersByTimeAsync(1001)

    const taskkillCalls = mockExecFile.mock.calls.filter((c) => c[0] === 'taskkill')
    expect(taskkillCalls.length).toBeGreaterThanOrEqual(1)
    expect(taskkillCalls[0]?.[1]).toEqual(['/F', '/T', '/PID', '4321'])
    expect(await settled).toBe('rejected')
    expect(deps.activeChildProcesses.size).toBe(0)
  })
})
