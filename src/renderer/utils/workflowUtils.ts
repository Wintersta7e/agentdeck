import type { Workflow, WorkflowMeta } from '../../shared/types'
import { useAppStore } from '../store/appStore'

/**
 * Persist a draft workflow, refresh the list, and open the editor.
 * Single orchestration path for every "create workflow" entry point
 * (header button, starter cards, command palette).
 */
export async function persistAndOpenWorkflow(
  draft: Workflow,
  setWorkflows: (w: WorkflowMeta[]) => void,
  openWorkflow: (id: string) => void,
): Promise<void> {
  try {
    const saved = await window.agentDeck.workflows.save(draft)
    const list = await window.agentDeck.workflows.list()
    setWorkflows(list)
    openWorkflow(saved.id)
  } catch (err) {
    useAppStore.getState().addNotification('error', `Failed to create workflow: ${String(err)}`)
  }
}

export function blankWorkflowDraft(): Workflow {
  const now = Date.now()
  return {
    id: '',
    name: 'New Workflow',
    nodes: [],
    edges: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createBlankWorkflow(
  setWorkflows: (w: WorkflowMeta[]) => void,
  openWorkflow: (id: string) => void,
): Promise<void> {
  return persistAndOpenWorkflow(blankWorkflowDraft(), setWorkflows, openWorkflow)
}
