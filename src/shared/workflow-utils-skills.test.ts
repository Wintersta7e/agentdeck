import { describe, it, expect } from 'vitest'
import { validateWorkflow } from './workflow-utils'

function makeMinimalWorkflow(nodeOverrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    name: 'Test',
    nodes: [
      {
        id: 'n1',
        type: 'agent',
        name: 'Node 1',
        x: 0,
        y: 0,
        agent: 'codex',
        ...nodeOverrides,
      },
    ],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('validateWorkflow — skillId warnings', () => {
  it('warns when skillId is set on non-codex agent node', () => {
    const wf = makeMinimalWorkflow({ agent: 'claude-code', skillId: 'global:lint-fix' })
    const result = validateWorkflow(wf)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.some((w) => w.includes('skillId') && w.includes('not codex'))).toBe(true)
  })

  it('does not warn when skillId is set on codex agent node', () => {
    const wf = makeMinimalWorkflow({ agent: 'codex', skillId: 'global:lint-fix' })
    const result = validateWorkflow(wf)
    expect(result.warnings.some((w) => w.includes('skillId'))).toBe(false)
  })

  it('does not warn when skillId is undefined', () => {
    const wf = makeMinimalWorkflow({ agent: 'codex' })
    const result = validateWorkflow(wf)
    expect(result.warnings.some((w) => w.includes('skillId'))).toBe(false)
  })

  it('warns when skillId is set on non-agent node type', () => {
    const wf = makeMinimalWorkflow({ type: 'shell', skillId: 'global:foo', command: 'echo hi' })
    const result = validateWorkflow(wf)
    expect(result.warnings.some((w) => w.includes('skillId') && w.includes('not an agent'))).toBe(
      true,
    )
  })
})
