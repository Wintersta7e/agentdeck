/**
 * Workflow engine EXECUTION tests — covers the runtime behavior of
 * createWorkflowEngine: checkpoint pause/resume, concurrency, role injection,
 * error handling, and lifecycle events.
 *
 * Utility function tests (stripAnsi, shellQuote, topoSort, validateWorkflow)
 * live in workflow-engine.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { WorkflowEngine } from './workflow-engine'
import type { PtyManager } from './pty-manager'
import type { Role } from '../shared/types'
import {
  makeWorkflow,
  makeWorkflowNode,
  makeWorkflowEdge,
  makeRole,
  resetCounter,
} from '../__test__/helpers'
import { _resetAgentPathCache } from './node-runners'

// ── Mocks ────────────────────────────────────────────────────────────

const { mockSpawn, mockExecFile } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFile: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('./workflow-run-store', () => ({
  saveRun: vi.fn().mockResolvedValue(undefined),
}))

const { createWorkflowEngine, AGENT_IDLE_TIMEOUT } = await import('./workflow-engine')

// ── Helpers ──────────────────────────────────────────────────────────

const mockPtyManager: PtyManager = {
  spawn: vi.fn(),
  write: vi.fn(),
  hasSession: vi.fn(() => true),
  resize: vi.fn(),
  kill: vi.fn(),
  killAll: vi.fn(),
}

interface MockChild extends EventEmitter {
  pid: number | undefined
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function createMockChild(pid = 1234): MockChild {
  const child = new EventEmitter() as MockChild
  child.pid = pid
  child.stdin = { write: vi.fn(), end: vi.fn() }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

/** Collect events emitted via webContents.send for a given workflow. */
function getEvents(
  spy: ReturnType<typeof vi.fn>,
  workflowId: string,
  type?: string,
): Array<Record<string, unknown>> {
  return spy.mock.calls
    .filter(
      (call) =>
        call[0] === `workflow:event:${workflowId}` &&
        (!type || (call[1] as Record<string, unknown>).type === type),
    )
    .map((call) => call[1] as Record<string, unknown>)
}

function hasEvent(spy: ReturnType<typeof vi.fn>, wfId: string, type: string): boolean {
  return getEvents(spy, wfId, type).length > 0
}

/** Flush microtasks so async workflow code progresses. */
async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

/** The prompt an agent node sent to its child over stdin (first write call). */
function promptSentToStdin(child: MockChild | undefined): string {
  return String(child?.stdin.write.mock.calls[0]?.[0] ?? '')
}

// ── Setup ────────────────────────────────────────────────────────────

let engine: WorkflowEngine
let sendSpy: ReturnType<typeof vi.fn>

function createMockWindow(): {
  webContents: { send: ReturnType<typeof vi.fn> }
  isDestroyed: () => boolean
} {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
  }
}

function buildEngine(roles?: Role[]): void {
  const win = createMockWindow()
  sendSpy = win.webContents.send
  const getRoles = roles ? () => roles : undefined
  engine = createWorkflowEngine(mockPtyManager, win as never, getRoles)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetCounter()
  _resetAgentPathCache()
  mockSpawn.mockReset()
  mockExecFile.mockReset()
  // Default: taskkill calls succeed immediately
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
      if (typeof cb === 'function') cb(null, '', '')
      return { pid: 999, kill: vi.fn() }
    },
  )
  buildEngine()
})

afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════
// T2: Checkpoint pause / resume
// ═══════════════════════════════════════════════════════════════════════

describe('checkpoint pause/resume', () => {
  it('pauses at checkpoint and resumes when engine.resume() is called', async () => {
    const wf = makeWorkflow({
      id: 'wf-cp1',
      nodes: [makeWorkflowNode({ id: 'cp', type: 'checkpoint', message: 'Continue?' })],
    })

    engine.run(wf)
    await tick()

    expect(hasEvent(sendSpy, 'wf-cp1', 'node:paused')).toBe(true)
    expect(hasEvent(sendSpy, 'wf-cp1', 'workflow:done')).toBe(false)

    engine.resume('wf-cp1', 'cp')
    await tick()

    expect(hasEvent(sendSpy, 'wf-cp1', 'node:resumed')).toBe(true)
    expect(hasEvent(sendSpy, 'wf-cp1', 'workflow:done')).toBe(true)
  })

  it('emits warning when resuming unknown nodeId', async () => {
    const wf = makeWorkflow({
      id: 'wf-cp2',
      nodes: [makeWorkflowNode({ id: 'cp', type: 'checkpoint', message: 'Wait' })],
    })

    engine.run(wf)
    await tick()

    engine.resume('wf-cp2', 'nonexistent')
    await tick()

    const outputs = getEvents(sendSpy, 'wf-cp2', 'node:output')
    // COV-12: Use toContainEqual for actionable failure messages
    expect(outputs).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('unknown checkpoint') }),
    )
  })

  it('handles multiple sequential checkpoints', async () => {
    const wf = makeWorkflow({
      id: 'wf-cp3',
      nodes: [
        makeWorkflowNode({ id: 'cp1', type: 'checkpoint', message: 'First' }),
        makeWorkflowNode({ id: 'cp2', type: 'checkpoint', message: 'Second' }),
      ],
      edges: [makeWorkflowEdge('cp1', 'cp2')],
    })

    engine.run(wf)
    await tick()
    expect(hasEvent(sendSpy, 'wf-cp3', 'node:paused')).toBe(true)

    engine.resume('wf-cp3', 'cp1')
    await tick()

    // Second checkpoint should now be paused
    const paused = getEvents(sendSpy, 'wf-cp3', 'node:paused')
    expect(paused).toHaveLength(2)

    engine.resume('wf-cp3', 'cp2')
    await tick()

    expect(hasEvent(sendSpy, 'wf-cp3', 'workflow:done')).toBe(true)
  })

  it('resolves checkpoint immediately when workflow is stopped', async () => {
    const wf = makeWorkflow({
      id: 'wf-cp4',
      nodes: [makeWorkflowNode({ id: 'cp', type: 'checkpoint', message: 'Wait' })],
    })

    engine.run(wf)
    await tick()

    expect(hasEvent(sendSpy, 'wf-cp4', 'node:paused')).toBe(true)

    engine.stop('wf-cp4')
    await tick()

    expect(hasEvent(sendSpy, 'wf-cp4', 'workflow:stopped')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// T3: Concurrent execution
// ═══════════════════════════════════════════════════════════════════════

describe('concurrent execution', () => {
  it('runs parallel nodes in the same tier concurrently', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(2000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-par',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent', prompt: 'task A' }),
        makeWorkflowNode({ id: 'b', type: 'agent', prompt: 'task B' }),
        makeWorkflowNode({ id: 'c', type: 'agent', prompt: 'task C' }),
      ],
    })

    engine.run(wf)
    await tick()

    // All 3 nodes should have spawned (parallel tier, under MAX_TIER_CONCURRENCY)
    expect(mockSpawn).toHaveBeenCalledTimes(3)

    // Complete all children
    for (const child of children) child.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-par', 'workflow:done')).toBe(true)
  })

  it('limits concurrent spawns to MAX_TIER_CONCURRENCY (5)', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(3000 + children.length)
      children.push(child)
      return child
    })

    // 6 parallel agent nodes — should only spawn 5 initially
    const nodes = Array.from({ length: 6 }, (_, i) =>
      makeWorkflowNode({ id: `n${i}`, type: 'agent', prompt: `task ${i}` }),
    )
    const wf = makeWorkflow({ id: 'wf-conc', nodes })

    engine.run(wf)
    await tick()

    // MAX_TIER_CONCURRENCY = 5 (defined in workflow-engine.ts)
    expect(mockSpawn).toHaveBeenCalledTimes(5)

    // Close the first child — the 6th node should now spawn
    const first = children[0]
    expect(first).toBeDefined()
    first?.emit('close', 0)
    await tick()

    expect(mockSpawn).toHaveBeenCalledTimes(6)

    // Close remaining
    for (let i = 1; i < children.length; i++) children[i]?.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-conc', 'workflow:done')).toBe(true)
  })

  it('executes tiers sequentially', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(4000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-seq',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent', prompt: 'first' }),
        makeWorkflowNode({ id: 'b', type: 'agent', prompt: 'second' }),
      ],
      edges: [makeWorkflowEdge('a', 'b')],
    })

    engine.run(wf)
    await tick()

    // Only tier 1 (node a) should have spawned
    expect(mockSpawn).toHaveBeenCalledTimes(1)

    children[0]?.stdout.emit('data', Buffer.from('tier1 output\n'))
    children[0]?.emit('close', 0)
    await tick()

    // Now tier 2 (node b) should have spawned
    expect(mockSpawn).toHaveBeenCalledTimes(2)

    children[1]?.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-seq', 'workflow:done')).toBe(true)
  })

  it('passes context summary from previous tier to next tier', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(5000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-ctx',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent', prompt: 'generate data' }),
        makeWorkflowNode({ id: 'b', type: 'agent', prompt: 'process data' }),
      ],
      edges: [makeWorkflowEdge('a', 'b')],
    })

    engine.run(wf)
    await tick()

    // Node a produces output
    children[0]?.stdout.emit('data', Buffer.from('important result\n'))
    children[0]?.emit('close', 0)
    await tick()

    // Node b should receive node a's output as context, delivered via stdin
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(promptSentToStdin(children[1])).toContain('important result')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// T4: Role persona injection
// ═══════════════════════════════════════════════════════════════════════

describe('role persona injection', () => {
  it('prepends role persona and appends outputFormat to prompt', async () => {
    const role = makeRole({
      id: 'role-rev',
      name: 'Reviewer',
      persona: 'You are a meticulous code reviewer.',
      outputFormat: 'Markdown checklist',
    })
    buildEngine([role])

    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-role1',
      nodes: [
        makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'Review this PR', roleId: 'role-rev' }),
      ],
    })

    engine.run(wf)
    await tick()

    const sent = promptSentToStdin(child)
    expect(sent).toContain('meticulous code reviewer')
    expect(sent).toContain('Review this PR')
    expect(sent).toContain('Markdown checklist')

    child.emit('close', 0)
    await tick()
  })

  it('omits persona when node has no roleId', async () => {
    const role = makeRole({ id: 'role-unused', persona: 'SHOULD NOT APPEAR' })
    buildEngine([role])

    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-role2',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'Do task' })],
    })

    engine.run(wf)
    await tick()

    const sent = promptSentToStdin(child)
    expect(sent).not.toContain('SHOULD NOT APPEAR')
    expect(sent).toContain('Do task')

    child.emit('close', 0)
    await tick()
  })

  it('handles missing role gracefully (orphan roleId)', async () => {
    buildEngine([]) // no roles

    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-role3',
      nodes: [
        makeWorkflowNode({
          id: 'n1',
          type: 'agent',
          prompt: 'Some task',
          roleId: 'nonexistent-role',
        }),
      ],
    })

    engine.run(wf)
    await tick()

    // Should still spawn — just without persona
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(promptSentToStdin(child)).toContain('Some task')

    child.emit('close', 0)
    await tick()
  })

  it('runs a claude agent in the project dir via cd, never a --directory flag', async () => {
    // Regression: claude-code has no --directory option (it operates on the cwd),
    // so the runner must cd into the project, not pass an invalid flag.
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-claude-cd',
      nodes: [
        makeWorkflowNode({ id: 'n1', type: 'agent', agent: 'claude-code', prompt: 'Do task' }),
      ],
    })

    engine.run(wf, '/home/user/proj')
    await tick()

    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('cd ')
    expect(bashCmd).toContain('/home/user/proj')
    expect(bashCmd).toContain('--print')
    expect(bashCmd).not.toContain('--directory')

    child.emit('close', 0)
    await tick()
  })

  it('a read claude node adds no permission flag (default mode)', async () => {
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const wf = makeWorkflow({
      id: 'wf-perm-read',
      nodes: [
        makeWorkflowNode({
          id: 'a',
          type: 'agent',
          agent: 'claude-code',
          prompt: 'p',
          permission: 'read',
        }),
      ],
    })
    engine.run(wf, '/home/user/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).not.toContain('--permission-mode')
    child.emit('close', 0)
    await tick()
  })

  it('injects an edit codex node permission flag (--sandbox workspace-write)', async () => {
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const wf = makeWorkflow({
      id: 'wf-perm-edit',
      nodes: [
        makeWorkflowNode({
          id: 'a',
          type: 'agent',
          agent: 'codex',
          prompt: 'p',
          permission: 'edit',
        }),
      ],
    })
    engine.run(wf, '/home/user/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('--sandbox workspace-write')
    child.emit('close', 0)
    await tick()
  })

  it('codex agent nodes run with hooks disabled (--disable hooks)', async () => {
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const wf = makeWorkflow({
      id: 'wf-codex-hooks',
      nodes: [makeWorkflowNode({ id: 'a', type: 'agent', agent: 'codex', prompt: 'p' })],
    })
    engine.run(wf, '/home/user/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('--disable hooks')
    child.emit('close', 0)
    await tick()
  })

  it('delivers the agent prompt over stdin, never on the command line', async () => {
    // The prompt can carry arbitrary shell-hostile text (apostrophes, parens,
    // semicolons). It must NOT appear on the `bash -lc` command line — neither
    // shell-quoting nor base64 survives the Windows -> wsl.exe -> Linux argv
    // transport, so bash would parse/execute the prompt's tokens (exit 2/127).
    // It is delivered over stdin instead, which is a raw byte stream.
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const prompt = "It's a Ren'Py analyzer; flow.py: _find_bridge_worker(self) -> list"
    const wf = makeWorkflow({
      id: 'wf-prompt-injection',
      nodes: [makeWorkflowNode({ id: 'a', type: 'agent', agent: 'codex', prompt })],
    })
    engine.run(wf, '/home/user/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    // Prompt content must not be on the command line where bash would parse it.
    expect(bashCmd).not.toContain('_find_bridge_worker')
    expect(bashCmd).not.toContain("Ren'Py")
    // It is written to the child's stdin verbatim.
    expect(child.stdin.write).toHaveBeenCalledWith(prompt)
    child.emit('close', 0)
    await tick()
  })

  it('prepends the interactively-resolved agent + node bin dir to PATH', async () => {
    // The runner uses non-interactive `bash -lc` (no ~/.bashrc), so nvm-installed
    // CLIs are off PATH. runAgentNode preflight-resolves the agent + node dirs via
    // `bash -lic command -v` and injects the literal dirs into the command's PATH.
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && Array.isArray(args) && args.includes('-lic')) {
          cb?.(
            null,
            '/home/u/.nvm/versions/node/v22/bin/codex\n/home/u/.nvm/versions/node/v22/bin/node\n',
            '',
          )
        } else {
          cb?.(null, '', '') // taskkill etc.
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    const wf = makeWorkflow({
      id: 'wf-pathfix',
      nodes: [makeWorkflowNode({ id: 'a', type: 'agent', agent: 'codex', prompt: 'p' })],
    })
    engine.run(wf, '/home/u/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('export PATH="/home/u/.nvm/versions/node/v22/bin:$PATH"')
    child.emit('close', 0)
    await tick()
  })

  it('defaults an unset agent node to read-only permission flags', async () => {
    buildEngine()
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)
    const wf = makeWorkflow({
      id: 'wf-perm-default',
      nodes: [makeWorkflowNode({ id: 'a', type: 'agent', agent: 'codex', prompt: 'p' })],
    })
    engine.run(wf, '/home/user/proj')
    await tick()
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('--sandbox read-only')
    child.emit('close', 0)
    await tick()
  })

  it('resolves immediately when prompt is empty and no role', async () => {
    buildEngine()

    const wf = makeWorkflow({
      id: 'wf-role4',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent' })], // no prompt, no roleId
    })

    engine.run(wf)
    await tick()

    // No spawn — empty prompt early-exits
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(hasEvent(sendSpy, 'wf-role4', 'workflow:done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// T5: Error scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('error scenarios', () => {
  it('emits node:error when agent exits with non-zero code', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-err1',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'fail' })],
    })

    engine.run(wf)
    await tick()

    child.emit('close', 1)
    await tick()

    const errors = getEvents(sendSpy, 'wf-err1', 'node:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('exited with code 1')
  })

  it('emits node:error when agent spawn fails', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-err2',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'fail' })],
    })

    engine.run(wf)
    await tick()

    child.emit('error', new Error('spawn ENOENT'))
    await tick()

    const errors = getEvents(sendSpy, 'wf-err2', 'node:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('spawn ENOENT')
  })

  it('kills agent after idle timeout (no output)', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-idle',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'hang' })],
    })

    engine.run(wf)
    await tick()

    // Advance past idle timeout. Derived from the actual constant so the
    // test follows along if AGENT_IDLE_TIMEOUT changes in workflow-engine.ts.
    const idleCheckMs = 30_000
    const ticksNeeded = Math.ceil(AGENT_IDLE_TIMEOUT / idleCheckMs) + 1
    for (let i = 0; i < ticksNeeded; i++) {
      await tick(idleCheckMs)
    }

    // forceKillTree should have called execFile('taskkill', ...)
    const taskkillCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkillCalls.length).toBeGreaterThanOrEqual(1)

    const errors = getEvents(sendSpy, 'wf-idle', 'node:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('idle')

    // Verify workflow-level terminal event was emitted (stopped due to node failure)
    const workflowStopped = getEvents(sendSpy, 'wf-idle', 'workflow:stopped')
    expect(workflowStopped).toHaveLength(1)
  })

  it('kills agent after absolute timeout (node.timeout)', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-abs',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'slow', timeout: 5000 })],
    })

    engine.run(wf)
    await tick()

    // Keep emitting data so idle timeout doesn't fire first
    child.stdout.emit('data', Buffer.from('working...\n'))
    await tick(3000)
    child.stdout.emit('data', Buffer.from('still working...\n'))
    await tick(3000) // total 6s > 5s timeout

    const errors = getEvents(sendSpy, 'wf-abs', 'node:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('timed out')
  })

  it('emits node:error when shell command fails', async () => {
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          cb(new Error('Command failed'), 'partial output', 'error output')
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )

    const wf = makeWorkflow({
      id: 'wf-shell-err',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'shell', command: 'exit 1' })],
    })

    engine.run(wf)
    await tick()

    const errors = getEvents(sendSpy, 'wf-shell-err', 'node:error')
    expect(errors).toHaveLength(1)
  })

  it('continues workflow when node has continueOnError: true', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(6000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-coe',
      nodes: [
        makeWorkflowNode({
          id: 'a',
          type: 'agent',
          prompt: 'fail but continue',
          continueOnError: true,
        }),
        makeWorkflowNode({ id: 'b', type: 'agent', prompt: 'should run' }),
      ],
      edges: [makeWorkflowEdge('a', 'b')],
    })

    engine.run(wf)
    await tick()

    // Node a fails
    children[0]?.emit('close', 1)
    await tick()

    // Node b should still run
    expect(mockSpawn).toHaveBeenCalledTimes(2)

    children[1]?.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-coe', 'node:error')).toBe(true) // node a error
    expect(hasEvent(sendSpy, 'wf-coe', 'workflow:done')).toBe(true) // workflow completes
  })

  it('stops workflow when node fails without continueOnError', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(7000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-stop-err',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent', prompt: 'fail' }),
        makeWorkflowNode({ id: 'b', type: 'agent', prompt: 'should not run' }),
      ],
      edges: [makeWorkflowEdge('a', 'b')],
    })

    engine.run(wf)
    await tick()

    children[0]?.emit('close', 1)
    await tick()

    // Node b should NOT have spawned
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(hasEvent(sendSpy, 'wf-stop-err', 'workflow:stopped')).toBe(true)
  })

  it('kills active processes and emits workflow:stopped on stop()', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-stop',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'long running' })],
    })

    engine.run(wf)
    await tick()

    expect(engine.isRunning('wf-stop')).toBe(true)

    engine.stop('wf-stop')
    // The close event fires after forceKillTree kills the process
    child.emit('close', null)
    await tick()

    // forceKillTree should have been called
    const taskkillCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkillCalls.length).toBeGreaterThanOrEqual(1)

    expect(hasEvent(sendSpy, 'wf-stop', 'workflow:stopped')).toBe(true)
  })

  it('rejects duplicate workflow run with error event', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-dup',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'task' })],
    })

    engine.run(wf)
    await tick()

    // Second run of same workflow
    engine.run(wf)
    await tick()

    const errors = getEvents(sendSpy, 'wf-dup', 'workflow:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('already running')

    child.emit('close', 0)
    await tick()
  })

  it('falls back to SIGKILL when pid is null in forceKillTree', async () => {
    const child = createMockChild()
    child.pid = undefined
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-nopid',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'task' })],
    })

    engine.run(wf)
    await tick()

    engine.stop('wf-nopid')
    await tick()

    // No taskkill call — should fall back to child.kill('SIGKILL')
    const taskkillCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkillCalls).toHaveLength(0)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle events & output
// ═══════════════════════════════════════════════════════════════════════

describe('lifecycle events', () => {
  it('emits workflow:done on successful completion', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-lc2',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'go' })],
    })

    engine.run(wf)
    await tick()

    child.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-lc2', 'workflow:done')).toBe(true)
    expect(engine.isRunning('wf-lc2')).toBe(false)
  })

  it('emits node:started and node:done for each node', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-lc3',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'go' })],
    })

    engine.run(wf)
    await tick()

    child.emit('close', 0)
    await tick()

    const started = getEvents(sendSpy, 'wf-lc3', 'node:started')
    const done = getEvents(sendSpy, 'wf-lc3', 'node:done')
    expect(started).toHaveLength(1)
    expect(done).toHaveLength(1)
  })

  it('emits node:output events from agent stdout', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-lc4',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'go' })],
    })

    engine.run(wf)
    await tick()

    child.stdout.emit('data', Buffer.from('hello world\n'))
    child.emit('close', 0)
    await tick()

    const outputs = getEvents(sendSpy, 'wf-lc4', 'node:output')
    expect(outputs).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('hello world') }),
    )
  })

  it('runs shell node successfully', async () => {
    // Need a fresh engine since we're overriding mockExecFile
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          // Shell node — invoke callback asynchronously (like real execFile)
          process.nextTick(() => cb(null, 'shell output', ''))
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    buildEngine()

    const wf = makeWorkflow({
      id: 'wf-shell',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'shell', command: 'echo hello' })],
    })

    engine.run(wf)
    await tick(100)

    expect(hasEvent(sendSpy, 'wf-shell', 'node:done')).toBe(true)
    expect(hasEvent(sendSpy, 'wf-shell', 'workflow:done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// WF-10: Condition eval, retry, loop iteration, node:skipped
// ═══════════════════════════════════════════════════════════════════════

describe('condition node with exitCode branching', () => {
  it('executes true branch and skips false branch when shell exits 0', async () => {
    // shell → condition(exitCode) → true branch (agent A) + false branch (agent B)
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          // Shell node succeeds (exit 0)
          process.nextTick(() => cb(null, 'shell output', ''))
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    buildEngine()

    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-cond1',
      nodes: [
        makeWorkflowNode({ id: 'shell1', type: 'shell', command: 'echo ok' }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'exitCode',
        }),
        makeWorkflowNode({ id: 'true-branch', type: 'agent', prompt: 'do true thing' }),
        makeWorkflowNode({ id: 'false-branch', type: 'agent', prompt: 'do false thing' }),
      ],
      edges: [
        makeWorkflowEdge('shell1', 'cond1'),
        makeWorkflowEdge('cond1', 'true-branch', { branch: 'true' }),
        makeWorkflowEdge('cond1', 'false-branch', { branch: 'false' }),
      ],
    })

    engine.run(wf)
    await tick(100) // shell node completes + condition evaluates

    // Condition should resolve to 'true' (exit code 0)
    const condDone = getEvents(sendSpy, 'wf-cond1', 'node:done')
    const condWithBranch = condDone.find((e) => e.branch === 'true')
    expect(condWithBranch).toBeDefined()

    // True branch agent should have been spawned
    expect(mockSpawn).toHaveBeenCalled()

    // Complete the true branch
    child.emit('close', 0)
    await tick()

    // False branch should be skipped
    expect(hasEvent(sendSpy, 'wf-cond1', 'node:skipped')).toBe(true)
    const skipped = getEvents(sendSpy, 'wf-cond1', 'node:skipped')
    expect(skipped).toContainEqual(expect.objectContaining({ nodeId: 'false-branch' }))

    expect(hasEvent(sendSpy, 'wf-cond1', 'workflow:done')).toBe(true)
  })

  it('executes false branch when shell exits non-zero', async () => {
    // shell (fails) → condition(exitCode) → true/false branches
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          // Shell node fails (exit 1)
          const err = new Error('exit 1') as NodeJS.ErrnoException
          err.code = '1'
          process.nextTick(() => cb(err, 'shell output', 'error output'))
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    buildEngine()

    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-cond2',
      nodes: [
        makeWorkflowNode({
          id: 'shell1',
          type: 'shell',
          command: 'exit 1',
          continueOnError: true,
        }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'exitCode',
        }),
        makeWorkflowNode({ id: 'true-branch', type: 'agent', prompt: 'true path' }),
        makeWorkflowNode({ id: 'false-branch', type: 'agent', prompt: 'false path' }),
      ],
      edges: [
        makeWorkflowEdge('shell1', 'cond1'),
        makeWorkflowEdge('cond1', 'true-branch', { branch: 'true' }),
        makeWorkflowEdge('cond1', 'false-branch', { branch: 'false' }),
      ],
    })

    engine.run(wf)
    await tick(100) // shell fails, condition evaluates

    // Condition should resolve to 'false' (exit code != 0)
    const condDone = getEvents(sendSpy, 'wf-cond2', 'node:done')
    const condWithBranch = condDone.find((e) => e.branch === 'false')
    expect(condWithBranch).toBeDefined()

    // False branch agent should have been spawned
    expect(mockSpawn).toHaveBeenCalled()

    // Complete the false branch
    child.emit('close', 0)
    await tick()

    // True branch should be skipped
    const skipped = getEvents(sendSpy, 'wf-cond2', 'node:skipped')
    expect(skipped).toContainEqual(expect.objectContaining({ nodeId: 'true-branch' }))

    expect(hasEvent(sendSpy, 'wf-cond2', 'workflow:done')).toBe(true)
  })
})

describe('retry on failure then success', () => {
  it('emits node:retry and succeeds on second attempt', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(8000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-retry1',
      nodes: [
        makeWorkflowNode({
          id: 'n1',
          type: 'agent',
          prompt: 'flaky task',
          retryCount: 1,
          retryDelayMs: 100,
        }),
      ],
    })

    engine.run(wf)
    await tick()

    // First attempt: fail
    expect(children).toHaveLength(1)
    children[0]?.emit('close', 1)
    await tick(200) // wait past retryDelayMs

    // node:retry event should have been emitted
    expect(hasEvent(sendSpy, 'wf-retry1', 'node:retry')).toBe(true)
    const retryEvents = getEvents(sendSpy, 'wf-retry1', 'node:retry')
    expect(retryEvents).toHaveLength(1)
    expect(retryEvents[0]?.attempt).toBe(2)

    // Second attempt should have spawned
    expect(children).toHaveLength(2)

    // Second attempt: succeed
    children[1]?.emit('close', 0)
    await tick()

    expect(hasEvent(sendSpy, 'wf-retry1', 'node:done')).toBe(true)
    expect(hasEvent(sendSpy, 'wf-retry1', 'workflow:done')).toBe(true)
  })

  it('fails after exhausting all retry attempts', async () => {
    const children: MockChild[] = []
    mockSpawn.mockImplementation(() => {
      const child = createMockChild(9000 + children.length)
      children.push(child)
      return child
    })

    const wf = makeWorkflow({
      id: 'wf-retry2',
      nodes: [
        makeWorkflowNode({
          id: 'n1',
          type: 'agent',
          prompt: 'always fails',
          retryCount: 2,
          retryDelayMs: 100,
        }),
      ],
    })

    engine.run(wf)
    await tick()

    // Attempt 1: fail
    children[0]?.emit('close', 1)
    await tick(200)

    // Attempt 2: fail
    children[1]?.emit('close', 1)
    await tick(200)

    // Attempt 3: fail (maxAttempts = retryCount + 1 = 3)
    children[2]?.emit('close', 1)
    await tick()

    // All retries exhausted — node should error
    expect(hasEvent(sendSpy, 'wf-retry2', 'node:error')).toBe(true)
    expect(hasEvent(sendSpy, 'wf-retry2', 'workflow:stopped')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Loop escape: maxIterations exhaustion routes to the escape checkpoint
// ═══════════════════════════════════════════════════════════════════════

describe('loop escape on maxIterations exhaustion', () => {
  it('exhausted loop routes to the escape checkpoint and logs, not a silent done', async () => {
    // Shell node that always fails (non-zero exit) so the condition always
    // evaluates false, driving the loop until maxIterations is hit.
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          const err = new Error('exit 1') as NodeJS.ErrnoException
          err.code = '1'
          process.nextTick(() => cb(err, '', 'error output'))
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    buildEngine()

    const fail = makeWorkflowNode({
      id: 'F',
      name: 'fail',
      type: 'shell',
      command: 'exit 1',
      continueOnError: true,
    })
    const cond = makeWorkflowNode({
      id: 'C',
      name: 'cond',
      type: 'condition',
      conditionMode: 'exitCode',
    })
    const escape = makeWorkflowNode({
      id: 'E',
      name: 'escape',
      type: 'checkpoint',
      message: 'did not converge',
    })

    const wf = makeWorkflow({
      id: 'wf-loop-escape',
      nodes: [fail, cond, escape],
      edges: [
        makeWorkflowEdge('F', 'C'),
        // Loop edge back to F; maxIterations:2 means the loop fires on
        // iterations 1 and 2, then on iteration 3 the engine exhausts
        // the budget and routes to the escape instead.
        makeWorkflowEdge('C', 'F', { branch: 'false', edgeType: 'loop', maxIterations: 2 }),
        // Non-loop false edge: the escape path
        makeWorkflowEdge('C', 'E', { branch: 'false' }),
      ],
    })

    // Run the engine; give enough async ticks for all three shell executions
    // (iterations 1 & 2 loop, iteration 3 escapes) plus the checkpoint pause.
    engine.run(wf)
    await tick(500)

    // 1. The engine's own loop-exhaustion warning must have fired. Match its
    //    specific "routing to escape" wording rather than "did not converge",
    //    which also appears in the escape checkpoint's user message (so matching
    //    that would pass even if the engine warning regressed).
    const outputs = getEvents(sendSpy, 'wf-loop-escape', 'node:output')
    expect(outputs).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/routing to escape/) }),
    )

    // 2. The escape checkpoint E must have been reached (emits node:paused).
    expect(getEvents(sendSpy, 'wf-loop-escape', 'node:paused').some((e) => e.nodeId === 'E')).toBe(
      true,
    )

    // Clean up: resume the checkpoint so the workflow can finish.
    engine.resume('wf-loop-escape', 'E')
    await tick()
    expect(hasEvent(sendSpy, 'wf-loop-escape', 'workflow:done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Shared escape target fed by two sibling loop conditions
// (mirrors seed-wf-feature-pipeline's escape_build, in-degree 2): the escape
// must fire only on real loop exhaustion, never because a sibling condition
// re-resolves and repeatedly skip-activates the shared edge.
// ═══════════════════════════════════════════════════════════════════════

describe('shared escape target (in-degree > 1)', () => {
  it('fires the shared escape only after the loop exhausts, not when a sibling re-resolves', async () => {
    // build(ok) -> condA(exitCode→true every pass) -> mid(fail) -> condB(false→loop)
    // condA.false -> build (loop) AND condA.false -> escape (shared, normal)
    // condB.false -> build (loop) AND condB.false -> escape (shared, normal)
    // condA re-resolves true each iteration (it is inside condB's reset subgraph),
    // repeatedly skip-activating the shared escape's edge. The escape must NOT
    // fire until condB exhausts maxIterations (which emits "did not converge").
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], _opts: unknown, cb?: (...a: unknown[]) => void) => {
        if (cmd === 'wsl.exe' && typeof cb === 'function') {
          if (JSON.stringify(args).includes('MIDFAIL')) {
            const err = new Error('exit 1') as NodeJS.ErrnoException
            err.code = '1'
            process.nextTick(() => cb(err, 'mid output', 'err'))
          } else {
            process.nextTick(() => cb(null, 'build output', ''))
          }
        } else if (typeof cb === 'function') {
          cb(null, '', '')
        }
        return { pid: 999, kill: vi.fn() }
      },
    )
    buildEngine()

    const wf = makeWorkflow({
      id: 'wf-shared-escape',
      nodes: [
        makeWorkflowNode({
          id: 'build',
          type: 'shell',
          command: 'echo BUILDOK',
          continueOnError: true,
        }),
        makeWorkflowNode({ id: 'condA', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({
          id: 'mid',
          type: 'shell',
          command: 'echo MIDFAIL; exit 1',
          continueOnError: true,
        }),
        makeWorkflowNode({ id: 'condB', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({ id: 'ship', type: 'checkpoint', message: 'ship' }),
        makeWorkflowNode({ id: 'escape', type: 'checkpoint', message: 'shared escape' }),
      ],
      edges: [
        makeWorkflowEdge('build', 'condA'),
        makeWorkflowEdge('condA', 'mid', { branch: 'true' }),
        makeWorkflowEdge('condA', 'build', { branch: 'false', edgeType: 'loop', maxIterations: 4 }),
        makeWorkflowEdge('condA', 'escape', { branch: 'false' }),
        makeWorkflowEdge('mid', 'condB'),
        makeWorkflowEdge('condB', 'ship', { branch: 'true' }),
        makeWorkflowEdge('condB', 'build', { branch: 'false', edgeType: 'loop', maxIterations: 4 }),
        makeWorkflowEdge('condB', 'escape', { branch: 'false' }),
      ],
    })

    engine.run(wf)
    await tick(3000)

    // Events are captured in chronological order. The convergence-failure
    // warning (emitted only at maxIterations exhaustion) must precede the
    // escape checkpoint pausing. Before the fix, the escape fired after ~2
    // iterations with no warning at all.
    const events = getEvents(sendSpy, 'wf-shared-escape')
    const firstWarn = events.findIndex(
      (e) => e.type === 'node:output' && /did not converge/.test(String(e.message)),
    )
    const firstEscape = events.findIndex((e) => e.type === 'node:paused' && e.nodeId === 'escape')
    expect(firstEscape, 'escape checkpoint should be reached on exhaustion').toBeGreaterThanOrEqual(
      0,
    )
    expect(firstWarn, 'a convergence-failure warning should be logged').toBeGreaterThanOrEqual(0)
    expect(firstWarn, 'escape must not fire before the loop exhausts').toBeLessThan(firstEscape)
  })
})
