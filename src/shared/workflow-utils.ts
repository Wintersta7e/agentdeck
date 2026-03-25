import type { WorkflowNode, WorkflowNodeType, WorkflowEdge, ValidationResult } from './types'
import { KNOWN_AGENT_IDS } from './agents'

const VALID_NODE_TYPES = new Set<WorkflowNodeType>(['agent', 'shell', 'checkpoint', 'condition'])

/** Max field lengths for workflow validation */
const MAX_NAME = 200
const MAX_DESCRIPTION = 2000
const MAX_COMMAND = 10000
const MAX_PROMPT = 10000
const MAX_NODES = 100
const MAX_EDGES = 500
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/
const VARIABLE_NAME_RE = /^[A-Z_][A-Z0-9_]*$/

/**
 * Runtime validation of a workflow loaded from disk (C2).
 * Returns structured errors and warnings instead of throwing.
 */
export function validateWorkflow(w: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!w || typeof w !== 'object') {
    errors.push('Workflow is not an object')
    return { errors, warnings }
  }
  const wf = w as Record<string, unknown>

  if (typeof wf.id !== 'string' || !SAFE_ID_RE.test(wf.id))
    errors.push(`Invalid workflow id: ${String(wf.id)}`)
  if (typeof wf.name !== 'string') errors.push('Workflow name must be a string')
  else if (wf.name.length > MAX_NAME) errors.push(`Workflow name exceeds ${MAX_NAME} chars`)
  if (wf.description !== undefined && typeof wf.description !== 'string')
    errors.push('Workflow description must be a string')
  if (typeof wf.description === 'string' && wf.description.length > MAX_DESCRIPTION)
    errors.push(`Workflow description exceeds ${MAX_DESCRIPTION} chars`)

  if (!Array.isArray(wf.nodes)) {
    errors.push('Workflow nodes must be an array')
    return { errors, warnings }
  }
  if (wf.nodes.length > MAX_NODES) errors.push(`Workflow exceeds ${MAX_NODES} nodes`)

  if (!Array.isArray(wf.edges)) {
    errors.push('Workflow edges must be an array')
    return { errors, warnings }
  }
  if ((wf.edges as unknown[]).length > MAX_EDGES) errors.push(`Workflow exceeds ${MAX_EDGES} edges`)

  const nodes = wf.nodes as Record<string, unknown>[]
  const edges = wf.edges as {
    id: string
    fromNodeId: string
    toNodeId: string
    branch?: string
    edgeType?: string
    maxIterations?: unknown
  }[]

  // Build node lookup maps for cross-referencing
  const nodeMap = new Map<string, Record<string, unknown>>()
  for (const n of nodes) {
    if (typeof n.id === 'string') nodeMap.set(n.id, n)
  }

  // ── Node validation ──────────────────────────────────────────
  for (const n of nodes) {
    if (typeof n.id !== 'string') {
      errors.push('Node id must be a string')
      continue
    }
    if (!VALID_NODE_TYPES.has(n.type as WorkflowNodeType))
      errors.push(`Invalid node type: ${String(n.type)}`)
    if (typeof n.name !== 'string') errors.push('Node name must be a string')
    else if (n.name.length > MAX_NAME) errors.push(`Node name exceeds ${MAX_NAME} chars`)
    if (n.command !== undefined && typeof n.command === 'string' && n.command.length > MAX_COMMAND)
      errors.push(`Node command exceeds ${MAX_COMMAND} chars`)
    if (n.prompt !== undefined && typeof n.prompt === 'string' && n.prompt.length > MAX_PROMPT)
      errors.push(`Node prompt exceeds ${MAX_PROMPT} chars`)
    if (n.agent !== undefined && typeof n.agent === 'string' && !KNOWN_AGENT_IDS.has(n.agent))
      errors.push(`Unknown agent: ${n.agent}`)
    if (n.roleId !== undefined && n.roleId !== null && typeof n.roleId !== 'string')
      errors.push('Node roleId must be a string')
    if (typeof n.roleId === 'string' && n.roleId.length > MAX_NAME)
      errors.push(`Node roleId exceeds ${MAX_NAME} chars`)
    if (
      n.timeout !== undefined &&
      (typeof n.timeout !== 'number' ||
        !isFinite(n.timeout) ||
        n.timeout < 1000 ||
        n.timeout > 86400000)
    ) {
      errors.push('Node timeout must be between 1000ms and 86400000ms (24h)')
    }

    // ── Retry validation (agent/shell only) ──────────────────
    if (n.retryCount !== undefined) {
      const nodeType = n.type as string
      if (nodeType === 'checkpoint' || nodeType === 'condition') {
        errors.push(`retryCount not allowed on ${nodeType} node "${String(n.id)}"`)
      } else if (
        typeof n.retryCount !== 'number' ||
        !Number.isInteger(n.retryCount) ||
        n.retryCount < 1 ||
        n.retryCount > 5
      ) {
        errors.push(`retryCount must be 1-5 on node "${String(n.id)}"`)
      }
    }
    if (n.retryDelayMs !== undefined) {
      if (
        typeof n.retryDelayMs !== 'number' ||
        !Number.isFinite(n.retryDelayMs) ||
        n.retryDelayMs < 100 ||
        n.retryDelayMs > 60000
      ) {
        errors.push(`retryDelayMs must be 100-60000 on node "${String(n.id)}"`)
      }
    }

    // ── Condition node validation ────────────────────────────
    if (n.type === 'condition') {
      const validModes = ['exitCode', 'outputMatch']
      if (!validModes.includes(n.conditionMode as string)) {
        errors.push(
          `Condition node "${String(n.id)}" must have conditionMode 'exitCode' or 'outputMatch'`,
        )
      }

      // Exactly 1 incoming non-loop edge
      const incomingEdges = edges.filter((e) => e.toNodeId === n.id && e.edgeType !== 'loop')
      if (incomingEdges.length === 0) {
        errors.push(`Condition node "${String(n.id)}" must have exactly 1 incoming edge (has 0)`)
      } else if (incomingEdges.length > 1) {
        errors.push(
          `Condition node "${String(n.id)}" must have exactly 1 incoming edge (has ${String(incomingEdges.length)})`,
        )
      }

      // exitCode: upstream must be agent or shell
      if (n.conditionMode === 'exitCode' && incomingEdges.length === 1) {
        const inEdge = incomingEdges[0]
        const upstream = inEdge ? nodeMap.get(inEdge.fromNodeId) : undefined
        if (upstream && upstream.type !== 'agent' && upstream.type !== 'shell') {
          errors.push(
            `exitCode condition "${String(n.id)}" requires agent/shell upstream, got "${String(upstream.type)}"`,
          )
        }
      }

      // outputMatch: pattern must be non-empty valid regex
      if (n.conditionMode === 'outputMatch') {
        if (typeof n.conditionPattern !== 'string' || n.conditionPattern.length === 0) {
          errors.push(`outputMatch condition "${String(n.id)}" requires non-empty conditionPattern`)
        } else {
          try {
            new RegExp(n.conditionPattern)
          } catch {
            errors.push(
              `Invalid regex in conditionPattern for node "${String(n.id)}": ${String(n.conditionPattern)}`,
            )
          }
        }
      }

      // Must have at least 1 outgoing edge
      const outgoingEdges = edges.filter((e) => e.fromNodeId === n.id)
      if (outgoingEdges.length === 0) {
        errors.push(`Condition node "${String(n.id)}" must have at least 1 outgoing edge`)
      }
    }
  }

  // ── Edge validation ──────────────────────────────────────────
  const nodeIds = new Set(nodeMap.keys())

  // Track branch values per condition node for fan-out warning
  const branchesPerCondition = new Map<string, Map<string, number>>()

  for (const e of edges) {
    if (!nodeIds.has(e.fromNodeId))
      errors.push(`Edge ${e.id} references non-existent node: ${e.fromNodeId}`)
    if (!nodeIds.has(e.toNodeId))
      errors.push(`Edge ${e.id} references non-existent node: ${e.toNodeId}`)

    const fromNode = nodeMap.get(e.fromNodeId)

    // Branch field validation
    if (e.branch !== undefined) {
      if (e.branch !== 'true' && e.branch !== 'false') {
        errors.push(`Edge ${e.id} branch must be 'true' or 'false'`)
      }
      if (fromNode && fromNode.type !== 'condition') {
        errors.push(`Edge ${e.id} has branch but fromNodeId is not a condition node`)
      }
      // Track for fan-out warning
      if (fromNode && fromNode.type === 'condition') {
        if (!branchesPerCondition.has(e.fromNodeId)) {
          branchesPerCondition.set(e.fromNodeId, new Map())
        }
        const counts = branchesPerCondition.get(e.fromNodeId) ?? new Map<string, number>()
        counts.set(e.branch, (counts.get(e.branch) ?? 0) + 1)
        branchesPerCondition.set(e.fromNodeId, counts)
      }
    }

    // Loop edge validation
    if (e.edgeType === 'loop') {
      if (e.branch === undefined) {
        errors.push(`Loop edge ${e.id} requires a branch field`)
      }
      if (
        e.maxIterations === undefined ||
        typeof e.maxIterations !== 'number' ||
        !Number.isInteger(e.maxIterations) ||
        e.maxIterations < 1 ||
        e.maxIterations > 20
      ) {
        errors.push(`Loop edge ${e.id} requires maxIterations (1-20)`)
      }
      if (fromNode && fromNode.type !== 'condition') {
        errors.push(`Loop edge ${e.id} fromNodeId must be a condition node`)
      }
    }
  }

  // ── Fan-out warnings ───────────────────────────────────────
  for (const [nodeId, counts] of branchesPerCondition) {
    for (const [branch, count] of counts) {
      if (count > 1) {
        warnings.push(
          `Condition node "${nodeId}" has ${String(count)} edges with branch="${branch}"`,
        )
      }
    }
  }

  // ── Variable validation ────────────────────────────────────
  if (wf.variables !== undefined && Array.isArray(wf.variables)) {
    const seenNames = new Set<string>()
    for (const v of wf.variables as Record<string, unknown>[]) {
      const name = v.name as string | undefined
      if (typeof name !== 'string' || !VARIABLE_NAME_RE.test(name)) {
        errors.push(`Variable name "${String(name)}" must match /^[A-Z_][A-Z0-9_]*$/`)
      } else {
        if (seenNames.has(name)) {
          errors.push(`Duplicate variable name: "${name}"`)
        }
        seenNames.add(name)
      }
      if (v.type === 'choice') {
        if (!Array.isArray(v.choices) || v.choices.length === 0) {
          errors.push(`Choice variable "${String(name)}" must have a non-empty choices array`)
        }
      }
    }
  }

  return { errors, warnings }
}

/** Topological sort -- returns array of tiers (each tier = parallel batch) */
export function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
  // Loop-back edges are not part of the DAG -- exclude them so they don't
  // inflate in-degrees and trigger false "circular dependency" errors.
  const forwardEdges = edges.filter((e) => e.edgeType !== 'loop')

  const inDegree = new Map<string, number>()
  const downstream = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    downstream.set(n.id, [])
  }
  for (const e of forwardEdges) {
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
