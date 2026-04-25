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

  it('rejects patterns with nested quantifiers (ReDoS heuristic — SEC2-04)', () => {
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

  it('rejects alternation with outer quantifier (SEC3-01)', () => {
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

  it('rejects nested-group ReDoS shapes like ((a+))+ (SEC4-01)', () => {
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
