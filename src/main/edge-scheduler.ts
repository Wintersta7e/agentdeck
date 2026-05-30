/**
 * Edge-activation scheduler for workflow DAG execution.
 *
 * Replaces the old tier-based execution model with a ready-queue approach
 * driven by pending edge counts. Supports condition branching, skip propagation,
 * and loop subgraph resets.
 */
import type { WorkflowNode, WorkflowEdge, WorkflowNodeStatus } from '../shared/types'

export interface EdgeScheduler {
  /** Dequeue all ready nodes. Sets their status to 'running'. Returns empty if none ready. */
  getReady(): WorkflowNode[]
  /** Mark node as done and activate its outgoing edges. */
  completeNode(nodeId: string): void
  /** Mark node as error. Does NOT activate outgoing edges (engine decides via continueOnError). */
  failNode(nodeId: string): void
  /** Mark node as skipped and propagate skip to outgoing edges. */
  skipNode(nodeId: string): void
  /** Condition node completed: activate matching branch, skip unmatched branch. */
  resolveCondition(nodeId: string, branch: 'true' | 'false'): void
  /** Like resolveCondition, but for a condition used inside a loop: the loop
   *  branch's forward (escape) edge is left dormant rather than activated, so
   *  the escape node is not enqueued until maxIterations is exhausted. The
   *  opposite branch is activated as skipped. */
  resolveConditionLooping(nodeId: string, branch: 'true' | 'false'): void
  /** Get current status of a node. */
  getNodeStatus(nodeId: string): WorkflowNodeStatus
  /** True when all nodes are done, skipped, or errored (nothing running or pending). */
  isDone(): boolean
  /** Reset loop subgraph for re-execution. Returns the set of reset node IDs. */
  resetLoopSubgraph(loopTargetId: string, conditionId: string): ReadonlySet<string>
}

// ── Internal types ──────────────────────────────────────────

interface NodeState {
  node: WorkflowNode
  status: WorkflowNodeStatus
  /** Number of pending incoming forward edges not yet resolved. */
  pending: number
  /** Set of edge IDs that resolved as skipped. */
  skippedEdgeIds: Set<string>
  /** Set of all incoming forward edge IDs (for skip-rule evaluation). */
  incomingForwardEdgeIds: Set<string>
}

// ── Factory ──────────────────────────────────────────────────

export function createScheduler(
  nodes: ReadonlyArray<WorkflowNode>,
  edges: ReadonlyArray<WorkflowEdge>,
): EdgeScheduler {
  // Only forward edges drive the ready-queue / pending model. Loop edges
  // (edgeType === 'loop') are handled by the engine via resetLoopSubgraph, so
  // they are excluded from the scheduler's adjacency entirely.
  const forwardEdges: WorkflowEdge[] = []
  for (const edge of edges) {
    if (edge.edgeType !== 'loop') forwardEdges.push(edge)
  }

  // Build adjacency: outgoing forward edges per node
  const outgoing = new Map<string, WorkflowEdge[]>()
  for (const node of nodes) {
    outgoing.set(node.id, [])
  }
  for (const edge of forwardEdges) {
    const list = outgoing.get(edge.fromNodeId)
    if (list) list.push(edge)
  }

  // Build incoming forward edges per node
  const incomingForward = new Map<string, WorkflowEdge[]>()
  for (const node of nodes) {
    incomingForward.set(node.id, [])
  }
  for (const edge of forwardEdges) {
    const list = incomingForward.get(edge.toNodeId)
    if (list) list.push(edge)
  }

  // Initialize node states
  const stateMap = new Map<string, NodeState>()
  for (const node of nodes) {
    const incoming = incomingForward.get(node.id) ?? []
    const incomingIds = new Set<string>(incoming.map((e) => e.id))
    stateMap.set(node.id, {
      node,
      status: 'idle',
      pending: incoming.length,
      skippedEdgeIds: new Set(),
      incomingForwardEdgeIds: incomingIds,
    })
  }

  // Ready queue: nodes with 0 pending
  const readyQueue: string[] = []
  // Track count of non-terminal nodes for O(1) isDone()
  let activeCount = stateMap.size
  for (const [id, state] of stateMap) {
    if (state.pending === 0) {
      readyQueue.push(id)
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  function getState(nodeId: string): NodeState {
    const s = stateMap.get(nodeId)
    if (!s) throw new Error(`Unknown node: ${nodeId}`)
    return s
  }

  /**
   * Decrement pending for a downstream node via a specific edge.
   * If `skipped` is true, the edge is recorded as skipped.
   * When pending reaches 0, apply the skip rule and enqueue.
   */
  function activateEdge(edge: WorkflowEdge, skipped: boolean): void {
    const downstream = stateMap.get(edge.toNodeId)
    if (!downstream) return

    if (skipped) {
      downstream.skippedEdgeIds.add(edge.id)
    }

    downstream.pending = Math.max(0, downstream.pending - 1)

    if (downstream.pending === 0 && downstream.status === 'idle') {
      // Skip rule: node is skipped iff it has >=1 incoming edge AND all are skipped.
      // Root nodes (0 incoming) are never skipped by this rule.
      const allSkipped =
        downstream.incomingForwardEdgeIds.size > 0 &&
        downstream.skippedEdgeIds.size === downstream.incomingForwardEdgeIds.size
      if (allSkipped) {
        downstream.status = 'skipped'
        activeCount-- // track terminal transition
        // Propagate skip to all outgoing forward edges
        propagateSkip(downstream.node.id)
      } else {
        readyQueue.push(downstream.node.id)
      }
    }
  }

  /**
   * Propagate skip from a skipped node to all its outgoing forward edges.
   */
  function propagateSkip(nodeId: string): void {
    const edges = outgoing.get(nodeId) ?? []
    for (const edge of edges) {
      activateEdge(edge, true)
    }
  }

  /**
   * Activate all outgoing forward edges of a node as non-skipped.
   */
  function activateOutgoing(nodeId: string): void {
    const edges = outgoing.get(nodeId) ?? []
    for (const edge of edges) {
      activateEdge(edge, false)
    }
  }

  /**
   * Shared condition resolution: mark the condition done and activate its
   * outgoing forward edges by branch. When `keepMatchingDormant` is true (a
   * looping condition), the matching (loop) branch's forward edge — the escape —
   * is left dormant: its pending count is untouched so it never becomes ready
   * while iterating. The escape fires only when the engine resolves the
   * condition normally (keepMatchingDormant=false) at maxIterations exhaustion.
   */
  function resolveConditionEdges(
    nodeId: string,
    branch: 'true' | 'false',
    keepMatchingDormant: boolean,
  ): void {
    const state = getState(nodeId)
    if (state.status !== 'running') return // WF-5: guard against double-resolve
    state.status = 'done'
    activeCount--

    const edges = outgoing.get(nodeId) ?? []
    for (const edge of edges) {
      if (edge.branch === branch) {
        if (keepMatchingDormant) continue // loop branch: leave forward edge dormant
        activateEdge(edge, false) // matching branch: activate as non-skipped
      } else if (edge.branch !== undefined) {
        activateEdge(edge, true) // non-matching branch: activate as skipped
      } else {
        activateEdge(edge, false) // unconditional edge from condition: activate normally
      }
    }
  }

  // ── Scheduler interface ─────────────────────────────────

  return {
    getReady(): WorkflowNode[] {
      const result: WorkflowNode[] = []
      while (readyQueue.length > 0) {
        const id = readyQueue.shift()
        if (id === undefined) break
        const state = stateMap.get(id)
        if (state && state.status === 'idle') {
          state.status = 'running'
          result.push(state.node)
        }
      }
      return result
    },

    completeNode(nodeId: string): void {
      const state = getState(nodeId)
      if (state.status !== 'running') return // WF-5: guard against double-complete
      state.status = 'done'
      activeCount--
      activateOutgoing(nodeId)
    },

    failNode(nodeId: string): void {
      const state = getState(nodeId)
      if (state.status !== 'running') return // WF-5: guard against double-fail
      state.status = 'error'
      activeCount--
      // Do NOT activate outgoing edges — engine decides via continueOnError
    },

    skipNode(nodeId: string): void {
      const state = getState(nodeId)
      if (state.status === 'done' || state.status === 'error') return // WF-5: already resolved
      const wasActive =
        state.status === 'idle' || state.status === 'running' || state.status === 'paused'
      state.status = 'skipped'
      if (wasActive) activeCount--
      propagateSkip(nodeId)
    },

    resolveCondition(nodeId: string, branch: 'true' | 'false'): void {
      resolveConditionEdges(nodeId, branch, false)
    },

    resolveConditionLooping(nodeId: string, branch: 'true' | 'false'): void {
      resolveConditionEdges(nodeId, branch, true)
    },

    getNodeStatus(nodeId: string): WorkflowNodeStatus {
      return getState(nodeId).status
    },

    // O(1) isDone via activeCount tracking
    isDone(): boolean {
      return activeCount === 0
    },

    resetLoopSubgraph(loopTargetId: string, conditionId: string): ReadonlySet<string> {
      // 1. Identify subgraph: all nodes on forward paths from target to condition (inclusive)
      const subgraphIds = new Set<string>()
      findSubgraph(loopTargetId, conditionId, subgraphIds, new Set())

      if (subgraphIds.size === 0) return subgraphIds

      // 2. Compute intra-loop in-degree for each subgraph node
      //    (count incoming forward edges where the source is also in the subgraph)
      const intraLoopInDegree = new Map<string, number>()
      const intraLoopEdgeIds = new Map<string, Set<string>>()
      for (const id of subgraphIds) {
        let count = 0
        const edgeIds = new Set<string>()
        const incoming = incomingForward.get(id) ?? []
        for (const edge of incoming) {
          if (subgraphIds.has(edge.fromNodeId)) {
            count++
            edgeIds.add(edge.id)
          }
        }
        intraLoopInDegree.set(id, count)
        intraLoopEdgeIds.set(id, edgeIds)
      }

      // 3. Reset node states and re-enqueue those with 0 intra-loop in-degree
      for (const id of subgraphIds) {
        const state = stateMap.get(id)
        if (!state) continue

        const intraDegree = intraLoopInDegree.get(id) ?? 0
        // Re-increment activeCount for nodes transitioning from terminal → idle.
        // Running/paused nodes are already counted as active, so no re-increment needed.
        // Their old processNode promise will either: (a) complete and hit the status guard
        // in completeNode (status is no longer 'running'), or (b) be superseded by the
        // new execution after re-enqueue.
        if (state.status === 'done' || state.status === 'error' || state.status === 'skipped') {
          activeCount++
        }
        state.status = 'idle'
        state.pending = intraDegree
        state.skippedEdgeIds = new Set()
        // Update incoming forward edge IDs to only intra-loop edges
        state.incomingForwardEdgeIds = intraLoopEdgeIds.get(id) ?? new Set()

        if (intraDegree === 0) {
          readyQueue.push(id)
        }
      }

      // 4. Reset exit targets: nodes outside the subgraph that receive forward
      //    edges from subgraph nodes (typically the condition's exit edges).
      //    These may have been skipped — or only *partially* skip-activated — in
      //    a prior iteration and need to be re-activatable when the condition
      //    re-resolves. A target shared by two in-subgraph sources (e.g. one
      //    escape checkpoint fed by two sibling loop conditions) can sit 'idle'
      //    with a partially-decremented pending count; it must be restored too,
      //    or the repeated skip-activations of the non-looping sibling accumulate
      //    and fire the escape before the loop actually exhausts. Restore each
      //    exit target at most once, and only re-increment activeCount for a
      //    terminal (skipped/done) target — an 'idle' one never left the active set.
      const restoredExitTargets = new Set<string>()
      for (const id of subgraphIds) {
        const edges = outgoing.get(id) ?? []
        for (const edge of edges) {
          if (subgraphIds.has(edge.toNodeId)) continue // intra-loop, already handled
          const target = stateMap.get(edge.toNodeId)
          if (!target) continue
          // Don't disturb in-flight nodes; restore each target once per reset.
          if (target.status === 'running' || target.status === 'paused') continue
          if (restoredExitTargets.has(edge.toNodeId)) continue
          restoredExitTargets.add(edge.toNodeId)
          const wasTerminal = target.status === 'skipped' || target.status === 'done'

          // Restore the original incoming forward edge set and pending count
          const originalIncoming = incomingForward.get(edge.toNodeId) ?? []
          target.incomingForwardEdgeIds = new Set(originalIncoming.map((e) => e.id))
          target.pending = originalIncoming.length
          target.skippedEdgeIds = new Set()
          if (wasTerminal) activeCount++
          target.status = 'idle'

          // Re-apply any already-resolved edges from nodes outside the subgraph
          for (const inc of originalIncoming) {
            if (subgraphIds.has(inc.fromNodeId)) continue // will be re-resolved
            const source = stateMap.get(inc.fromNodeId)
            if (!source) continue
            if (
              source.status === 'done' ||
              source.status === 'skipped'
              // Note: 'error' is excluded — failNode deliberately does NOT
              // activate outgoing edges, so those edges were never decremented.
            ) {
              target.pending = Math.max(0, target.pending - 1)
              // If source was skipped, propagate skip info
              if (source.status === 'skipped') {
                target.skippedEdgeIds.add(inc.id)
              }
            }
          }
        }
      }

      return subgraphIds
    },
  }

  /**
   * Find all nodes on forward paths from `current` to `target` (inclusive).
   * Uses DFS with visited tracking to avoid infinite loops.
   */
  function findSubgraph(
    current: string,
    target: string,
    result: Set<string>,
    visited: Set<string>,
  ): boolean {
    if (visited.has(current)) return result.has(current)
    visited.add(current)

    if (current === target) {
      result.add(current)
      return true
    }

    const edges = outgoing.get(current) ?? []
    let onPath = false
    for (const edge of edges) {
      if (findSubgraph(edge.toNodeId, target, result, visited)) {
        onPath = true
      }
    }

    if (onPath) {
      result.add(current)
    }
    return onPath
  }
}
