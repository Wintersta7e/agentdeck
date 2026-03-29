import { useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { handleIpcError } from '../../utils/ipcErrorHandler'
import type { Workflow, Project, WorkflowExport } from '../../../shared/types'

interface WorkflowActions {
  runWorkflow: (variables?: Record<string, string>) => void
  handleExport: () => Promise<void>
  handleImport: () => void
  handleDuplicate: () => Promise<void>
}

export function useWorkflowActions(
  workflowId: string,
  workflow: Workflow | null,
  flushSave: () => Promise<void>,
  projects: Project[],
): WorkflowActions {
  const addNotification = useAppStore((s) => s.addNotification)

  const runWorkflow = useCallback(
    (variables?: Record<string, string>) => {
      useAppStore.getState().resetWorkflowExecution(workflowId)
      useAppStore.getState().setWorkflowStatus(workflowId, 'running')
      // Resolve project path from workflow's projectId (if any)
      const projectPath = workflow?.projectId
        ? projects.find((p) => p.id === workflow.projectId)?.path
        : undefined
      // H8: Flush pending auto-save so engine reads latest, H9: catch errors
      flushSave()
        .then(() => window.agentDeck.workflows.run(workflowId, projectPath, variables))
        .catch((err: unknown) => {
          window.agentDeck.log.send('error', 'workflow-editor', 'Workflow run failed', {
            err: String(err),
            workflowId,
          })
          handleIpcError(err, 'Workflow run failed')
          const s = useAppStore.getState()
          s.setWorkflowStatus(workflowId, 'error')
          s.addWorkflowLog(workflowId, {
            id: `err-${Date.now()}`,
            workflowId,
            type: 'workflow:error',
            message: `Run failed: ${String(err)}`,
            timestamp: Date.now(),
          })
        })
    },
    [workflowId, flushSave, workflow, projects],
  )

  const handleExport = useCallback(async () => {
    try {
      const data = await window.agentDeck.workflows.export(workflowId)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${workflow?.name ?? 'workflow'}.agentdeck-workflow.json`
      a.click()
      URL.revokeObjectURL(url)
      addNotification('info', 'Workflow exported')
    } catch (err) {
      handleIpcError(err, 'Failed to export workflow')
    }
  }, [workflowId, workflow, addNotification])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data: unknown = JSON.parse(text)

        // Validate basic structure
        if (
          typeof data !== 'object' ||
          data === null ||
          !('formatVersion' in data) ||
          (data as { formatVersion: unknown }).formatVersion !== 1 ||
          !('workflow' in data) ||
          !('roles' in data) ||
          !Array.isArray((data as { roles: unknown }).roles)
        ) {
          addNotification('error', 'Invalid workflow file format')
          return
        }

        const exportData = data as WorkflowExport

        // Check for role conflicts — default to 'skip' for matching names
        const existingRoles = await window.agentDeck.store.getRoles()
        const existingNames = new Set(existingRoles.map((r) => r.name))
        const roleStrategy: Record<string, 'skip' | 'copy'> = {}
        for (const r of exportData.roles) {
          if (!r.builtin && existingNames.has(r.name)) {
            roleStrategy[r.id] = 'skip'
          }
        }

        const result = await window.agentDeck.workflows.import(exportData, roleStrategy)
        addNotification('info', `Imported "${result.workflow.name}"`)
        if (result.warnings.length > 0) {
          addNotification('info', `Warnings: ${result.warnings.join(', ')}`)
        }

        // Refresh workflow list and open the imported workflow
        const workflows = await window.agentDeck.workflows.list()
        useAppStore.getState().setWorkflows(workflows)
        useAppStore.getState().openWorkflow(result.workflow.id)
      } catch (err) {
        handleIpcError(err, 'Failed to import workflow')
      }
    }
    input.click()
  }, [addNotification])

  const handleDuplicate = useCallback(async () => {
    try {
      const newWf = await window.agentDeck.workflows.duplicate(workflowId)
      addNotification('info', `Duplicated as "${newWf.name}"`)

      // Refresh workflow list and open the new workflow
      const workflows = await window.agentDeck.workflows.list()
      useAppStore.getState().setWorkflows(workflows)
      useAppStore.getState().openWorkflow(newWf.id)
    } catch (err) {
      handleIpcError(err, 'Failed to duplicate workflow')
    }
  }, [workflowId, addNotification])

  return { runWorkflow, handleExport, handleImport, handleDuplicate }
}
