import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from './logger'
import type { AgentType, Workflow, WorkflowNode } from '../shared/types'
import type { AppStore } from './project-store'
import { getRolesFromStore } from './project-store'
import { SEED_WORKFLOWS } from './workflow-seed-blueprints'
import { getWorkflowsDir, saveWorkflow } from './workflow-store'

const log = createLogger('workflow-seeds')

const WORKFLOW_SEED_VERSION = 4

export async function seedWorkflows(store: AppStore): Promise<void> {
  const prefs = store.get('appPrefs')
  const currentVersion = prefs.workflowSeedVersion ?? 0
  const rolesVersion = prefs.rolesSeedVersion ?? 0
  const lastRolesVersion = prefs.workflowLastRolesVersion ?? 0
  const rolesChanged = rolesVersion !== lastRolesVersion

  if (currentVersion >= WORKFLOW_SEED_VERSION && !rolesChanged) return

  const roles = getRolesFromStore(store)
  const roleMap = new Map<string, string>()
  for (const r of roles) {
    if (r.builtin) roleMap.set(r.name, r.id)
  }

  // Only delete old seed workflows on upgrade (not fresh install — nothing to delete)
  if (currentVersion > 0) {
    const dir = getWorkflowsDir()
    try {
      const files = await fs.promises.readdir(dir)
      for (const f of files) {
        if (f.startsWith('seed-wf-') && f.endsWith('.json')) {
          await fs.promises.rm(path.join(dir, f), { force: true })
        }
      }
      log.info('Cleared old seed workflows for upgrade')
    } catch (err) {
      log.warn('Failed to clean old seed workflows during upgrade', { err: String(err) })
    }
  }

  let count = 0
  for (const blueprint of SEED_WORKFLOWS) {
    const nodes: WorkflowNode[] = blueprint.nodes.map((n): WorkflowNode => {
      const base = { id: n.id, name: n.name, x: n.x, y: n.y }
      switch (n.type) {
        case 'agent': {
          const node: WorkflowNode = { ...base, type: 'agent' }
          if (n.agent !== undefined) node.agent = n.agent as AgentType
          if (n.agentFlags !== undefined) node.agentFlags = n.agentFlags
          if (n.prompt !== undefined) node.prompt = n.prompt
          if (n._roleName !== undefined) {
            const roleId = roleMap.get(n._roleName)
            if (roleId) node.roleId = roleId
            else
              log.warn('Seed workflow references unknown role', {
                role: n._roleName,
                workflow: blueprint.id,
              })
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
        case 'condition':
          return { ...base, type: 'condition' }
      }
    })

    const workflow: Workflow = {
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description,
      nodes,
      edges: blueprint.edges,
      variables: blueprint.variables,
      createdAt: 0,
      updatedAt: 0,
    }

    await saveWorkflow(workflow)
    count++
  }

  const freshPrefs = store.get('appPrefs')
  store.set('appPrefs', {
    ...freshPrefs,
    workflowSeedVersion: WORKFLOW_SEED_VERSION,
    workflowLastRolesVersion: rolesVersion,
  })
  log.info(`Seeded ${String(count)} built-in workflows (v${String(WORKFLOW_SEED_VERSION)})`)
}
