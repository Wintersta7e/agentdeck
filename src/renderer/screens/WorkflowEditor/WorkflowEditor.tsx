import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge as WfEdge,
  WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowEvent,
} from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { WorkflowCanvas } from './WorkflowCanvas'
import WorkflowLogPanel from './WorkflowLogPanel'
import WorkflowHistoryPanel from './WorkflowHistoryPanel'
import { PanelDivider } from '../../components/shared/PanelDivider'
import WorkflowNodeEditorPanel from './WorkflowNodeEditorPanel'
import WorkflowRunDialog from './WorkflowRunDialog'
import WorkflowToolbar from './WorkflowToolbar'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { useWorkflowActions } from './useWorkflowActions'
import './WorkflowEditor.css'

interface WorkflowEditorProps {
  workflowId: string
}

// L8: Named constants for magic numbers
const AUTO_SAVE_DEBOUNCE_MS = 500
const NEW_NODE_X_OFFSET = 260

// Stable empty defaults — avoid `?? []` / `?? {}` in Zustand selectors
// which create new references every render and cause infinite re-render loops.
const EMPTY_LOGS: WorkflowEvent[] = []
const EMPTY_NODE_STATUSES: Record<string, WorkflowNodeStatus> = {}

export default function WorkflowEditor({ workflowId }: WorkflowEditorProps): React.JSX.Element {
  const updateWorkflowMeta = useAppStore((s) => s.updateWorkflowMeta)
  const projects = useAppStore((s) => s.projects)
  const wfLogPanelWidth = useAppStore((s) => s.wfLogPanelWidth)
  const setWfLogPanelWidth = useAppStore((s) => s.setWfLogPanelWidth)
  const logs = useAppStore((s) => s.workflowLogs[workflowId] ?? EMPTY_LOGS)
  const nodeStatuses = useAppStore((s) => s.workflowNodeStatuses[workflowId] ?? EMPTY_NODE_STATUSES)
  const workflowStatus = useAppStore((s) => s.workflowStatuses[workflowId] ?? 'idle')
  const logPanelRef = useRef<HTMLDivElement>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const closeAddMenu = useCallback(() => setAddMenuOpen(false), [])
  const [detailNode, setDetailNode] = useState<WorkflowNode | null>(null)
  const [rightTab, setRightTab] = useState<'editor' | 'log' | 'history'>('editor')
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [showNoProjectConfirm, setShowNoProjectConfirm] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // M7: Instance-scoped counter instead of module-level
  const nodeCounterRef = useRef(0)

  // H4: Ref to avoid stale selectedNodeId in handleUpdateNode closure
  const selectedNodeIdRef = useRef(selectedNodeId)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  // ── Auto-save debounce ──

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // H8: Track latest workflow for flush-before-run
  const latestWorkflowRef = useRef<Workflow | null>(null)

  const autoSave = useCallback((w: Workflow) => {
    latestWorkflowRef.current = w
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      // H2: Catch save failures — H3: Surface to user via notification
      window.agentDeck.workflows.save(w).catch((err: unknown) => {
        window.agentDeck.log.send('error', 'workflow-editor', 'Auto-save failed', {
          err: String(err),
        })
        useAppStore.getState().addNotification('error', `Workflow auto-save failed: ${String(err)}`)
      })
    }, AUTO_SAVE_DEBOUNCE_MS)
  }, [])

  /** Flush any pending auto-save immediately */
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (latestWorkflowRef.current) {
      await window.agentDeck.workflows.save(latestWorkflowRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ── Load workflow on mount (H7: cancellation guard) ──

  useEffect(() => {
    let cancelled = false
    window.agentDeck.workflows
      .load(workflowId)
      .then((w) => {
        if (!cancelled && w) {
          setWorkflow(w)
          latestWorkflowRef.current = w
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError('Failed to load workflow. It may have been deleted or corrupted.')
        }
        window.agentDeck.log.send('error', 'workflow-editor', 'Failed to load workflow', {
          err: String(err),
          workflowId,
        })
      })
    return () => {
      cancelled = true
    }
  }, [workflowId])

  // ── Subscribe to execution events ──

  useEffect(() => {
    if (!workflowId) return

    const unsub = window.agentDeck.workflows.onEvent(workflowId, (event: WorkflowEvent) => {
      const s = useAppStore.getState()
      s.addWorkflowLog(workflowId, event)

      const nid = event.nodeId

      switch (event.type) {
        case 'workflow:started':
          s.setWorkflowStatus(workflowId, 'running')
          setRightTab('log')
          break
        case 'workflow:done':
          s.setWorkflowStatus(workflowId, 'done')
          break
        case 'workflow:error':
          s.setWorkflowStatus(workflowId, 'error')
          break
        case 'workflow:stopped':
          s.setWorkflowStatus(workflowId, 'stopped')
          break
        case 'node:started':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'running')
          break
        case 'node:done':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'done')
          break
        case 'node:error':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'error')
          break
        case 'node:paused':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'paused')
          break
        case 'node:resumed':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'running')
          break
        case 'node:skipped':
          if (nid) s.setWorkflowNodeStatus(workflowId, nid, 'skipped')
          break
        case 'node:retry':
          // Node is being retried — keep status as 'running'.
          // The event is logged but status doesn't change.
          break
        case 'node:loopIteration':
          // Log the loop iteration. Nodes in the loop will get new
          // 'node:started' events when re-executed, so no status change needed.
          break
      }
    })

    return unsub
  }, [workflowId])

  // ── Node operations ──

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      setWorkflow((prev) => {
        if (!prev) return prev

        nodeCounterRef.current += 1
        const id = `node-${Date.now()}-${nodeCounterRef.current}`
        // Place new nodes near the center of existing nodes, offset slightly
        const avgX =
          prev.nodes.length > 0
            ? prev.nodes.reduce((sum, n) => sum + n.x, 0) / prev.nodes.length
            : 100
        const maxY = prev.nodes.reduce((mx, n) => Math.max(mx, n.y), 0)

        const defaultNames: Record<WorkflowNodeType, string> = {
          agent: 'New Agent',
          shell: 'Shell Command',
          checkpoint: 'Checkpoint',
          condition: 'Condition',
        }

        const newNode: WorkflowNode = {
          id,
          type,
          name: defaultNames[type],
          x: Math.round(avgX) + NEW_NODE_X_OFFSET,
          y: maxY > 0 ? 100 : 140,
        }

        const updated: Workflow = {
          ...prev,
          nodes: [...prev.nodes, newNode],
          updatedAt: Date.now(),
        }
        autoSave(updated)
        updateWorkflowMeta(workflowId, { nodeCount: updated.nodes.length })
        return updated
      })
    },
    [autoSave, workflowId, updateWorkflowMeta],
  )

  const handleMoveNode = useCallback(
    (nodeId: string, x: number, y: number) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = {
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
          updatedAt: Date.now(),
        }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

  const handleConnect = useCallback(
    (fromId: string, toId: string, branch?: 'true' | 'false') => {
      setWorkflow((prev) => {
        if (!prev) return prev
        // Prevent duplicate edges
        const exists = prev.edges.some((e) => e.fromNodeId === fromId && e.toNodeId === toId)
        if (exists) return prev

        const edgeId = `edge-${Date.now()}`
        const newEdge: WfEdge = { id: edgeId, fromNodeId: fromId, toNodeId: toId }
        if (branch) {
          newEdge.branch = branch
        }
        const updated: Workflow = {
          ...prev,
          edges: [...prev.edges, newEdge],
          updatedAt: Date.now(),
        }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

  // H4: Use selectedNodeIdRef to avoid stale closure capture
  const handleUpdateNode = useCallback(
    (updatedNode: WorkflowNode) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = {
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
          updatedAt: Date.now(),
        }
        autoSave(updated)
        // Keep detail panel in sync
        if (updatedNode.id === selectedNodeIdRef.current) {
          setDetailNode(updatedNode)
        }
        return updated
      })
    },
    [autoSave],
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = {
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== nodeId),
          edges: prev.edges.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
          updatedAt: Date.now(),
        }
        autoSave(updated)
        updateWorkflowMeta(workflowId, { nodeCount: updated.nodes.length })
        return updated
      })
      if (selectedNodeIdRef.current === nodeId) {
        setSelectedNodeId(null)
        setDetailNode(null)
      }
    },
    [autoSave, workflowId, updateWorkflowMeta],
  )

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const source = prev.nodes.find((n) => n.id === nodeId)
        if (!source) return prev
        const newId = crypto.randomUUID()
        const clone = {
          ...(JSON.parse(JSON.stringify(source)) as typeof source),
          id: newId,
          name: `${source.name} (copy)`,
          x: source.x + 30,
          y: source.y + 30,
        }
        const updated: Workflow = {
          ...prev,
          nodes: [...prev.nodes, clone],
          updatedAt: Date.now(),
        }
        autoSave(updated)
        updateWorkflowMeta(workflowId, { nodeCount: updated.nodes.length })
        return updated
      })
    },
    [autoSave, workflowId, updateWorkflowMeta],
  )

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = {
          ...prev,
          edges: prev.edges.filter((e) => e.id !== edgeId),
          updatedAt: Date.now(),
        }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

  // Read workflow from ref to avoid calling setState inside another setState's updater
  // (React 19 requires state updater functions to be pure — no side effects).
  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id)
      if (id) {
        const node = latestWorkflowRef.current?.nodes.find((n) => n.id === id)
        setDetailNode(node ?? null)
        if (useAppStore.getState().workflowStatuses[workflowId] !== 'running') {
          setRightTab('editor')
        }
      } else {
        setDetailNode(null)
      }
    },
    [workflowId],
  )

  // ── Workflow execution ──

  const { runWorkflow, handleExport, handleImport, handleDuplicate } = useWorkflowActions(
    workflowId,
    workflow,
    flushSave,
    projects,
  )

  /** Proceed with workflow execution (after any confirmation dialogs) */
  const proceedWithRun = useCallback(() => {
    if (workflow?.variables && workflow.variables.length > 0) {
      setShowRunDialog(true)
      return
    }
    runWorkflow()
  }, [workflow, runWorkflow])

  const handleRun = useCallback(() => {
    // Warn if workflow has agent nodes but no project selected
    const hasAgentNodes = workflow?.nodes.some((n) => n.type === 'agent')
    if (hasAgentNodes && !workflow?.projectId) {
      setShowNoProjectConfirm(true)
      return
    }

    proceedWithRun()
  }, [workflow, proceedWithRun])

  const handleStop = useCallback(() => {
    window.agentDeck.workflows.stop(workflowId)
  }, [workflowId])

  const handleResume = useCallback((wfId: string, nodeId: string) => {
    window.agentDeck.workflows.resume(wfId, nodeId)
  }, [])

  const handleClearLogs = useCallback(() => {
    useAppStore.getState().clearWorkflowLogs(workflowId)
  }, [workflowId])

  const handleProjectChange = useCallback(
    (pid: string | undefined) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = { ...prev, projectId: pid, updatedAt: Date.now() }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

  const handleNameChange = useCallback(
    (name: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = { ...prev, name, updatedAt: Date.now() }
        autoSave(updated)
        return updated
      })
      updateWorkflowMeta(workflowId, { name })
    },
    [autoSave, workflowId, updateWorkflowMeta],
  )

  // ── Render ──

  // SK-8: Resolve project path for the workflow's selected project
  const workflowProjectPath = useMemo(
    () => projects.find((p) => p.id === workflow?.projectId)?.path,
    [projects, workflow?.projectId],
  )

  const toggleAddMenu = useCallback(() => setAddMenuOpen((prev) => !prev), [])

  return (
    <div className="wf-editor">
      <WorkflowToolbar
        workflowName={workflow?.name}
        onNameChange={handleNameChange}
        onAddNode={handleAddNode}
        addMenuOpen={addMenuOpen}
        onToggleAddMenu={toggleAddMenu}
        onCloseAddMenu={closeAddMenu}
        onExport={handleExport}
        onImport={handleImport}
        onDuplicate={handleDuplicate}
        onRun={handleRun}
        onStop={handleStop}
        workflowStatus={workflowStatus}
        projectId={workflow?.projectId}
        onProjectChange={handleProjectChange}
        projects={projects}
      />

      {loadError && (
        <div className="wf-load-error" role="alert">
          {loadError}
        </div>
      )}

      {/* Content: canvas + right panel */}
      <div className="wf-content">
        <div className="wf-canvas-area">
          <WorkflowCanvas
            workflow={workflow}
            nodeStatuses={nodeStatuses}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onMoveNode={handleMoveNode}
            onConnect={handleConnect}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onDuplicateNode={handleDuplicateNode}
            onDeleteEdge={handleDeleteEdge}
          />
        </div>

        <PanelDivider
          side="right"
          panelRef={logPanelRef}
          minWidth={200}
          maxWidth={600}
          onResizeEnd={setWfLogPanelWidth}
        />
        <div
          ref={logPanelRef}
          className="wf-right-panel"
          style={{ width: wfLogPanelWidth, flexShrink: 0 }}
        >
          {/* Tab bar */}
          <div className="wf-right-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={rightTab === 'editor'}
              className={`wf-right-tab${rightTab === 'editor' ? ' active' : ''}`}
              onClick={() => setRightTab('editor')}
              type="button"
            >
              Node Editor
            </button>
            <button
              role="tab"
              aria-selected={rightTab === 'log'}
              className={`wf-right-tab${rightTab === 'log' ? ' active' : ''}`}
              onClick={() => setRightTab('log')}
              type="button"
            >
              Execution Log
            </button>
            <button
              role="tab"
              aria-selected={rightTab === 'history'}
              className={`wf-right-tab${rightTab === 'history' ? ' active' : ''}`}
              onClick={() => setRightTab('history')}
              type="button"
            >
              History
            </button>
          </div>

          {/* Tab content */}
          <div
            role="tabpanel"
            className={`wf-right-content ${rightTab === 'editor' ? 'wf-tab-visible' : 'wf-tab-hidden'}`}
          >
            {detailNode ? (
              <WorkflowNodeEditorPanel
                node={detailNode}
                nodeStatuses={nodeStatuses}
                onUpdateNode={handleUpdateNode}
                onClose={() => {
                  setDetailNode(null)
                  setSelectedNodeId(null)
                }}
                projectPath={workflowProjectPath}
              />
            ) : (
              <div className="wf-right-empty">Select a node to edit</div>
            )}
          </div>
          <div
            role="tabpanel"
            className={rightTab === 'log' ? 'wf-tab-visible' : 'wf-tab-hidden'}
            style={{ flex: 1, minHeight: 0 }}
          >
            <WorkflowLogPanel
              events={logs}
              workflow={workflow}
              nodeStatuses={nodeStatuses}
              onResumeCheckpoint={handleResume}
              onClear={handleClearLogs}
              visible={rightTab === 'log'}
            />
          </div>
          <div
            role="tabpanel"
            className={rightTab === 'history' ? 'wf-tab-visible' : 'wf-tab-hidden'}
            style={{ flex: 1, minHeight: 0 }}
          >
            <WorkflowHistoryPanel workflowId={workflowId} />
          </div>
        </div>
      </div>

      {showRunDialog && workflow?.variables && (
        <WorkflowRunDialog
          variables={workflow.variables}
          onStart={(vals) => {
            setShowRunDialog(false)
            runWorkflow(vals)
          }}
          onCancel={() => setShowRunDialog(false)}
        />
      )}

      <ConfirmDialog
        open={showNoProjectConfirm}
        title="No Project Selected"
        message="This workflow has agent nodes but no project is selected. Agents need a project directory to review/modify code.\n\nRun anyway?"
        confirmLabel="Run Anyway"
        onConfirm={() => {
          setShowNoProjectConfirm(false)
          proceedWithRun()
        }}
        onCancel={() => setShowNoProjectConfirm(false)}
      />
    </div>
  )
}
