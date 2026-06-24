/**
 * Custom-agent behaviour in runAgentNode:
 *  - the agent binary is shell-quoted before it reaches a `bash -lic` command
 *    line (injection regression on resolveAgentPathPrefix);
 *  - a custom id resolves its binary from the registry and runs with NO --print;
 *  - an id absent from the registry throws.
 *
 * runAgentNode is driven directly with a hand-built NodeRunnerDeps + a fake
 * AgentRegistry so we can assert on the exact bash command and registry calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import type { AgentNode, Role } from '../shared/types'
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

const { runAgentNode, invalidateAgentPathCache } = await import('./node-runners')

interface MockChild extends EventEmitter {
  pid: number | undefined
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild
  child.pid = 1234
  child.stdin = { write: vi.fn(), end: vi.fn() }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

/** A registry stub that reports `id` as a custom agent with `binary`/`args`/`env`. */
function customRegistry(
  id: string,
  binary: string,
  args: string[] = [],
  env: Record<string, string> = {},
): AgentRegistry {
  return {
    has: (q: string) => q === id,
    isCustom: (q: string) => q === id,
    binaryFor: (q: string) => (q === id ? binary : undefined),
    argsFor: (q: string) => (q === id ? args : []),
    envFor: (q: string) => (q === id ? env : {}),
  } as unknown as AgentRegistry
}

/** A registry stub that knows nothing. */
function emptyRegistry(): AgentRegistry {
  return {
    has: () => false,
    isCustom: () => false,
    binaryFor: () => undefined,
    argsFor: () => [],
    envFor: () => ({}),
  } as unknown as AgentRegistry
}

function makeDeps(
  registry: AgentRegistry,
  projectPath?: string,
): Parameters<typeof runAgentNode>[3] {
  return {
    workflowId: 'wf-1',
    projectPath,
    push: vi.fn(),
    nodeOutputs: new Map(),
    conditionOutputs: new Map(),
    nodeExitCodes: new Map(),
    activeChildProcesses: new Set<ChildProcess>(),
    isStopped: () => false,
    agentRegistry: registry,
  }
}

function makeAgentNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return { id: 'n1', type: 'agent', name: 'N', x: 0, y: 0, prompt: 'do it', ...overrides }
}

/** Wait until the child has spawned, then emit its close — runAgentNode awaits
 *  PATH resolution before spawning, so we can't emit synchronously. */
async function spawnThenClose(child: MockChild, code = 0): Promise<void> {
  for (let i = 0; i < 50 && mockSpawn.mock.calls.length === 0; i++) {
    await Promise.resolve()
  }
  child.emit('close', code)
}

const emptyRoles = new Map<string, Role>()

beforeEach(() => {
  invalidateAgentPathCache()
  mockSpawn.mockReset()
  mockExecFile.mockReset()
  // Default: command -v / taskkill return nothing.
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
      if (typeof cb === 'function') cb(null, '', '')
      return { pid: 999, kill: vi.fn() }
    },
  )
})

describe('runAgentNode — custom agents', () => {
  it('throws for an id absent from the registry', async () => {
    const deps = makeDeps(emptyRegistry())
    await expect(
      runAgentNode(makeAgentNode({ agent: 'ghost' }), '', emptyRoles, deps),
    ).rejects.toThrow(/Unknown agent: ghost/)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('resolves a custom binary from the registry and runs with NO --print', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const deps = makeDeps(customRegistry('my-agent', 'my-agent-bin', ['chat']), '/home/u/proj')

    const promise = runAgentNode(makeAgentNode({ agent: 'my-agent' }), '', emptyRoles, deps)
    await spawnThenClose(child)
    await promise

    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    // Custom binary launched (shell-quoted) with its default args, no --print.
    expect(bashCmd).toContain("'my-agent-bin' 'chat'")
    expect(bashCmd).not.toContain('--print')
    // No native --cd flag for a custom agent → falls through to shell cd.
    expect(bashCmd).toContain("cd '/home/u/proj'")
  })

  it("passes a custom agent's env to the child's env option, not the command string", async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const deps = makeDeps(
      customRegistry('my-agent', 'my-agent-bin', [], { OLLAMA_HOST: '127.0.0.1:11434' }),
      '/home/u/proj',
    )

    const promise = runAgentNode(makeAgentNode({ agent: 'my-agent' }), '', emptyRoles, deps)
    await spawnThenClose(child)
    await promise

    const spawnCall = mockSpawn.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }]
    // env reaches the child via the spawn options...
    expect(spawnCall[2]?.env?.['OLLAMA_HOST']).toBe('127.0.0.1:11434')
    // ...and the base process env is still inherited (nvm/PATH preserved).
    expect(spawnCall[2]?.env).toMatchObject(process.env)
    // ...but is NEVER serialized into the bash command string.
    const bashCmd = spawnCall[1]?.[3] ?? ''
    expect(bashCmd).not.toContain('OLLAMA_HOST')
    expect(bashCmd).not.toContain('127.0.0.1:11434')
  })

  it('drops BLOCKED_ENV_KEYS from a custom agent env before spawning', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const deps = makeDeps(
      customRegistry('my-agent', 'my-agent-bin', [], { LD_PRELOAD: '/evil.so', SAFE: 'ok' }),
    )

    const promise = runAgentNode(makeAgentNode({ agent: 'my-agent' }), '', emptyRoles, deps)
    await spawnThenClose(child)
    await promise

    const env = (mockSpawn.mock.calls[0] as [string, string[], { env?: NodeJS.ProcessEnv }])[2]?.env
    expect(env?.['LD_PRELOAD']).toBeUndefined()
    expect(env?.['SAFE']).toBe('ok')
  })

  it('shell-quotes the binary in the command -v PATH-resolution probe (injection regression)', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    // A binary carrying shell metacharacters must never reach `bash -lic` raw.
    const evil = 'evil; touch /tmp/pwned'
    const deps = makeDeps(customRegistry('x', evil))

    const promise = runAgentNode(makeAgentNode({ agent: 'x' }), '', emptyRoles, deps)
    await spawnThenClose(child)
    await promise

    // The `command -v <bin>` probe runs under `bash -lic`; find that call.
    const probe = mockExecFile.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('-lic'),
    )
    expect(probe).toBeDefined()
    const probeCmd = (probe?.[1] as string[]).at(-1) ?? ''
    // Quoted form present; raw injection absent.
    expect(probeCmd).toContain("command -v 'evil; touch /tmp/pwned'")
    expect(probeCmd).not.toContain('command -v evil; touch')
  })
})
