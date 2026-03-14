import { describe, it, expect, beforeEach } from 'vitest'
import {
  stripAnsi,
  shellQuote,
  topoSort,
  validateWorkflow,
  AGENT_IDLE_TIMEOUT,
} from './workflow-engine'
import type { WorkflowNode } from '../shared/types'
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
})

// ── validateWorkflow ───────────────────────────────────────

describe('validateWorkflow', () => {
  it('accepts a valid minimal workflow', () => {
    const wf = makeWorkflow({ id: 'wf-1', nodes: [], edges: [] })
    expect(validateWorkflow(wf)).toBe(true)
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
    expect(validateWorkflow(wf)).toBe(true)
  })

  it('rejects null', () => {
    expect(() => validateWorkflow(null)).toThrow('not an object')
  })

  it('rejects non-object', () => {
    expect(() => validateWorkflow('string')).toThrow('not an object')
  })

  it('rejects missing id', () => {
    expect(() => validateWorkflow({ name: 'test', nodes: [], edges: [] })).toThrow(
      'Invalid workflow id',
    )
  })

  it('rejects id with invalid characters', () => {
    expect(() => validateWorkflow({ id: 'wf/../bad', name: 'test', nodes: [], edges: [] })).toThrow(
      'Invalid workflow id',
    )
  })

  it('rejects name exceeding 200 chars', () => {
    expect(() =>
      validateWorkflow({ id: 'wf-1', name: 'x'.repeat(201), nodes: [], edges: [] }),
    ).toThrow('name exceeds 200')
  })

  it('rejects description exceeding 2000 chars', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        description: 'x'.repeat(2001),
        nodes: [],
        edges: [],
      }),
    ).toThrow('description exceeds 2000')
  })

  it('rejects unknown node type', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'unknown', name: 'bad' }],
        edges: [],
      }),
    ).toThrow('Invalid node type')
  })

  it('rejects unknown agent in node', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'agent', name: 'test', agent: 'fake-agent' }],
        edges: [],
      }),
    ).toThrow('Unknown agent')
  })

  it('rejects more than 100 nodes', () => {
    const nodes = Array.from({ length: 101 }, (_, i) => ({
      id: `n${i}`,
      type: 'agent' as const,
      name: `node ${i}`,
      x: 0,
      y: 0,
    }))
    expect(() => validateWorkflow({ id: 'wf-1', name: 'test', nodes, edges: [] })).toThrow(
      'exceeds 100 nodes',
    )
  })

  it('rejects more than 500 edges', () => {
    const edges = Array.from({ length: 501 }, (_, i) => ({
      id: `e${i}`,
      fromNodeId: 'a',
      toNodeId: 'b',
    }))
    expect(() => validateWorkflow({ id: 'wf-1', name: 'test', nodes: [], edges })).toThrow(
      'exceeds 500 edges',
    )
  })

  it('rejects non-string roleId on node', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'agent', name: 'test', roleId: 123 }],
        edges: [],
      }),
    ).toThrow('roleId must be a string')
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
    expect(validateWorkflow(wf)).toBe(true)
  })

  it('rejects roleId exceeding 200 chars', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'agent', name: 'test', roleId: 'r'.repeat(201) }],
        edges: [],
      }),
    ).toThrow('roleId exceeds 200')
  })

  // T6: Edge validation — fromNodeId / toNodeId must reference existing nodes
  it('rejects edge with non-existent fromNodeId', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'agent', name: 'node1', x: 0, y: 0 }],
        edges: [{ id: 'e1', fromNodeId: 'ghost', toNodeId: 'n1' }],
      }),
    ).toThrow('Edge e1 references non-existent node: ghost')
  })

  it('rejects edge with non-existent toNodeId', () => {
    expect(() =>
      validateWorkflow({
        id: 'wf-1',
        name: 'test',
        nodes: [{ id: 'n1', type: 'agent', name: 'node1', x: 0, y: 0 }],
        edges: [{ id: 'e2', fromNodeId: 'n1', toNodeId: 'missing' }],
      }),
    ).toThrow('Edge e2 references non-existent node: missing')
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
    expect(validateWorkflow(wf)).toBe(true)
  })
})

// ── AGENT_IDLE_TIMEOUT ────────────────────────────────────

describe('AGENT_IDLE_TIMEOUT', () => {
  it('is exported and equals 300000 (5 minutes)', () => {
    expect(AGENT_IDLE_TIMEOUT).toBe(300_000)
  })
})

// ── continueOnError type ──────────────────────────────────

describe('WorkflowNode continueOnError', () => {
  // T1: Verify the type accepts continueOnError flag
  it('accepts continueOnError as optional boolean on WorkflowNode', () => {
    const node: WorkflowNode = makeWorkflowNode({
      id: 'n-coe',
      type: 'shell',
      command: 'npm test',
      continueOnError: true,
    })
    expect(node.continueOnError).toBe(true)
  })

  it('defaults continueOnError to undefined when not set', () => {
    const node: WorkflowNode = makeWorkflowNode({ id: 'n-default' })
    expect(node.continueOnError).toBeUndefined()
  })
})
