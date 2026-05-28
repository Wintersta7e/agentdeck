import { describe, it, expect } from 'vitest'
import { validateWorkflow } from './workflow-utils'

function makeWorkflow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'wf-test',
    name: 'Test',
    nodes: [
      { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
      { id: 'cond', type: 'condition', name: 'C', conditionMode: 'outputMatch' },
    ],
    edges: [{ id: 'e1', fromNodeId: 'src', toNodeId: 'cond' }],
    ...overrides,
  }
}

describe('validateWorkflow — outputMatch condition', () => {
  it('rejects empty conditionPattern', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        { id: 'cond', type: 'condition', name: 'C', conditionMode: 'outputMatch' },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /non-empty conditionPattern/.test(e))).toBe(true)
  })

  it('rejects patterns exceeding 500 chars', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: 'a'.repeat(600),
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /too long/.test(e))).toBe(true)
  })

  it('rejects patterns with nested quantifiers (ReDoS heuristic)', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: '(a+)+$',
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /ReDoS/.test(e))).toBe(true)
  })

  it('rejects alternation with outer quantifier', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: '(error|warn|info)+$',
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /ReDoS/.test(e))).toBe(true)
  })

  it('rejects nested-group ReDoS shapes like ((a+))+', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: '((a+))+',
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /ReDoS/.test(e))).toBe(true)
  })

  it('accepts simple, well-formed patterns', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: '^ok:.+$',
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.filter((e) => /conditionPattern|ReDoS|too long/.test(e))).toHaveLength(0)
  })

  it('accepts alternation with `?` (BUG5-01) — zero-or-one is not catastrophic', () => {
    const wf = makeWorkflow({
      nodes: [
        { id: 'src', type: 'agent', name: 'Src', agent: 'claude-code' },
        {
          id: 'cond',
          type: 'condition',
          name: 'C',
          conditionMode: 'outputMatch',
          conditionPattern: '^(passed|succeeded)?:',
        },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.filter((e) => /ReDoS/.test(e))).toHaveLength(0)
  })
})

describe('validateWorkflow — branch fan-out warning', () => {
  it('does not warn when a condition false-branch has a loop edge plus a normal escape edge', () => {
    const wf = {
      id: 'w',
      name: 'w',
      createdAt: 0,
      updatedAt: 0,
      nodes: [
        { id: 'C', name: 'C', type: 'condition', x: 0, y: 0, conditionMode: 'exitCode' },
        { id: 'L', name: 'L', type: 'agent', x: 0, y: 0 },
        { id: 'E', name: 'E', type: 'checkpoint', x: 0, y: 0 },
        { id: 'T', name: 'T', type: 'agent', x: 0, y: 0 },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'C', toNodeId: 'T', branch: 'true' },
        {
          id: 'e2',
          fromNodeId: 'C',
          toNodeId: 'L',
          branch: 'false',
          edgeType: 'loop',
          maxIterations: 3,
        },
        { id: 'e3', fromNodeId: 'C', toNodeId: 'E', branch: 'false' },
      ],
    }
    const result = validateWorkflow(wf)
    expect(result.warnings.some((w) => /edges with branch/i.test(w))).toBe(false)
  })

  it('still warns when a condition has two NORMAL edges on the same branch', () => {
    const wf = {
      id: 'w',
      name: 'w',
      createdAt: 0,
      updatedAt: 0,
      nodes: [
        { id: 'C', name: 'C', type: 'condition', x: 0, y: 0, conditionMode: 'exitCode' },
        { id: 'A', name: 'A', type: 'agent', x: 0, y: 0 },
        { id: 'B', name: 'B', type: 'agent', x: 0, y: 0 },
      ],
      edges: [
        { id: 'e1', fromNodeId: 'C', toNodeId: 'A', branch: 'false' },
        { id: 'e2', fromNodeId: 'C', toNodeId: 'B', branch: 'false' },
      ],
    }
    const result = validateWorkflow(wf)
    expect(result.warnings.some((w) => /edges with branch/i.test(w))).toBe(true)
  })
})

describe('validateWorkflow — loop edge uniqueness', () => {
  it('flags two loop edges from the same condition on the same branch', () => {
    const wf = {
      id: 'w',
      name: 'w',
      createdAt: 0,
      updatedAt: 0,
      nodes: [
        { id: 'C', name: 'C', type: 'condition', x: 0, y: 0 },
        { id: 'A', name: 'A', type: 'agent', x: 0, y: 0 },
        { id: 'B', name: 'B', type: 'agent', x: 0, y: 0 },
      ],
      edges: [
        {
          id: 'e1',
          fromNodeId: 'C',
          toNodeId: 'A',
          branch: 'false',
          edgeType: 'loop',
          maxIterations: 3,
        },
        {
          id: 'e2',
          fromNodeId: 'C',
          toNodeId: 'B',
          branch: 'false',
          edgeType: 'loop',
          maxIterations: 3,
        },
      ],
    }
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => /one loop edge per/i.test(e))).toBe(true)
  })
})
