import { CH } from '../../shared/ipc-channels'
import crypto from 'node:crypto'
import { ipcMain } from 'electron'
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  renameWorkflow,
  deleteWorkflow,
} from '../workflow-store'
import { listRuns, deleteRun } from '../workflow-run-store'
import { validateWorkflow, validateRole, VARIABLE_NAME_RE } from '../../shared/workflow-utils'
import { toWslPath } from '../wsl-utils'
import type { WorkflowEngine } from '../workflow-engine'
import type { Role, Workflow, WorkflowExport } from '../../shared/types'
import { SAFE_ID_RE, validateId } from '../validation'

/**
 * Workflow IPC handlers: CRUD + execution (run, stop, resume) + export/import/duplicate.
 *
 * Uses a getter for workflowEngine because the instance is created after module load.
 * Optional getRoles/saveRole enable export/import with role bundling/remapping.
 */
export function registerWorkflowHandlers(
  getWorkflowEngine: () => WorkflowEngine | null,
  getRoles?: (() => Role[]) | undefined,
  saveRole?: ((role: Role) => void) | undefined,
): void {
  /* ── Workflow CRUD ──────────────────────────────────────────────── */
  ipcMain.handle(CH.workflowsList, () => listWorkflows())
  ipcMain.handle(CH.workflowsLoad, (_, id: string) => {
    validateId(id, 'workflow id')
    return loadWorkflow(id)
  })
  ipcMain.handle(CH.workflowsSave, (_, workflow: Workflow) => {
    if (!workflow || typeof workflow !== 'object') throw new Error('Invalid workflow')
    // IPC bypasses TS — id can be missing or empty at runtime despite the Workflow
    // type. Both signal a new workflow; saveWorkflow mints a UUID via `id || uuid()`.
    // When a non-empty id is present, enforce SAFE_ID_RE consistent with peer handlers.
    const id: unknown = (workflow as { id?: unknown }).id
    if (id !== undefined && id !== '') validateId(id, 'workflow id')
    return saveWorkflow(workflow)
  })
  ipcMain.handle(CH.workflowsRename, (_, id: string, name: string) => {
    validateId(id, 'workflow id')
    if (typeof name !== 'string' || !name.trim() || name.length > 200)
      throw new Error('Invalid workflow name')
    return renameWorkflow(id, name)
  })
  ipcMain.handle(CH.workflowsDelete, async (_, id: string) => {
    validateId(id, 'workflow id')
    // Stop running workflow before deleting to avoid orphaned PTYs
    getWorkflowEngine()?.stop(id)
    await deleteWorkflow(id)
  })

  /* ── Export / Import / Duplicate ─────────────────────────────── */

  ipcMain.handle(CH.workflowsExport, async (_, id: string): Promise<WorkflowExport> => {
    validateId(id, 'workflow id')
    const workflow = await loadWorkflow(id)
    if (!workflow) throw new Error('Workflow not found')

    // Bundle all referenced roles (both custom and builtin)
    const allRoles = getRoles?.() ?? []
    const referencedRoleIds = new Set(
      workflow.nodes
        .map((n) => (n.type === 'agent' ? n.roleId : undefined))
        .filter((rid): rid is string => typeof rid === 'string'),
    )
    const roles = allRoles.filter((r) => referencedRoleIds.has(r.id))

    return { formatVersion: 1, workflow, roles }
  })

  ipcMain.handle(
    CH.workflowsImport,
    async (
      _,
      data: unknown,
      roleStrategy: unknown,
    ): Promise<{ workflow: Workflow; warnings: string[] }> => {
      // Validate input structure
      if (!data || typeof data !== 'object') throw new Error('Invalid import data')
      const d = data as Record<string, unknown>
      if (d.formatVersion !== 1) throw new Error('Unsupported format version')
      if (!d.workflow || typeof d.workflow !== 'object') throw new Error('Missing workflow')
      if (!Array.isArray(d.roles)) throw new Error('Missing roles array')

      const importedWorkflow = d.workflow as Workflow
      const importedRoles = d.roles as unknown[]

      // Validate each imported role's fields before trusting them
      for (const rawRole of importedRoles) {
        const roleErr = validateRole(rawRole)
        if (roleErr) throw new Error(`Invalid bundled role: ${roleErr}`)
      }
      const validatedRoles = importedRoles as Role[]
      const strategy =
        roleStrategy && typeof roleStrategy === 'object' && !Array.isArray(roleStrategy)
          ? (roleStrategy as Record<string, 'skip' | 'copy'>)
          : {}

      // Validate workflow structure
      const validation = validateWorkflow(importedWorkflow)
      if (validation.errors.length > 0) {
        throw new Error(`Invalid workflow: ${validation.errors.join('; ')}`)
      }

      const warnings: string[] = []
      const existingRoles = getRoles?.() ?? []
      const existingByName = new Map(existingRoles.map((r) => [r.name, r]))

      // Role remapping: oldId → newId
      const roleIdMap = new Map<string, string>()

      for (const role of validatedRoles) {
        if (role.builtin) {
          // Builtin: match by name to local builtin
          const local = existingRoles.find((r) => r.builtin && r.name === role.name)
          if (local) {
            roleIdMap.set(role.id, local.id)
          } else {
            warnings.push(
              `Builtin role "${role.name}" not found locally — roleId cleared on affected nodes`,
            )
            roleIdMap.set(role.id, '') // empty = clear
          }
        } else {
          const existing = existingByName.get(role.name)
          if (existing) {
            // Conflict: use strategy to decide
            const strat = strategy[role.id] ?? 'skip'
            if (strat === 'skip') {
              roleIdMap.set(role.id, existing.id)
            } else {
              // Copy: new UUID, save with (imported) suffix
              const newId = crypto.randomUUID()
              const newRole: Role = { ...role, id: newId, name: `${role.name} (imported)` }
              saveRole?.(newRole)
              roleIdMap.set(role.id, newId)
            }
          } else {
            // No conflict: import directly with new UUID
            const newId = crypto.randomUUID()
            const newRole: Role = { ...role, id: newId }
            saveRole?.(newRole)
            roleIdMap.set(role.id, newId)
          }
        }
      }

      // Remap roleIds + sanitize permission on imported agent nodes.
      const remappedNodes = importedWorkflow.nodes.map((n) => {
        if (n.type !== 'agent') return n
        let node = n
        // Security: never trust a 'full' (sandbox/approval-bypass) permission
        // from an imported file — downgrade to 'edit'. Full maps to
        // --dangerously-skip-permissions / --dangerously-bypass-approvals-and-
        // sandbox, so a shared workflow could otherwise run an agent with no
        // sandbox on the first run. Full stays available only on nodes the user
        // sets deliberately in the editor.
        if (node.permission === 'full') {
          node = { ...node, permission: 'edit' }
          warnings.push(
            `Node "${node.name}": full-access permission was downgraded to "edit" on import`,
          )
        }
        if (node.roleId) {
          const newId = roleIdMap.get(node.roleId)
          if (newId === '')
            node = { ...node, roleId: undefined } // cleared
          else if (newId) node = { ...node, roleId: newId }
        }
        return node
      })

      // Save with new UUID and (imported) suffix
      const newWorkflow: Workflow = {
        ...importedWorkflow,
        id: crypto.randomUUID(),
        name: `${importedWorkflow.name} (imported)`,
        nodes: remappedNodes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const saved = await saveWorkflow(newWorkflow)
      return { workflow: saved, warnings }
    },
  )

  ipcMain.handle(CH.workflowsDuplicate, async (_, id: string): Promise<Workflow> => {
    validateId(id, 'workflow id')
    const workflow = await loadWorkflow(id)
    if (!workflow) throw new Error('Workflow not found')

    const clone: Workflow = {
      ...structuredClone(workflow),
      id: crypto.randomUUID(),
      name: `${workflow.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return saveWorkflow(clone)
  })

  /* ── Workflow Run History ──────────────────────────────────────── */

  ipcMain.handle(CH.workflowsListRuns, async (_, workflowId: string) => {
    validateId(workflowId, 'workflow id')
    return listRuns(workflowId)
  })

  ipcMain.handle(CH.workflowsDeleteRun, async (_, runId: string) => {
    validateId(runId, 'run id')
    return deleteRun(runId)
  })

  /* ── Workflow State Hydration ───────────────────────────────────── */
  ipcMain.handle(CH.workflowsGetRunning, () => {
    return getWorkflowEngine()?.getRunningWorkflows() ?? []
  })

  /* ── Workflow Execution ────────────────────────────────────────── */
  ipcMain.handle(
    CH.workflowRun,
    async (_, workflowId: string, projectPath?: string, variables?: Record<string, string>) => {
      // Validate workflowId before filesystem access
      validateId(workflowId, 'workflow id')
      const workflow = await loadWorkflow(workflowId)
      if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)
      const engine = getWorkflowEngine()
      if (!engine) throw new Error('Workflow engine not initialized')
      // Validate workflow structure before execution
      const validation = validateWorkflow(workflow)
      if (validation.errors.length > 0) {
        throw new Error(`Invalid workflow: ${validation.errors.join('; ')}`)
      }
      // Convert Windows path to WSL if needed (projects store Windows paths)
      const wslPath = projectPath ? toWslPath(projectPath) : undefined
      // Validate projectPath — must be absolute WSL path, no traversal or shell metacharacters.
      // The workflow engine's shellQuote handles safe quoting; this rejects obviously malicious input.
      if (wslPath !== undefined) {
        if (typeof wslPath !== 'string' || wslPath.length > 1024 || !wslPath.startsWith('/')) {
          throw new Error(`Invalid project path: must be an absolute WSL path`)
        }
        if (/(?:^|\/)\.\.(?:\/|$)/.test(wslPath)) {
          throw new Error(`Invalid project path: path traversal not allowed`)
        }
      }
      // Validate variables if provided
      if (variables !== undefined && variables !== null) {
        if (typeof variables !== 'object' || Array.isArray(variables)) {
          throw new Error('Variables must be an object')
        }
        for (const [key, val] of Object.entries(variables)) {
          if (typeof key !== 'string' || !VARIABLE_NAME_RE.test(key)) {
            throw new Error(`Invalid variable name: ${key}`)
          }
          if (typeof val !== 'string') {
            throw new Error(`Variable ${key} must be a string value`)
          }
          if (val.length > 10000) {
            throw new Error(`Variable ${key} value exceeds 10000 chars`)
          }
        }
      }
      engine.run(workflow, wslPath, variables ?? undefined)
    },
  )

  // Channel namespace convention: CRUD operations use the plural `workflows:*`
  // (workflows:list, workflows:save, workflows:run, etc.) while engine execution
  // uses the singular `workflow:*` (workflow:stop, workflow:resume, and the
  // per-run push channel `workflow:event:<id>`). The preload unifies both under
  // `window.agentDeck.workflows`. Keep the singular form for execution-related
  // channels added in the future.
  ipcMain.handle(CH.workflowStop, (_, workflowId: string) => {
    if (typeof workflowId !== 'string' || !SAFE_ID_RE.test(workflowId)) return
    getWorkflowEngine()?.stop(workflowId)
  })

  ipcMain.handle(CH.workflowResume, (_, workflowId: string, nodeId: string) => {
    if (typeof workflowId !== 'string' || !SAFE_ID_RE.test(workflowId)) return
    if (typeof nodeId !== 'string' || !SAFE_ID_RE.test(nodeId)) return
    getWorkflowEngine()?.resume(workflowId, nodeId)
  })
}
