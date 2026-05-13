import type { Workflow, WorkflowMeta } from '../../shared/types'
import { useAppStore } from '../store/appStore'

export async function createBlankWorkflow(
  setWorkflows: (w: WorkflowMeta[]) => void,
  openWorkflow: (id: string) => void,
): Promise<void> {
  try {
    const blank: Workflow = {
      id: '',
      name: 'New Workflow',
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const saved = await window.agentDeck.workflows.save(blank)
    const list = await window.agentDeck.workflows.list()
    setWorkflows(list)
    openWorkflow(saved.id)
  } catch (err) {
    useAppStore.getState().addNotification('error', `Failed to create workflow: ${String(err)}`)
  }
}
