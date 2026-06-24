import { describe, it, expect } from 'vitest'
import { validateWorkflow } from './workflow-utils'

function makeWorkflowWithAgent(agent: string): unknown {
  return {
    id: 'wf-1',
    name: 'Test',
    nodes: [{ id: 'n1', type: 'agent', name: 'Node 1', x: 0, y: 0, agent }],
    edges: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('validateWorkflow — custom agent id set', () => {
  it('accepts a custom agent id when it is in the supplied knownAgentIds set', () => {
    const ids = new Set<string>(['claude-code', 'codex', 'my-agent'])
    const result = validateWorkflow(makeWorkflowWithAgent('my-agent'), ids)
    expect(result.errors.filter((e) => e.includes('Unknown agent'))).toHaveLength(0)
  })

  it('errors on an id absent from the supplied set', () => {
    const ids = new Set<string>(['claude-code', 'codex'])
    const result = validateWorkflow(makeWorkflowWithAgent('my-agent'), ids)
    expect(result.errors).toContainEqual(expect.stringContaining('Unknown agent: my-agent'))
  })

  it('errors on a custom id when no set is supplied (builtin-only default)', () => {
    const result = validateWorkflow(makeWorkflowWithAgent('my-agent'))
    expect(result.errors).toContainEqual(expect.stringContaining('Unknown agent: my-agent'))
  })

  it('single-arg call still accepts a builtin agent (back-compat)', () => {
    const result = validateWorkflow(makeWorkflowWithAgent('codex'))
    expect(result.errors.filter((e) => e.includes('Unknown agent'))).toHaveLength(0)
  })

  it('a custom agent with a skillId degrades gracefully (no crash, no error)', () => {
    // The skill-support check is builtin-keyed: AGENT_SUPPORTS_SKILLS_MAP[custom]
    // is undefined → falsy, so the validator simply emits the standard
    // "does not declare supportsSkills" warning rather than crashing.
    const ids = new Set<string>(['claude-code', 'codex', 'my-agent'])
    const wf = {
      id: 'wf-2',
      name: 'Test',
      nodes: [
        {
          id: 'n1',
          type: 'agent',
          name: 'N',
          x: 0,
          y: 0,
          agent: 'my-agent',
          skillId: 'global:foo',
        },
      ],
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    }
    const result = validateWorkflow(wf, ids)
    expect(result.errors.filter((e) => e.includes('Unknown agent'))).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})
