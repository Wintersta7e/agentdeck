import type { Workflow, WorkflowNode, WorkflowNodeType, WorkflowEdge } from './types'
import { KNOWN_AGENT_IDS } from './agents'

const VALID_NODE_TYPES = new Set<WorkflowNodeType>(['agent', 'shell', 'checkpoint'])

/** Max field lengths for workflow validation */
const MAX_NAME = 200
const MAX_DESCRIPTION = 2000
const MAX_COMMAND = 10000
const MAX_PROMPT = 10000
const MAX_NODES = 100
const MAX_EDGES = 500
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/

/**
 * Runtime validation of a workflow loaded from disk (C2).
 * Throws descriptive error if the structure is invalid or fields exceed limits.
 */
export function validateWorkflow(w: unknown): w is Workflow {
  if (!w || typeof w !== 'object') throw new Error('Workflow is not an object')
  const wf = w as Record<string, unknown>
  if (typeof wf.id !== 'string' || !SAFE_ID_RE.test(wf.id))
    throw new Error(`Invalid workflow id: ${String(wf.id)}`)
  if (typeof wf.name !== 'string') throw new Error('Workflow name must be a string')
  if (wf.name.length > MAX_NAME) throw new Error(`Workflow name exceeds ${MAX_NAME} chars`)
  if (wf.description !== undefined && typeof wf.description !== 'string')
    throw new Error('Workflow description must be a string')
  if (typeof wf.description === 'string' && wf.description.length > MAX_DESCRIPTION)
    throw new Error(`Workflow description exceeds ${MAX_DESCRIPTION} chars`)
  if (!Array.isArray(wf.nodes)) throw new Error('Workflow nodes must be an array')
  if (wf.nodes.length > MAX_NODES) throw new Error(`Workflow exceeds ${MAX_NODES} nodes`)
  if (!Array.isArray(wf.edges)) throw new Error('Workflow edges must be an array')
  if ((wf.edges as unknown[]).length > MAX_EDGES)
    throw new Error(`Workflow exceeds ${MAX_EDGES} edges`)
  for (const n of wf.nodes as Record<string, unknown>[]) {
    if (typeof n.id !== 'string') throw new Error('Node id must be a string')
    if (!VALID_NODE_TYPES.has(n.type as WorkflowNodeType))
      throw new Error(`Invalid node type: ${String(n.type)}`)
    if (typeof n.name !== 'string') throw new Error('Node name must be a string')
    if (n.name.length > MAX_NAME) throw new Error(`Node name exceeds ${MAX_NAME} chars`)
    if (n.command !== undefined && typeof n.command === 'string' && n.command.length > MAX_COMMAND)
      throw new Error(`Node command exceeds ${MAX_COMMAND} chars`)
    if (n.prompt !== undefined && typeof n.prompt === 'string' && n.prompt.length > MAX_PROMPT)
      throw new Error(`Node prompt exceeds ${MAX_PROMPT} chars`)
    if (n.agent !== undefined && typeof n.agent === 'string' && !KNOWN_AGENT_IDS.has(n.agent))
      throw new Error(`Unknown agent: ${n.agent}`)
    if (n.roleId !== undefined && n.roleId !== null && typeof n.roleId !== 'string')
      throw new Error('Node roleId must be a string')
    if (typeof n.roleId === 'string' && n.roleId.length > MAX_NAME)
      throw new Error(`Node roleId exceeds ${MAX_NAME} chars`)
    if (
      n.timeout !== undefined &&
      (typeof n.timeout !== 'number' ||
        !isFinite(n.timeout) ||
        n.timeout < 1000 ||
        n.timeout > 86400000)
    ) {
      throw new Error('Node timeout must be between 1000ms and 86400000ms (24h)')
    }
  }

  // C6: Validate edge references
  const nodeIds = new Set((wf.nodes as Record<string, unknown>[]).map((n) => n.id as string))
  for (const e of wf.edges as { id: string; fromNodeId: string; toNodeId: string }[]) {
    if (!nodeIds.has(e.fromNodeId))
      throw new Error(`Edge ${e.id} references non-existent node: ${e.fromNodeId}`)
    if (!nodeIds.has(e.toNodeId))
      throw new Error(`Edge ${e.id} references non-existent node: ${e.toNodeId}`)
  }

  return true
}

/** Topological sort -- returns array of tiers (each tier = parallel batch) */
export function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
  const inDegree = new Map<string, number>()
  const downstream = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    downstream.set(n.id, [])
  }
  for (const e of edges) {
    inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) ?? 0) + 1)
    downstream.get(e.fromNodeId)?.push(e.toNodeId)
  }

  const tiers: WorkflowNode[][] = []
  let remaining = [...nodes]

  while (remaining.length > 0) {
    const tier = remaining.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    if (tier.length === 0) throw new Error('Circular dependency detected in workflow')
    tiers.push(tier)
    for (const n of tier) {
      for (const dep of downstream.get(n.id) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1)
      }
    }
    const tierIds = new Set(tier.map((n) => n.id))
    remaining = remaining.filter((n) => !tierIds.has(n.id))
  }

  return tiers
}
