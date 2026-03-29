import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type {
  WorkflowMeta,
  WorkflowEvent,
  WorkflowNodeStatus,
  WorkflowStatus,
} from '../../../shared/types'

export interface WorkflowsSlice {
  workflows: WorkflowMeta[]
  setWorkflows: (w: WorkflowMeta[]) => void
  updateWorkflowMeta: (id: string, patch: Partial<WorkflowMeta>) => void
  openWorkflowIds: string[]
  activeWorkflowId: string | null
  openWorkflow: (id: string) => void
  closeWorkflow: (id?: string) => void

  // Workflow execution state (keyed by workflowId, survives editor remount)
  workflowLogs: Record<string, WorkflowEvent[]>
  workflowNodeStatuses: Record<string, Record<string, WorkflowNodeStatus>>
  workflowStatuses: Record<string, WorkflowStatus>
  addWorkflowLog: (workflowId: string, event: WorkflowEvent) => void
  setWorkflowNodeStatus: (workflowId: string, nodeId: string, status: WorkflowNodeStatus) => void
  setWorkflowStatus: (workflowId: string, status: WorkflowStatus) => void
  clearWorkflowLogs: (workflowId: string) => void
  resetWorkflowExecution: (workflowId: string) => void
}

export const createWorkflowsSlice: StateCreator<AppState, [], [], WorkflowsSlice> = (set) => ({
  workflows: [],
  setWorkflows: (w) => set({ workflows: w }),
  updateWorkflowMeta: (id, patch) =>
    set((state) => ({
      workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  openWorkflowIds: [],
  activeWorkflowId: null,

  openWorkflow: (id) =>
    set((state) => ({
      currentView: 'workflow' as const,
      activeWorkflowId: id,
      openWorkflowIds: state.openWorkflowIds.includes(id)
        ? state.openWorkflowIds
        : [...state.openWorkflowIds, id],
    })),

  closeWorkflow: (id?) =>
    set((state) => {
      const targetId = id ?? state.activeWorkflowId
      if (!targetId) return state

      const remaining = state.openWorkflowIds.filter((wid) => wid !== targetId)

      // Prune execution state for closed workflow to prevent unbounded memory growth
      const { [targetId]: _logs, ...remainingLogs } = state.workflowLogs
      const { [targetId]: _nodeStatuses, ...remainingNodeStatuses } = state.workflowNodeStatuses
      const { [targetId]: _status, ...remainingStatuses } = state.workflowStatuses

      const pruned = {
        workflowLogs: remainingLogs,
        workflowNodeStatuses: remainingNodeStatuses,
        workflowStatuses: remainingStatuses,
      }

      // Closing a non-active tab — just remove from list
      if (targetId !== state.activeWorkflowId) {
        return { openWorkflowIds: remaining, ...pruned }
      }

      // Closing the active tab — pick new focus
      if (remaining.length > 0) {
        const oldIdx = state.openWorkflowIds.indexOf(targetId)
        const newIdx = Math.min(oldIdx, remaining.length - 1)
        return {
          openWorkflowIds: remaining,
          activeWorkflowId: remaining[newIdx] ?? null,
          ...pruned,
        }
      }

      // No workflows left — fall to session or home
      const sessionIds = Object.keys(state.sessions)
      if (sessionIds.length > 0) {
        return {
          openWorkflowIds: [],
          activeWorkflowId: null,
          currentView: 'session' as const,
          activeSessionId: state.activeSessionId ?? sessionIds[0] ?? null,
          ...pruned,
        }
      }

      return {
        openWorkflowIds: [],
        activeWorkflowId: null,
        currentView: 'home' as const,
        ...pruned,
      }
    }),

  // Workflow execution state (keyed by workflowId)
  workflowLogs: {},
  workflowNodeStatuses: {},
  workflowStatuses: {},

  addWorkflowLog: (workflowId, event) =>
    set((state) => {
      const existing = state.workflowLogs[workflowId] ?? []
      // M6: Skip duplicate events (same ID from rapid IPC)
      if (event.id && existing.length > 0 && existing[existing.length - 1]?.id === event.id) {
        return state
      }
      return {
        workflowLogs: {
          ...state.workflowLogs,
          [workflowId]: [...existing, event].slice(-5000),
        },
      }
    }),

  setWorkflowNodeStatus: (workflowId, nodeId, status) =>
    set((state) => ({
      workflowNodeStatuses: {
        ...state.workflowNodeStatuses,
        [workflowId]: { ...(state.workflowNodeStatuses[workflowId] ?? {}), [nodeId]: status },
      },
    })),

  setWorkflowStatus: (workflowId, status) =>
    set((state) => ({
      workflowStatuses: { ...state.workflowStatuses, [workflowId]: status },
    })),

  clearWorkflowLogs: (workflowId) =>
    set((state) => ({
      workflowLogs: { ...state.workflowLogs, [workflowId]: [] },
    })),

  resetWorkflowExecution: (workflowId) =>
    set((state) => ({
      workflowLogs: { ...state.workflowLogs, [workflowId]: [] },
      workflowNodeStatuses: { ...state.workflowNodeStatuses, [workflowId]: {} },
      workflowStatuses: { ...state.workflowStatuses, [workflowId]: 'idle' },
    })),
})
