import type { AgentType, WorkflowNode } from '../shared/types'
import type { SeedNode } from './workflow-seed-blueprints'

/**
 * Materialize a single blueprint SeedNode into a runnable WorkflowNode.
 *
 * Shared by the production seeder (workflow-seeds.ts) and the blueprint
 * validation test so the two can never drift on which fields round-trip —
 * every base + variant field is copied in exactly one place.
 *
 * Role resolution is optional: pass `roleMap` (builtin role name → id) to
 * resolve `_roleName` into `roleId`; `onMissingRole` is invoked when a name has
 * no match. The test omits both (it validates structure, not role wiring).
 */
export function materializeSeedNode(
  n: SeedNode,
  roleMap?: Map<string, string>,
  onMissingRole?: (roleName: string) => void,
): WorkflowNode {
  const base: Pick<WorkflowNode, 'id' | 'name' | 'x' | 'y'> &
    Partial<Pick<WorkflowNode, 'continueOnError' | 'timeout' | 'retryCount' | 'retryDelayMs'>> = {
    id: n.id,
    name: n.name,
    x: n.x,
    y: n.y,
  }
  if (n.continueOnError !== undefined) base.continueOnError = n.continueOnError
  if (n.timeout !== undefined) base.timeout = n.timeout
  if (n.retryCount !== undefined) base.retryCount = n.retryCount
  if (n.retryDelayMs !== undefined) base.retryDelayMs = n.retryDelayMs
  switch (n.type) {
    case 'agent': {
      const node: WorkflowNode = { ...base, type: 'agent' }
      if (n.agent !== undefined) node.agent = n.agent as AgentType
      if (n.agentFlags !== undefined) node.agentFlags = n.agentFlags
      if (n.prompt !== undefined) node.prompt = n.prompt
      if (n.skillId !== undefined) node.skillId = n.skillId
      if (n.permission !== undefined) node.permission = n.permission
      if (n._roleName !== undefined && roleMap) {
        const roleId = roleMap.get(n._roleName)
        if (roleId) node.roleId = roleId
        else onMissingRole?.(n._roleName)
      }
      return node
    }
    case 'shell': {
      const node: WorkflowNode = { ...base, type: 'shell' }
      if (n.command !== undefined) node.command = n.command
      return node
    }
    case 'checkpoint': {
      const node: WorkflowNode = { ...base, type: 'checkpoint' }
      if (n.message !== undefined) node.message = n.message
      return node
    }
    case 'condition': {
      const node: WorkflowNode = { ...base, type: 'condition' }
      if (n.conditionMode !== undefined) node.conditionMode = n.conditionMode
      if (n.conditionPattern !== undefined) node.conditionPattern = n.conditionPattern
      return node
    }
  }
}
