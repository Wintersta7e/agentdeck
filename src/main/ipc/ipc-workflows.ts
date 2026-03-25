import { ipcMain } from 'electron'
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  renameWorkflow,
  deleteWorkflow,
} from '../workflow-store'
import { validateWorkflow } from '../../shared/workflow-utils'
import { toWslPath } from '../wsl-utils'
import type { WorkflowEngine } from '../workflow-engine'
import type { Workflow } from '../../shared/types'

/**
 * Workflow IPC handlers: CRUD + execution (run, stop, resume).
 *
 * Uses a getter for workflowEngine because the instance is created after module load.
 */
export function registerWorkflowHandlers(getWorkflowEngine: () => WorkflowEngine | null): void {
  /* ── Workflow CRUD ──────────────────────────────────────────────── */
  ipcMain.handle('workflows:list', () => listWorkflows())
  ipcMain.handle('workflows:load', (_, id: string) => loadWorkflow(id))
  ipcMain.handle('workflows:save', (_, workflow: Workflow) => saveWorkflow(workflow))
  ipcMain.handle('workflows:rename', (_, id: string, name: string) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid workflow id')
    if (typeof name !== 'string' || !name.trim() || name.length > 200)
      throw new Error('Invalid workflow name')
    return renameWorkflow(id, name)
  })
  ipcMain.handle('workflows:delete', async (_, id: string) => {
    // C6: Stop running workflow before deleting to avoid orphaned PTYs
    getWorkflowEngine()?.stop(id)
    await deleteWorkflow(id)
  })

  /* ── Workflow Execution ────────────────────────────────────────── */
  const VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/

  ipcMain.handle(
    'workflow:run',
    async (_, workflowId: string, projectPath?: string, variables?: Record<string, string>) => {
      const workflow = await loadWorkflow(workflowId)
      if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)
      const engine = getWorkflowEngine()
      if (!engine) throw new Error('Workflow engine not initialized')
      // C2: Validate workflow structure before execution
      const validation = validateWorkflow(workflow)
      if (validation.errors.length > 0) {
        throw new Error(`Invalid workflow: ${validation.errors.join('; ')}`)
      }
      // Convert Windows path to WSL if needed (projects store Windows paths)
      const wslPath = projectPath ? toWslPath(projectPath) : undefined
      // C2: Validate projectPath — must be absolute WSL path, no traversal or shell metacharacters.
      // The workflow engine's shellQuote handles safe quoting; this rejects obviously malicious input.
      if (wslPath !== undefined) {
        if (typeof wslPath !== 'string' || wslPath.length > 1024 || !wslPath.startsWith('/')) {
          throw new Error(`Invalid project path: must be an absolute WSL path`)
        }
        if (wslPath.includes('..')) {
          throw new Error(`Invalid project path: path traversal not allowed`)
        }
      }
      // Validate variables if provided
      if (variables !== undefined && variables !== null) {
        if (typeof variables !== 'object' || Array.isArray(variables)) {
          throw new Error('Variables must be an object')
        }
        for (const [key, val] of Object.entries(variables)) {
          if (typeof key !== 'string' || !VAR_NAME_RE.test(key)) {
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

  ipcMain.handle('workflow:stop', (_, workflowId: string) => {
    if (typeof workflowId !== 'string' || !workflowId) return
    getWorkflowEngine()?.stop(workflowId)
  })

  ipcMain.handle('workflow:resume', (_, workflowId: string, nodeId: string) => {
    if (typeof workflowId !== 'string' || !workflowId) return
    if (typeof nodeId !== 'string' || !nodeId) return
    getWorkflowEngine()?.resume(workflowId, nodeId)
  })
}
