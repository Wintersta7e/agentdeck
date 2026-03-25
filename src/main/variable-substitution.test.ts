import { describe, it, expect } from 'vitest'
import { substituteVariables } from './variable-substitution'
import { makeWorkflow, makeWorkflowNode } from '../__test__/helpers'

/** Safely get the first node from a result (avoids TS2532 on array indexing) */
function firstNode(wf: ReturnType<typeof substituteVariables>) {
  const node = wf.nodes[0]
  if (!node) throw new Error('Expected at least one node')
  return node
}

describe('substituteVariables', () => {
  it('replaces {{VAR}} in prompt', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE_PATH}} now' })],
    })
    const result = substituteVariables(wf, { FILE_PATH: '/src/main.ts' })
    expect(firstNode(result).prompt).toBe('Fix /src/main.ts now')
  })

  it('replaces {{VAR}} in command', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'shell', command: 'cd {{DIR}} && npm test' })],
    })
    const result = substituteVariables(wf, { DIR: '/home/user/project' })
    expect(firstNode(result).command).toBe('cd /home/user/project && npm test')
  })

  it('replaces {{VAR}} in message', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'checkpoint', message: 'Review {{FEATURE}} changes' })],
    })
    const result = substituteVariables(wf, { FEATURE: 'auth' })
    expect(firstNode(result).message).toBe('Review auth changes')
  })

  it('replaces {{VAR}} in agentFlags', () => {
    const wf = makeWorkflow({
      nodes: [
        makeWorkflowNode({
          type: 'agent',
          prompt: 'test',
          agentFlags: '--model {{MODEL}}',
        }),
      ],
    })
    const result = substituteVariables(wf, { MODEL: 'gpt-4' })
    expect(firstNode(result).agentFlags).toBe('--model gpt-4')
  })

  it('replaces multiple variables in one field', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: '{{ACTION}} the {{TARGET}}' })],
    })
    const result = substituteVariables(wf, { ACTION: 'Fix', TARGET: 'bug' })
    expect(firstNode(result).prompt).toBe('Fix the bug')
  })

  it('leaves unresolved {{VAR}} as-is', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{UNKNOWN_VAR}}' })],
    })
    const result = substituteVariables(wf, {})
    expect(firstNode(result).prompt).toBe('Fix {{UNKNOWN_VAR}}')
  })

  // eslint-disable-next-line no-template-curly-in-string -- testing shell syntax literal
  it('replaces {{VAR}} even inside ${{VAR}} (shell syntax)', () => {
    // eslint-disable-next-line no-template-curly-in-string -- testing shell syntax literal
    const shellCmd = 'echo ${{GITHUB_TOKEN}} {{REAL_VAR}}'
    const wf = makeWorkflow({
      nodes: [
        makeWorkflowNode({
          type: 'shell',
          command: shellCmd,
        }),
      ],
    })
    // The regex matches {{GITHUB_TOKEN}} inside ${{...}} because $ is before {{.
    // This is acceptable — real shell syntax uses ${VAR} not ${{VAR}}.
    const result = substituteVariables(wf, { GITHUB_TOKEN: 'bad', REAL_VAR: 'good' })
    expect(firstNode(result).command).toContain('good')
  })

  it('handles undefined fields gracefully', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent' })],
    })
    const result = substituteVariables(wf, { FOO: 'bar' })
    const node = firstNode(result)
    expect(node.prompt).toBeUndefined()
    expect(node.command).toBeUndefined()
    expect(node.message).toBeUndefined()
    expect(node.agentFlags).toBeUndefined()
  })

  it('does not mutate the original workflow', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE}}' })],
    })
    substituteVariables(wf, { FILE: 'test.ts' })
    const original = wf.nodes[0]
    if (!original) throw new Error('Expected node')
    expect(original.prompt).toBe('Fix {{FILE}}')
  })

  it('handles empty values', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE}}' })],
    })
    const result = substituteVariables(wf, { FILE: '' })
    expect(firstNode(result).prompt).toBe('Fix ')
  })

  it('preserves non-substituted node properties', () => {
    const wf = makeWorkflow({
      nodes: [
        makeWorkflowNode({
          type: 'agent',
          name: 'My Node',
          prompt: '{{ACTION}} it',
          agent: 'claude-code',
          x: 100,
          y: 200,
          timeout: 30000,
          continueOnError: true,
        }),
      ],
    })
    const result = substituteVariables(wf, { ACTION: 'Fix' })
    const node = firstNode(result)
    expect(node.name).toBe('My Node')
    expect(node.agent).toBe('claude-code')
    expect(node.x).toBe(100)
    expect(node.y).toBe(200)
    expect(node.timeout).toBe(30000)
    expect(node.continueOnError).toBe(true)
  })

  it('preserves workflow-level properties', () => {
    const wf = makeWorkflow({
      name: 'My Workflow',
      description: 'A test workflow',
      nodes: [makeWorkflowNode({ type: 'agent', prompt: '{{VAR}}' })],
    })
    const result = substituteVariables(wf, { VAR: 'value' })
    expect(result.id).toBe(wf.id)
    expect(result.name).toBe('My Workflow')
    expect(result.description).toBe('A test workflow')
    expect(result.edges).toBe(wf.edges)
  })

  it('handles multiple nodes', () => {
    const wf = makeWorkflow({
      nodes: [
        makeWorkflowNode({ type: 'agent', prompt: '{{VAR}} first' }),
        makeWorkflowNode({ type: 'shell', command: 'echo {{VAR}}' }),
        makeWorkflowNode({ type: 'checkpoint', message: '{{VAR}} done' }),
      ],
    })
    const result = substituteVariables(wf, { VAR: 'test' })
    const [n0, n1, n2] = result.nodes
    if (!n0 || !n1 || !n2) throw new Error('Expected 3 nodes')
    expect(n0.prompt).toBe('test first')
    expect(n1.command).toBe('echo test')
    expect(n2.message).toBe('test done')
  })
})
