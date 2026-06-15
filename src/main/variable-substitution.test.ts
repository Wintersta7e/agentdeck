import { describe, it, expect } from 'vitest'
import { substituteVariables } from './variable-substitution'
import { makeWorkflow, makeWorkflowNode } from '../__test__/helpers'
import type { WorkflowNode } from '../shared/types'

type NodeOfType<T extends WorkflowNode['type']> = Extract<WorkflowNode, { type: T }>

/**
 * Safely get the first node from a substitute-variables result and narrow it
 * to a specific variant. Throws if missing or wrong type.
 */
function firstNode<T extends WorkflowNode['type']>(
  wf: ReturnType<typeof substituteVariables>,
  type: T,
): NodeOfType<T> {
  const node = wf.nodes[0]
  if (!node) throw new Error('Expected at least one node')
  if (node.type !== type) throw new Error(`Expected ${type} node, got ${node.type}`)
  return node as NodeOfType<T>
}

describe('substituteVariables', () => {
  it('replaces {{VAR}} in prompt', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE_PATH}} now' })],
    })
    const result = substituteVariables(wf, { FILE_PATH: '/src/main.ts' })
    expect(firstNode(result, 'agent').prompt).toBe('Fix /src/main.ts now')
  })

  it('replaces {{VAR}} in command', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'shell', command: 'cd {{DIR}} && npm test' })],
    })
    const result = substituteVariables(wf, { DIR: '/home/user/project' })
    expect(firstNode(result, 'shell').command).toBe('cd /home/user/project && npm test')
  })

  it('replaces {{VAR}} in message', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'checkpoint', message: 'Review {{FEATURE}} changes' })],
    })
    const result = substituteVariables(wf, { FEATURE: 'auth' })
    expect(firstNode(result, 'checkpoint').message).toBe('Review auth changes')
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
    expect(firstNode(result, 'agent').agentFlags).toBe('--model gpt-4')
  })

  it('replaces multiple variables in one field', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: '{{ACTION}} the {{TARGET}}' })],
    })
    const result = substituteVariables(wf, { ACTION: 'Fix', TARGET: 'bug' })
    expect(firstNode(result, 'agent').prompt).toBe('Fix the bug')
  })

  it('leaves unresolved {{VAR}} as-is', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{UNKNOWN_VAR}}' })],
    })
    const result = substituteVariables(wf, {})
    expect(firstNode(result, 'agent').prompt).toBe('Fix {{UNKNOWN_VAR}}')
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
    expect(firstNode(result, 'shell').command).toContain('good')
  })

  it('handles undefined fields gracefully', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent' })],
    })
    const result = substituteVariables(wf, { FOO: 'bar' })
    const node = firstNode(result, 'agent')
    // Agent node fields default to undefined; the union enforces that
    // command/message do not exist on AgentNode at all.
    expect(node.prompt).toBeUndefined()
    expect(node.agentFlags).toBeUndefined()
  })

  it('does not mutate the original workflow', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE}}' })],
    })
    substituteVariables(wf, { FILE: 'test.ts' })
    const original = wf.nodes[0]
    if (!original || original.type !== 'agent') throw new Error('Expected agent node')
    expect(original.prompt).toBe('Fix {{FILE}}')
  })

  it('handles empty values', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'Fix {{FILE}}' })],
    })
    const result = substituteVariables(wf, { FILE: '' })
    expect(firstNode(result, 'agent').prompt).toBe('Fix ')
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
    const node = firstNode(result, 'agent')
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
    if (!n0 || n0.type !== 'agent') throw new Error('Expected agent node at [0]')
    if (!n1 || n1.type !== 'shell') throw new Error('Expected shell node at [1]')
    if (!n2 || n2.type !== 'checkpoint') throw new Error('Expected checkpoint node at [2]')
    expect(n0.prompt).toBe('test first')
    expect(n1.command).toBe('echo test')
    expect(n2.message).toBe('test done')
  })

  // Regex-replacement metacharacters in *values*. The replacer uses the
  // function form of String.replace, so the replacement string is inserted
  // verbatim — `$`, `$&`, `$1`, `\` carry no special meaning. A naive
  // `s.replace(re, value)` would interpret these and corrupt the output.
  // These tests pin that the function-replacer form is preserved.
  it('inserts a value containing $ literally', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'cost {{AMT}}' })],
    })
    const result = substituteVariables(wf, { AMT: '$100' })
    expect(firstNode(result, 'agent').prompt).toBe('cost $100')
  })

  it('inserts $& literally (no whole-match expansion)', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'val {{V}}' })],
    })
    // Under a naive String.replace, $& would expand to the matched text
    // ('{{V}}'), yielding 'val {{V}}'. The function-replacer form keeps it literal.
    const result = substituteVariables(wf, { V: '$&' })
    expect(firstNode(result, 'agent').prompt).toBe('val $&')
  })

  it('inserts $1 literally (no capture-group expansion)', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'val {{V}}' })],
    })
    // Under a naive String.replace, $1 would expand to capture group 1
    // (the variable name 'V'), yielding 'val V'. Here it stays literal.
    const result = substituteVariables(wf, { V: '$1' })
    expect(firstNode(result, 'agent').prompt).toBe('val $1')
  })

  it('inserts a backslash value literally', () => {
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: 'path {{V}}' })],
    })
    // The JS literal 'a\\b' is the three-char source `a\b`.
    const result = substituteVariables(wf, { V: 'a\\b' })
    expect(firstNode(result, 'agent').prompt).toBe('path a\\b')
  })

  it('is single-pass: a value that is itself a placeholder is not re-expanded', () => {
    // This pins the single-pass / no-recursion design. `{{A}}` -> '{{B}}' in
    // one pass; the inserted '{{B}}' is NOT scanned again, so it stays literal
    // even though B is provided. (String.replace makes a single left-to-right
    // pass over the ORIGINAL string and never revisits inserted text.)
    const wf = makeWorkflow({
      nodes: [makeWorkflowNode({ type: 'agent', prompt: '{{A}}' })],
    })
    const result = substituteVariables(wf, { A: '{{B}}', B: 'x' })
    expect(firstNode(result, 'agent').prompt).toBe('{{B}}')
  })
})
