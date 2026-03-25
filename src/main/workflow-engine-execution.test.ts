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

const { createWorkflowEngine } = await import('./workflow-engine')

// ── Helpers ──────────────────────────────────────────────────────────

const mockPtyManager: PtyManager = {
  spawn: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  killAll: vi.fn(),
}

interface MockChild extends EventEmitter {
  pid: number
  stdin: { end: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function createMockChild(pid = 1234): MockChild {
  const child = new EventEmitter() as MockChild
  child.pid = pid
  child.stdin = { end: vi.fn() }
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
    expect(outputs.some((e) => String(e.message).includes('unknown checkpoint'))).toBe(true)
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

    // Node b's spawn command should include the context from node a
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    const bashCmd = (mockSpawn.mock.calls[1] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('important result')
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

    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('meticulous code reviewer')
    expect(bashCmd).toContain('Review this PR')
    expect(bashCmd).toContain('Markdown checklist')

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

    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).not.toContain('SHOULD NOT APPEAR')
    expect(bashCmd).toContain('Do task')

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
    const bashCmd = (mockSpawn.mock.calls[0] as string[][])[1]?.[3] ?? ''
    expect(bashCmd).toContain('Some task')

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

    // Advance past idle timeout: 11 idle checks (11 * 30s = 330s > 300s)
    for (let i = 0; i < 11; i++) {
      await tick(30_000)
    }

    // forceKillTree should have called execFile('taskkill', ...)
    const taskkillCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkillCalls.length).toBeGreaterThanOrEqual(1)

    const errors = getEvents(sendSpy, 'wf-idle', 'node:error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0]?.message)).toContain('idle')
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(child as any).pid = undefined
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
  it('emits workflow:started on run', async () => {
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    const wf = makeWorkflow({
      id: 'wf-lc1',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', prompt: 'go' })],
    })

    engine.run(wf)
    await tick()

    expect(hasEvent(sendSpy, 'wf-lc1', 'workflow:started')).toBe(true)

    child.emit('close', 0)
    await tick()
  })

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
    expect(outputs.some((e) => String(e.message).includes('hello world'))).toBe(true)
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
