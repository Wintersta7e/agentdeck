import { describe, it, expect, beforeEach } from 'vitest'
import { stripAnsi, shellQuote, topoSort, validateWorkflow } from './workflow-engine'

import { makeWorkflowNode, makeWorkflowEdge, makeWorkflow, resetCounter } from '../__test__/helpers'

beforeEach(() => {
  resetCounter()
})

// ── stripAnsi ──────────────────────────────────────────────

describe('stripAnsi', () => {
  it('strips SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  })

  it('strips bold/underline', () => {
    expect(stripAnsi('\x1b[1mbold\x1b[22m')).toBe('bold')
  })

  it('strips cursor movement', () => {
    expect(stripAnsi('\x1b[2Aup two lines')).toBe('up two lines')
  })

  it('strips OSC sequences (title set)', () => {
    expect(stripAnsi('\x1b]0;window title\x07content')).toBe('content')
  })

  it('strips OSC sequences with ST terminator', () => {
    expect(stripAnsi('\x1b]0;title\x1b\\content')).toBe('content')
  })

  it('strips carriage returns', () => {
    expect(stripAnsi('hello\rworld')).toBe('helloworld')
  })

  it('strips complex mixed sequences', () => {
    const input = '\x1b[32m✓\x1b[39m \x1b[2mtest passed\x1b[22m'
    expect(stripAnsi(input)).toBe('✓ test passed')
  })

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('')
  })

  it('strips charset designation sequences', () => {
    expect(stripAnsi('\x1b(Btext')).toBe('text')
  })
})

// ── shellQuote ─────────────────────────────────────────────

describe('shellQuote', () => {
  it('wraps simple string in single quotes', () => {
    expect(shellQuote('hello')).toBe("'hello'")
  })

  it('escapes single quotes', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  it('handles empty string', () => {
    expect(shellQuote('')).toBe("''")
  })

  it('handles shell metacharacters safely', () => {
    expect(shellQuote('$(whoami)')).toBe("'$(whoami)'")
    expect(shellQuote('foo; rm -rf /')).toBe("'foo; rm -rf /'")
    expect(shellQuote('a && b')).toBe("'a && b'")
  })

  it('handles paths with spaces', () => {
    expect(shellQuote('/home/user/my project')).toBe("'/home/user/my project'")
  })

  it('handles multiple single quotes', () => {
    expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'")
  })
})

// ── topoSort ───────────────────────────────────────────────

describe('topoSort', () => {
  it('returns single node in one tier', () => {
    const node = makeWorkflowNode({ id: 'a' })
    const tiers = topoSort([node], [])

    expect(tiers).toHaveLength(1)
    expect(tiers[0]).toHaveLength(1)
    expect(tiers[0]?.[0]?.id).toBe('a')
  })

  it('sorts linear chain into sequential tiers', () => {
    const a = makeWorkflowNode({ id: 'a' })
    const b = makeWorkflowNode({ id: 'b' })
    const c = makeWorkflowNode({ id: 'c' })
    const edges = [makeWorkflowEdge('a', 'b'), makeWorkflowEdge('b', 'c')]

    const tiers = topoSort([a, b, c], edges)

    expect(tiers).toHaveLength(3)
    expect(tiers[0]?.[0]?.id).toBe('a')
    expect(tiers[1]?.[0]?.id).toBe('b')
    expect(tiers[2]?.[0]?.id).toBe('c')
  })

  it('groups parallel nodes in same tier', () => {
    const a = makeWorkflowNode({ id: 'a' })
    const b = makeWorkflowNode({ id: 'b' })
    const c = makeWorkflowNode({ id: 'c' })

    const tiers = topoSort([a, b, c], [])

    expect(tiers).toHaveLength(1)
    expect(tiers[0]).toHaveLength(3)
  })

  it('handles diamond DAG', () => {
    //   a
    //  / \
    // b   c
    //  \ /
    //   d
    const a = makeWorkflowNode({ id: 'a' })
    const b = makeWorkflowNode({ id: 'b' })
    const c = makeWorkflowNode({ id: 'c' })
    const d = makeWorkflowNode({ id: 'd' })
    const edges = [
      makeWorkflowEdge('a', 'b'),
      makeWorkflowEdge('a', 'c'),
      makeWorkflowEdge('b', 'd'),
      makeWorkflowEdge('c', 'd'),
    ]

    const tiers = topoSort([a, b, c, d], edges)

    expect(tiers).toHaveLength(3)
    expect(tiers[0]?.map((n) => n.id)).toEqual(['a'])
    expect(tiers[1]?.map((n) => n.id).sort()).toEqual(['b', 'c'])
    expect(tiers[2]?.map((n) => n.id)).toEqual(['d'])
  })

  it('detects circular dependency', () => {
    const a = makeWorkflowNode({ id: 'a' })
    const b = makeWorkflowNode({ id: 'b' })
    const edges = [makeWorkflowEdge('a', 'b'), makeWorkflowEdge('b', 'a')]

    expect(() => topoSort([a, b], edges)).toThrow('Circular dependency')
  })

  it('handles empty graph', () => {
    const tiers = topoSort([], [])
    expect(tiers).toEqual([])
  })

  it('handles fan-out topology', () => {
    //   a
    //  /|\
    // b c d
    const a = makeWorkflowNode({ id: 'a' })
    const b = makeWorkflowNode({ id: 'b' })
    const c = makeWorkflowNode({ id: 'c' })
    const d = makeWorkflowNode({ id: 'd' })
    const edges = [
      makeWorkflowEdge('a', 'b'),
      makeWorkflowEdge('a', 'c'),
      makeWorkflowEdge('a', 'd'),
    ]

    const tiers = topoSort([a, b, c, d], edges)

    expect(tiers).toHaveLength(2)
    expect(tiers[0]?.map((n) => n.id)).toEqual(['a'])
    expect(tiers[1]).toHaveLength(3)
  })

  it('excludes loop edges from in-degree calculation', () => {
    const a = makeWorkflowNode({ id: 'a', type: 'shell', command: 'echo' })
    const cond = makeWorkflowNode({ id: 'c', type: 'condition', conditionMode: 'exitCode' })
    const tiers = topoSort(
      [a, cond],
      [
        makeWorkflowEdge('a', 'c'),
        makeWorkflowEdge('c', 'a', { edgeType: 'loop', branch: 'false', maxIterations: 3 }),
      ],
    )
    expect(tiers).toHaveLength(2)
    expect(tiers[0]?.[0]?.id).toBe('a')
    expect(tiers[1]?.[0]?.id).toBe('c')
  })

  it('still detects real cycles (non-loop edges)', () => {
    const a = makeWorkflowNode({ id: 'a', type: 'shell', command: 'echo' })
    const b = makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo' })
    expect(() =>
      topoSort([a, b], [makeWorkflowEdge('a', 'b'), makeWorkflowEdge('b', 'a')]),
    ).toThrow('Circular dependency')
  })
})

// ── validateWorkflow ───────────────────────────────────────

describe('validateWorkflow', () => {
  it('accepts a valid minimal workflow', () => {
    const wf = makeWorkflow({ id: 'wf-1', nodes: [], edges: [] })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  it('accepts valid agent/shell/checkpoint nodes', () => {
    const wf = makeWorkflow({
      id: 'wf-1',
      nodes: [
        makeWorkflowNode({ id: 'n1', type: 'agent', agent: 'claude-code' }),
        makeWorkflowNode({ id: 'n2', type: 'shell', command: 'npm test' }),
        makeWorkflowNode({ id: 'n3', type: 'checkpoint', message: 'Review results' }),
      ],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  it('rejects null', () => {
    const result = validateWorkflow(null)
    expect(result.errors.some((e) => e.includes('not an object'))).toBe(true)
  })

  it('rejects non-object', () => {
    const result = validateWorkflow('string')
    expect(result.errors.some((e) => e.includes('not an object'))).toBe(true)
  })

  it('rejects missing id', () => {
    const result = validateWorkflow({ name: 'test', nodes: [], edges: [] })
    expect(result.errors.some((e) => e.includes('Invalid workflow id'))).toBe(true)
  })

  it('rejects id with invalid characters', () => {
    const result = validateWorkflow({ id: 'wf/../bad', name: 'test', nodes: [], edges: [] })
    expect(result.errors.some((e) => e.includes('Invalid workflow id'))).toBe(true)
  })

  it('rejects name exceeding 200 chars', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'x'.repeat(201),
      nodes: [],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('name exceeds 200'))).toBe(true)
  })

  it('rejects description exceeding 2000 chars', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      description: 'x'.repeat(2001),
      nodes: [],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('description exceeds 2000'))).toBe(true)
  })

  it('rejects unknown node type', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'unknown', name: 'bad' }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('Invalid node type'))).toBe(true)
  })

  it('rejects unknown agent in node', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'test', agent: 'fake-agent' }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('Unknown agent'))).toBe(true)
  })

  it('rejects more than 100 nodes', () => {
    const nodes = Array.from({ length: 101 }, (_, i) => ({
      id: `n${i}`,
      type: 'agent' as const,
      name: `node ${i}`,
      x: 0,
      y: 0,
    }))
    const result = validateWorkflow({ id: 'wf-1', name: 'test', nodes, edges: [] })
    expect(result.errors.some((e) => e.includes('exceeds 100 nodes'))).toBe(true)
  })

  it('rejects more than 500 edges', () => {
    const edges = Array.from({ length: 501 }, (_, i) => ({
      id: `e${i}`,
      fromNodeId: 'a',
      toNodeId: 'b',
    }))
    const result = validateWorkflow({ id: 'wf-1', name: 'test', nodes: [], edges })
    expect(result.errors.some((e) => e.includes('exceeds 500 edges'))).toBe(true)
  })

  it('rejects non-string roleId on node', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'test', roleId: 123 }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('roleId must be a string'))).toBe(true)
  })

  it('accepts valid string roleId on node', () => {
    const wf = {
      id: 'wf-1',
      name: 'test',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', roleId: 'role-reviewer' })],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  it('rejects roleId exceeding 200 chars', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'test', roleId: 'r'.repeat(201) }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('roleId exceeds 200'))).toBe(true)
  })

  // T6: Edge validation — fromNodeId / toNodeId must reference existing nodes
  it('rejects edge with non-existent fromNodeId', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'node1', x: 0, y: 0 }],
      edges: [{ id: 'e1', fromNodeId: 'ghost', toNodeId: 'n1' }],
    })
    expect(
      result.errors.some((e) => e.includes('Edge e1 references non-existent node: ghost')),
    ).toBe(true)
  })

  it('rejects edge with non-existent toNodeId', () => {
    const result = validateWorkflow({
      id: 'wf-1',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'node1', x: 0, y: 0 }],
      edges: [{ id: 'e2', fromNodeId: 'n1', toNodeId: 'missing' }],
    })
    expect(
      result.errors.some((e) => e.includes('Edge e2 references non-existent node: missing')),
    ).toBe(true)
  })

  it('accepts edges referencing valid nodes', () => {
    const wf = makeWorkflow({
      id: 'wf-valid',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo hi' }),
      ],
      edges: [makeWorkflowEdge('a', 'b')],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  // ── Condition node validation ────────────────────────────────

  it('errors when condition node has 0 incoming edges', () => {
    const wf = makeWorkflow({
      id: 'wf-cond',
      nodes: [
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({ id: 'out1', type: 'agent' }),
      ],
      edges: [makeWorkflowEdge('cond1', 'out1', { branch: 'true' })],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('exactly 1 incoming edge (has 0)'))).toBe(true)
  })

  it('errors when condition node has 2+ incoming edges', () => {
    const wf = makeWorkflow({
      id: 'wf-cond2',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
      ],
      edges: [
        makeWorkflowEdge('a', 'cond1'),
        makeWorkflowEdge('b', 'cond1'),
        makeWorkflowEdge('cond1', 'a', { branch: 'true' }),
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('exactly 1 incoming edge (has 2)'))).toBe(true)
  })

  it('errors when exitCode condition has checkpoint upstream', () => {
    const wf = makeWorkflow({
      id: 'wf-exit-chk',
      nodes: [
        makeWorkflowNode({ id: 'chk', type: 'checkpoint' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
      ],
      edges: [
        makeWorkflowEdge('chk', 'cond1'),
        makeWorkflowEdge('cond1', 'chk', { branch: 'true' }),
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('requires agent/shell upstream'))).toBe(true)
  })

  it('errors when outputMatch condition has invalid regex', () => {
    const wf = makeWorkflow({
      id: 'wf-badre',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'outputMatch',
          conditionPattern: '(unclosed',
        }),
      ],
      edges: [makeWorkflowEdge('a', 'cond1'), makeWorkflowEdge('cond1', 'a', { branch: 'true' })],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('Invalid regex'))).toBe(true)
  })

  it('errors when outputMatch condition has empty pattern', () => {
    const wf = makeWorkflow({
      id: 'wf-emptypat',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'outputMatch',
          conditionPattern: '',
        }),
      ],
      edges: [makeWorkflowEdge('a', 'cond1'), makeWorkflowEdge('cond1', 'a', { branch: 'true' })],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('non-empty conditionPattern'))).toBe(true)
  })

  it('accepts valid condition node with exitCode mode', () => {
    const wf = makeWorkflow({
      id: 'wf-ok-cond',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'shell', command: 'npm test' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({ id: 'b', type: 'agent' }),
      ],
      edges: [makeWorkflowEdge('a', 'cond1'), makeWorkflowEdge('cond1', 'b', { branch: 'true' })],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  it('accepts valid condition node with outputMatch mode', () => {
    const wf = makeWorkflow({
      id: 'wf-ok-match',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'outputMatch',
          conditionPattern: 'SUCCESS',
        }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo done' }),
      ],
      edges: [makeWorkflowEdge('a', 'cond1'), makeWorkflowEdge('cond1', 'b', { branch: 'true' })],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  // ── Branch edge validation ───────────────────────────────────

  it('errors when branch is on a non-condition edge', () => {
    const wf = makeWorkflow({
      id: 'wf-bad-branch',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo' }),
      ],
      edges: [makeWorkflowEdge('a', 'b', { branch: 'true' })],
    })
    const result = validateWorkflow(wf)
    expect(
      result.errors.some((e) => e.includes('branch but fromNodeId is not a condition node')),
    ).toBe(true)
  })

  // ── Loop edge validation ─────────────────────────────────────

  it('errors when loop edge is missing maxIterations', () => {
    const wf = makeWorkflow({
      id: 'wf-loop-nomax',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
      ],
      edges: [
        makeWorkflowEdge('a', 'cond1'),
        makeWorkflowEdge('cond1', 'a', { edgeType: 'loop', branch: 'false' }),
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('requires maxIterations'))).toBe(true)
  })

  it('errors when loop edge is from non-condition node', () => {
    const wf = makeWorkflow({
      id: 'wf-loop-nonc',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo' }),
      ],
      edges: [makeWorkflowEdge('a', 'b', { edgeType: 'loop', branch: 'false', maxIterations: 3 })],
    })
    const result = validateWorkflow(wf)
    expect(
      result.errors.some((e) => e.includes('Loop edge') && e.includes('must be a condition node')),
    ).toBe(true)
  })

  it('errors when loop edge is missing branch', () => {
    const wf = makeWorkflow({
      id: 'wf-loop-nobranch',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
      ],
      edges: [
        makeWorkflowEdge('a', 'cond1'),
        makeWorkflowEdge('cond1', 'a', { edgeType: 'loop', maxIterations: 5 }),
      ],
    })
    const result = validateWorkflow(wf)
    expect(
      result.errors.some((e) => e.includes('Loop edge') && e.includes('requires a branch field')),
    ).toBe(true)
  })

  it('accepts valid loop edge', () => {
    const wf = makeWorkflow({
      id: 'wf-loop-ok',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'shell', command: 'npm test' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({ id: 'b', type: 'agent' }),
      ],
      edges: [
        makeWorkflowEdge('a', 'cond1'),
        makeWorkflowEdge('cond1', 'a', { edgeType: 'loop', branch: 'false', maxIterations: 3 }),
        makeWorkflowEdge('cond1', 'b', { branch: 'true' }),
      ],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  // ── Retry validation ─────────────────────────────────────────

  it('errors when retryCount is on a checkpoint node', () => {
    const result = validateWorkflow({
      id: 'wf-retry-chk',
      name: 'test',
      nodes: [{ id: 'n1', type: 'checkpoint', name: 'chk', retryCount: 2 }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('retryCount not allowed on checkpoint'))).toBe(true)
  })

  it('errors when retryCount is on a condition node', () => {
    const wf = makeWorkflow({
      id: 'wf-retry-cond',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({
          id: 'cond1',
          type: 'condition',
          conditionMode: 'exitCode',
          retryCount: 2,
        }),
      ],
      edges: [makeWorkflowEdge('a', 'cond1'), makeWorkflowEdge('cond1', 'a', { branch: 'true' })],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('retryCount not allowed on condition'))).toBe(true)
  })

  it('errors when retryCount is out of range', () => {
    const result = validateWorkflow({
      id: 'wf-retry-range',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'test', retryCount: 10 }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('retryCount must be 1-5'))).toBe(true)
  })

  it('errors when retryDelayMs is out of range', () => {
    const result = validateWorkflow({
      id: 'wf-delay-range',
      name: 'test',
      nodes: [{ id: 'n1', type: 'agent', name: 'test', retryDelayMs: 99 }],
      edges: [],
    })
    expect(result.errors.some((e) => e.includes('retryDelayMs must be 100-60000'))).toBe(true)
  })

  it('accepts valid retry fields on agent node', () => {
    const wf = makeWorkflow({
      id: 'wf-retry-ok',
      nodes: [makeWorkflowNode({ id: 'n1', type: 'agent', retryCount: 3, retryDelayMs: 5000 })],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  // ── Variable validation ──────────────────────────────────────

  it('errors when variable name does not match pattern', () => {
    const wf = makeWorkflow({
      id: 'wf-var-bad',
      nodes: [],
      edges: [],
      variables: [{ name: 'lowercase', type: 'string' }],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('must match'))).toBe(true)
  })

  it('errors on duplicate variable names', () => {
    const wf = makeWorkflow({
      id: 'wf-var-dup',
      nodes: [],
      edges: [],
      variables: [
        { name: 'MY_VAR', type: 'string' },
        { name: 'MY_VAR', type: 'text' },
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('Duplicate variable name'))).toBe(true)
  })

  it('errors when choice variable has empty choices', () => {
    const wf = makeWorkflow({
      id: 'wf-var-choice',
      nodes: [],
      edges: [],
      variables: [{ name: 'PICK', type: 'choice', choices: [] }],
    })
    const result = validateWorkflow(wf)
    expect(result.errors.some((e) => e.includes('non-empty choices array'))).toBe(true)
  })

  it('accepts valid variables', () => {
    const wf = makeWorkflow({
      id: 'wf-var-ok',
      nodes: [],
      edges: [],
      variables: [
        { name: 'MY_VAR', type: 'string' },
        { name: 'BRANCH', type: 'choice', choices: ['main', 'dev'] },
      ],
    })
    expect(validateWorkflow(wf).errors).toEqual([])
  })

  // ── Fan-out warning ──────────────────────────────────────────

  it('warns on duplicate branch fan-out from condition node', () => {
    const wf = makeWorkflow({
      id: 'wf-fanout',
      nodes: [
        makeWorkflowNode({ id: 'a', type: 'agent' }),
        makeWorkflowNode({ id: 'cond1', type: 'condition', conditionMode: 'exitCode' }),
        makeWorkflowNode({ id: 'b', type: 'shell', command: 'echo 1' }),
        makeWorkflowNode({ id: 'c', type: 'shell', command: 'echo 2' }),
      ],
      edges: [
        makeWorkflowEdge('a', 'cond1'),
        makeWorkflowEdge('cond1', 'b', { branch: 'true' }),
        makeWorkflowEdge('cond1', 'c', { branch: 'true' }),
      ],
    })
    const result = validateWorkflow(wf)
    expect(result.errors).toEqual([])
    expect(result.warnings.some((w) => w.includes('2 edges with branch="true"'))).toBe(true)
  })

  it('returns warnings array even when no warnings', () => {
    const wf = makeWorkflow({ id: 'wf-empty', nodes: [], edges: [] })
    const result = validateWorkflow(wf)
    expect(result.warnings).toEqual([])
  })

  it('collects multiple errors', () => {
    const result = validateWorkflow({
      id: '',
      name: 'x'.repeat(201),
      nodes: 'not-array',
      edges: [],
    })
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})
