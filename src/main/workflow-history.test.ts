import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkflowNodeRun } from '../shared/types'
import { makeWorkflow } from '../__test__/helpers'

// ── Mocks ────────────────────────────────────────────────────────────
// saveRun is the disk-persistence side effect of finalize(); we assert
// call count to verify the double-finalization guard.
const { mockSaveRun } = vi.hoisted(() => ({
  mockSaveRun: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./workflow-run-store', () => ({
  saveRun: (...args: unknown[]) => mockSaveRun(...args),
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { getErrorTail, createRunRecorder } = await import('./workflow-history')

beforeEach(() => {
  mockSaveRun.mockClear()
})

// ── getErrorTail ─────────────────────────────────────────────────────

describe('getErrorTail', () => {
  it('strips ANSI escape codes and returns the cleaned lines', () => {
    // \x1b[31m … \x1b[0m wrap each line in red; getErrorTail must drop them.
    const output = '\x1b[31mError: boom\x1b[0m\n\x1b[33mwarning: careful\x1b[0m'
    const tail = getErrorTail(output)
    expect(tail).toEqual(['Error: boom', 'warning: careful'])
  })

  it('returns only the last N non-empty lines (default maxLines = 50)', () => {
    // 60 numbered lines -> only the final 50 survive (11..60).
    const output = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
    const tail = getErrorTail(output)
    expect(tail).toHaveLength(50)
    expect(tail![0]).toBe('line 11')
    expect(tail![tail!.length - 1]).toBe('line 60')
  })

  it('honours an explicit maxLines argument', () => {
    const output = 'a\nb\nc\nd\ne'
    expect(getErrorTail(output, 2)).toEqual(['d', 'e'])
  })

  it('filters out blank and whitespace-only lines, keeping only real content', () => {
    const output = 'first\n\n   \n\t\nlast'
    expect(getErrorTail(output)).toEqual(['first', 'last'])
  })

  it('returns undefined for all-whitespace output', () => {
    expect(getErrorTail('\n  \n\t\n   ')).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(getErrorTail('')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(getErrorTail(undefined)).toBeUndefined()
  })

  it('strips carriage returns (CRLF terminal output)', () => {
    expect(getErrorTail('one\r\ntwo\r\n')).toEqual(['one', 'two'])
  })
})

// ── createRunRecorder / finalize double-finalization guard ───────────

describe('createRunRecorder', () => {
  const node: WorkflowNodeRun = {
    nodeId: 'n1',
    nodeName: 'step 1',
    status: 'done',
    startedAt: 1,
    finishedAt: 2,
    durationMs: 1,
  }

  it('persists the run via saveRun on finalize', () => {
    const recorder = createRunRecorder(makeWorkflow(), '/home/user/proj', { FOO: 'bar' })
    recorder.recordNode(node)
    recorder.finalize('done')
    expect(mockSaveRun).toHaveBeenCalledTimes(1)
    const saved = mockSaveRun.mock.calls[0]![0] as { status: string; nodes: unknown[] }
    expect(saved.status).toBe('done')
    expect(saved.nodes).toHaveLength(1)
  })

  it('guards against double finalization: saveRun fires exactly once across two finalize() calls', () => {
    const recorder = createRunRecorder(makeWorkflow(), undefined, {})
    // Simulates the normal-completion + error-handler race the guard exists for.
    recorder.finalize('done')
    recorder.finalize('error')
    expect(mockSaveRun).toHaveBeenCalledTimes(1)
    // First (and only) call wins — status stays from the first finalize.
    const saved = mockSaveRun.mock.calls[0]![0] as { status: string }
    expect(saved.status).toBe('done')
  })
})
