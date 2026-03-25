import { describe, it, expect, beforeEach } from 'vitest'
import { createScheduler } from './edge-scheduler'
import { makeWorkflowNode, makeWorkflowEdge, resetCounter } from '../__test__/helpers'

beforeEach(() => {
  resetCounter()
})

describe('edge-scheduler', () => {
  // ── 1. Root enqueue ────────────────────────────────────

  describe('root enqueue', () => {
    it('nodes with 0 incoming go into ready queue immediately', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const sched = createScheduler([a, b], [])

      const ready = sched.getReady()
      expect(ready).toHaveLength(2)
      expect(ready.map((n) => n.id).sort()).toEqual(['A', 'B'])
    })

    it('sets root nodes to running after getReady', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const sched = createScheduler([a], [])

      sched.getReady()
      expect(sched.getNodeStatus('A')).toBe('running')
    })

    it('returns empty array when no nodes are ready', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const edge = makeWorkflowEdge('A', 'B')
      const sched = createScheduler([a, b], [edge])

      // Drain root
      sched.getReady()
      // B is not ready yet (A not complete)
      const ready = sched.getReady()
      expect(ready).toHaveLength(0)
    })
  })

  // ── 2. Linear chain ────────────────────────────────────

  describe('linear chain', () => {
    it('A→B→C: complete A → B ready, complete B → C ready', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const c = makeWorkflowNode({ id: 'C', name: 'C' })
      const edges = [makeWorkflowEdge('A', 'B'), makeWorkflowEdge('B', 'C')]
      const sched = createScheduler([a, b, c], edges)

      // A is root
      const r1 = sched.getReady()
      expect(r1.map((n) => n.id)).toEqual(['A'])

      sched.completeNode('A')
      const r2 = sched.getReady()
      expect(r2.map((n) => n.id)).toEqual(['B'])

      sched.completeNode('B')
      const r3 = sched.getReady()
      expect(r3.map((n) => n.id)).toEqual(['C'])
    })
  })

  // ── 3. Parallel roots ──────────────────────────────────

  describe('parallel roots', () => {
    it('A, B both root → both in first getReady()', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const c = makeWorkflowNode({ id: 'C', name: 'C' })
      const edges = [makeWorkflowEdge('A', 'C'), makeWorkflowEdge('B', 'C')]
      const sched = createScheduler([a, b, c], edges)

      const ready = sched.getReady()
      expect(ready).toHaveLength(2)
      expect(ready.map((n) => n.id).sort()).toEqual(['A', 'B'])
    })
  })

  // ── 4. Diamond join (AND) ──────────────────────────────

  describe('diamond join (AND)', () => {
    it('A→C, B→C: complete A → C not ready; complete B → C ready', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const c = makeWorkflowNode({ id: 'C', name: 'C' })
      const edges = [makeWorkflowEdge('A', 'C'), makeWorkflowEdge('B', 'C')]
      const sched = createScheduler([a, b, c], edges)

      sched.getReady() // drain A, B
      sched.completeNode('A')

      // C should not be ready — still waiting on B
      expect(sched.getReady()).toHaveLength(0)
      expect(sched.getNodeStatus('C')).toBe('idle')

      sched.completeNode('B')
      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['C'])
    })
  })

  // ── 5. Condition branching ─────────────────────────────

  describe('condition branching', () => {
    it('resolveCondition activates matching branch and skips unmatched', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'False branch' })
      const edges = [
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
      ]
      const sched = createScheduler([cond, t, f], edges)

      sched.getReady() // drain cond
      sched.resolveCondition('cond', 'true')

      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['T'])
      expect(sched.getNodeStatus('T')).toBe('running')
      expect(sched.getNodeStatus('F')).toBe('skipped')
    })

    it('resolveCondition with false branch activates F and skips T', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'False branch' })
      const edges = [
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
      ]
      const sched = createScheduler([cond, t, f], edges)

      sched.getReady()
      sched.resolveCondition('cond', 'false')

      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['F'])
      expect(sched.getNodeStatus('T')).toBe('skipped')
    })
  })

  // ── 6. Skip propagation ────────────────────────────────

  describe('skip propagation', () => {
    it('cond→false(F)→G: G skipped because F is skipped', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'False branch' })
      const g = makeWorkflowNode({ id: 'G', name: 'After False' })
      const edges = [
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
        makeWorkflowEdge('F', 'G'),
      ]
      const sched = createScheduler([cond, t, f, g], edges)

      sched.getReady() // drain cond
      sched.resolveCondition('cond', 'true')

      // T is ready, F is skipped
      expect(sched.getNodeStatus('F')).toBe('skipped')
      // G should be skipped via propagation (only incoming edge is from skipped F)
      expect(sched.getNodeStatus('G')).toBe('skipped')
    })

    it('multi-level skip propagation: cond→F→G→H all skipped', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'F' })
      const g = makeWorkflowNode({ id: 'G', name: 'G' })
      const h = makeWorkflowNode({ id: 'H', name: 'H' })
      const edges = [
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
        makeWorkflowEdge('F', 'G'),
        makeWorkflowEdge('G', 'H'),
      ]
      const sched = createScheduler([cond, t, f, g, h], edges)

      sched.getReady()
      sched.resolveCondition('cond', 'true')

      expect(sched.getNodeStatus('F')).toBe('skipped')
      expect(sched.getNodeStatus('G')).toBe('skipped')
      expect(sched.getNodeStatus('H')).toBe('skipped')
    })
  })

  // ── 7. Join with skip ──────────────────────────────────

  describe('join with skip', () => {
    it('T→join, F→join: only T taken, join still runs', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'False branch' })
      const join = makeWorkflowNode({ id: 'join', name: 'Join' })
      const edges = [
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
        makeWorkflowEdge('T', 'join'),
        makeWorkflowEdge('F', 'join'),
      ]
      const sched = createScheduler([cond, t, f, join], edges)

      sched.getReady() // drain cond
      sched.resolveCondition('cond', 'true')

      // T is ready, F is skipped (propagates skip edge to join)
      const r1 = sched.getReady()
      expect(r1.map((n) => n.id)).toEqual(['T'])

      sched.completeNode('T')

      // join has 2 incoming: 1 real from T, 1 skipped from F
      // Not ALL skipped → join should be ready (not skipped)
      const r2 = sched.getReady()
      expect(r2.map((n) => n.id)).toEqual(['join'])
      expect(sched.getNodeStatus('join')).toBe('running')
    })
  })

  // ── 8. Skip chain stops at mixed join ──────────────────

  describe('skip chain stops at mixed join', () => {
    it('join node runs when it has at least one non-skipped incoming edge', () => {
      //   A ──→ join
      //   cond →true(T)→ join
      //        →false(F)→ join
      // Take false branch: T is skipped, but A feeds join normally → join runs
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const t = makeWorkflowNode({ id: 'T', name: 'True branch' })
      const f = makeWorkflowNode({ id: 'F', name: 'False branch' })
      const join = makeWorkflowNode({ id: 'join', name: 'Join' })
      const edges = [
        makeWorkflowEdge('A', 'cond'),
        makeWorkflowEdge('cond', 'T', { branch: 'true' }),
        makeWorkflowEdge('cond', 'F', { branch: 'false' }),
        makeWorkflowEdge('A', 'join'),
        makeWorkflowEdge('T', 'join'),
        makeWorkflowEdge('F', 'join'),
      ]
      const sched = createScheduler([a, cond, t, f, join], edges)

      // A is root
      const r1 = sched.getReady()
      expect(r1.map((n) => n.id)).toEqual(['A'])

      sched.completeNode('A')

      // cond becomes ready (from A→cond). join pending still > 0 (waiting on T and F)
      const r2 = sched.getReady()
      expect(r2.map((n) => n.id)).toEqual(['cond'])

      sched.resolveCondition('cond', 'false')

      // F is ready, T is skipped (skip propagates T→join as skipped edge)
      const r3 = sched.getReady()
      expect(r3.map((n) => n.id)).toEqual(['F'])

      sched.completeNode('F')

      // join: 3 incoming (A, T, F). A=real, T=skipped, F=real → not all skipped → runs
      const r4 = sched.getReady()
      expect(r4.map((n) => n.id)).toEqual(['join'])
      expect(sched.getNodeStatus('join')).toBe('running')
    })
  })

  // ── 9. isDone ──────────────────────────────────────────

  describe('isDone', () => {
    it('returns true when all nodes completed or skipped', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const sched = createScheduler([a, b], [])

      expect(sched.isDone()).toBe(false) // idle nodes

      sched.getReady()
      expect(sched.isDone()).toBe(false) // running nodes

      sched.completeNode('A')
      expect(sched.isDone()).toBe(false) // B still running

      sched.completeNode('B')
      expect(sched.isDone()).toBe(true)
    })

    it('returns true when mix of done, skipped, and errored', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const c = makeWorkflowNode({ id: 'C', name: 'C' })
      const sched = createScheduler([a, b, c], [])

      sched.getReady()
      sched.completeNode('A')
      sched.failNode('B')
      sched.skipNode('C')

      expect(sched.isDone()).toBe(true)
    })

    it('returns false when nodes are still idle (pending)', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const edge = makeWorkflowEdge('A', 'B')
      const sched = createScheduler([a, b], [edge])

      sched.getReady()
      sched.failNode('A')

      // B is still idle (A failed, no edge activation)
      expect(sched.isDone()).toBe(false)
    })
  })

  // ── 10. failNode ───────────────────────────────────────

  describe('failNode', () => {
    it('does not activate outgoing edges', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const edge = makeWorkflowEdge('A', 'B')
      const sched = createScheduler([a, b], [edge])

      sched.getReady()
      sched.failNode('A')

      expect(sched.getNodeStatus('A')).toBe('error')
      expect(sched.getNodeStatus('B')).toBe('idle')
      expect(sched.getReady()).toHaveLength(0)
    })
  })

  // ── 11. completeNode after failNode (continueOnError) ──

  describe('continueOnError flow', () => {
    it('engine calls completeNode instead of failNode → outgoing activated', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A', continueOnError: true })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const edge = makeWorkflowEdge('A', 'B')
      const sched = createScheduler([a, b], [edge])

      sched.getReady()
      // Engine decides to continue on error by calling completeNode
      sched.completeNode('A')

      expect(sched.getNodeStatus('A')).toBe('done')
      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['B'])
    })
  })

  // ── 12. resetLoopSubgraph ──────────────────────────────

  describe('resetLoopSubgraph', () => {
    it('re-enqueues loop body after resolveCondition', () => {
      // Graph: setup → A → cond --loop→ A
      //                     └── done(exit)
      const setup = makeWorkflowNode({ id: 'setup', name: 'Setup' })
      const a = makeWorkflowNode({ id: 'A', name: 'Loop body' })
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const done = makeWorkflowNode({ id: 'done', name: 'Done' })
      const edges = [
        makeWorkflowEdge('setup', 'A'),
        makeWorkflowEdge('A', 'cond'),
        makeWorkflowEdge('cond', 'done', { branch: 'false' }),
        makeWorkflowEdge('cond', 'A', { branch: 'true', edgeType: 'loop' }),
      ]
      const sched = createScheduler([setup, a, cond, done], edges)

      // First iteration
      const r1 = sched.getReady()
      expect(r1.map((n) => n.id)).toEqual(['setup'])
      sched.completeNode('setup')

      const r2 = sched.getReady()
      expect(r2.map((n) => n.id)).toEqual(['A'])
      sched.completeNode('A')

      const r3 = sched.getReady()
      expect(r3.map((n) => n.id)).toEqual(['cond'])

      // Condition says loop (branch=true)
      sched.resolveCondition('cond', 'true')
      // done is skipped (false branch not taken)
      expect(sched.getNodeStatus('done')).toBe('skipped')

      // Reset loop subgraph: A and cond
      sched.resetLoopSubgraph('A', 'cond')

      expect(sched.getNodeStatus('A')).toBe('idle')
      expect(sched.getNodeStatus('cond')).toBe('idle')

      // A should be re-enqueued (0 intra-loop in-degree)
      const r4 = sched.getReady()
      expect(r4.map((n) => n.id)).toEqual(['A'])
      expect(sched.getNodeStatus('A')).toBe('running')
    })
  })

  // ── 13. Loop subgraph resets only internal nodes ───────

  describe('loop subgraph isolation', () => {
    it('nodes outside loop remain untouched', () => {
      // Graph: setup → A → B → cond --loop→ A
      //                           └── exit(done)
      // `setup` is outside the loop body
      const setup = makeWorkflowNode({ id: 'setup', name: 'Setup' })
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const done = makeWorkflowNode({ id: 'done', name: 'Done' })
      const edges = [
        makeWorkflowEdge('setup', 'A'),
        makeWorkflowEdge('A', 'B'),
        makeWorkflowEdge('B', 'cond'),
        makeWorkflowEdge('cond', 'done', { branch: 'false' }),
        makeWorkflowEdge('cond', 'A', { branch: 'true', edgeType: 'loop' }),
      ]
      const sched = createScheduler([setup, a, b, cond, done], edges)

      // Run first iteration
      sched.getReady() // setup
      sched.completeNode('setup')
      sched.getReady() // A
      sched.completeNode('A')
      sched.getReady() // B
      sched.completeNode('B')
      sched.getReady() // cond
      sched.resolveCondition('cond', 'true')

      // Reset loop: A → B → cond
      sched.resetLoopSubgraph('A', 'cond')

      // setup should remain done
      expect(sched.getNodeStatus('setup')).toBe('done')

      // Loop body should be reset
      expect(sched.getNodeStatus('A')).toBe('idle')
      expect(sched.getNodeStatus('B')).toBe('idle')
      expect(sched.getNodeStatus('cond')).toBe('idle')

      // Only A should be enqueued (0 intra-loop in-degree)
      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['A'])
    })

    it('second loop iteration runs correctly end-to-end', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const done = makeWorkflowNode({ id: 'done', name: 'Done' })
      const edges = [
        makeWorkflowEdge('A', 'cond'),
        makeWorkflowEdge('cond', 'done', { branch: 'false' }),
        makeWorkflowEdge('cond', 'A', { branch: 'true', edgeType: 'loop' }),
      ]
      const sched = createScheduler([a, cond, done], edges)

      // Iteration 1
      sched.getReady()
      sched.completeNode('A')
      sched.getReady()
      sched.resolveCondition('cond', 'true')
      sched.resetLoopSubgraph('A', 'cond')

      // Iteration 2
      const r1 = sched.getReady()
      expect(r1.map((n) => n.id)).toEqual(['A'])
      sched.completeNode('A')

      const r2 = sched.getReady()
      expect(r2.map((n) => n.id)).toEqual(['cond'])

      // Now exit the loop
      sched.resolveCondition('cond', 'false')
      expect(sched.getNodeStatus('done')).toBe('idle')

      const r3 = sched.getReady()
      expect(r3.map((n) => n.id)).toEqual(['done'])
      sched.completeNode('done')

      expect(sched.isDone()).toBe(true)
    })
  })

  // ── Additional edge cases ──────────────────────────────

  describe('edge cases', () => {
    it('getReady drains the queue (second call returns empty)', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const sched = createScheduler([a], [])

      sched.getReady()
      expect(sched.getReady()).toHaveLength(0)
    })

    it('throws on unknown node ID', () => {
      const sched = createScheduler([], [])
      expect(() => sched.getNodeStatus('unknown')).toThrow('Unknown node: unknown')
      expect(() => sched.completeNode('unknown')).toThrow('Unknown node: unknown')
      expect(() => sched.failNode('unknown')).toThrow('Unknown node: unknown')
      expect(() => sched.skipNode('unknown')).toThrow('Unknown node: unknown')
      expect(() => sched.resolveCondition('unknown', 'true')).toThrow('Unknown node: unknown')
    })

    it('loop edges do not count as incoming forward edges', () => {
      // A → cond --loop→ A
      // A should have 0 forward incoming edges (loop edge excluded), so it's a root
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const edges = [
        makeWorkflowEdge('A', 'cond'),
        makeWorkflowEdge('cond', 'A', { edgeType: 'loop' }),
      ]
      const sched = createScheduler([a, cond], edges)

      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['A'])
    })

    it('single node graph: getReady → complete → isDone', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const sched = createScheduler([a], [])

      sched.getReady()
      sched.completeNode('A')
      expect(sched.isDone()).toBe(true)
    })

    it('empty graph: isDone returns true', () => {
      const sched = createScheduler([], [])
      expect(sched.isDone()).toBe(true)
    })

    it('unconditional edges from condition node activate normally', () => {
      const cond = makeWorkflowNode({ id: 'cond', type: 'condition', name: 'Cond' })
      const next = makeWorkflowNode({ id: 'next', name: 'Next' })
      // Edge without branch — should activate on any resolveCondition call
      const edges = [makeWorkflowEdge('cond', 'next')]
      const sched = createScheduler([cond, next], edges)

      sched.getReady()
      sched.resolveCondition('cond', 'true')

      const ready = sched.getReady()
      expect(ready.map((n) => n.id)).toEqual(['next'])
    })

    it('skipNode on a root node propagates skip downstream', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const edge = makeWorkflowEdge('A', 'B')
      const sched = createScheduler([a, b], [edge])

      sched.getReady()
      sched.skipNode('A')

      expect(sched.getNodeStatus('A')).toBe('skipped')
      expect(sched.getNodeStatus('B')).toBe('skipped')
    })

    it('resetLoopSubgraph with no valid subgraph is a no-op', () => {
      const a = makeWorkflowNode({ id: 'A', name: 'A' })
      const b = makeWorkflowNode({ id: 'B', name: 'B' })
      const sched = createScheduler([a, b], [])

      sched.getReady()
      sched.completeNode('A')

      // No path from A to B, reset is a no-op
      sched.resetLoopSubgraph('A', 'B')
      expect(sched.getNodeStatus('A')).toBe('done')
    })
  })
})
