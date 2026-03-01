import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowStatus,
  WorkflowEvent,
} from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { WorkflowCanvas } from './WorkflowCanvas'
import WorkflowLogPanel from './WorkflowLogPanel'
import { PanelDivider } from '../../components/shared/PanelDivider'
import AddNodeMenu from './AddNodeMenu'
import './WorkflowEditor.css'

interface WorkflowEditorProps {
  workflowId: string
}

const STATUS_TEXT: Record<WorkflowStatus, string> = {
  idle: 'Ready',
  running: 'Running\u2026',
  done: 'Complete',
  error: 'Error',
  stopped: 'Stopped',
}

export default function WorkflowEditor({ workflowId }: WorkflowEditorProps): React.JSX.Element {
  const updateWorkflowMeta = useAppStore((s) => s.updateWorkflowMeta)
  const projects = useAppStore((s) => s.projects)
  const wfLogPanelWidth = useAppStore((s) => s.wfLogPanelWidth)
  const setWfLogPanelWidth = useAppStore((s) => s.setWfLogPanelWidth)
  const logs = useAppStore((s) => s.workflowLogs[workflowId] ?? [])
  const nodeStatuses = useAppStore((s) => s.workflowNodeStatuses[workflowId] ?? {})
  const workflowStatus = useAppStore((s) => s.workflowStatuses[workflowId] ?? 'idle')
  const logPanelRef = useRef<HTMLDivElement>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [detailNode, setDetailNode] = useState<WorkflowNode | null>(null)

  // M7: Instance-scoped counter instead of module-level
  const nodeCounterRef = useRef(0)

  // ── Auto-save debounce ──

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // H8: Track latest workflow for flush-before-run
  const latestWorkflowRef = useRef<Workflow | null>(null)

  const autoSave = useCallback((w: Workflow) => {
    latestWorkflowRef.current = w
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.agentDeck.workflows.save(w)
    }, 500)
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
    window.agentDeck.workflows.load(workflowId).then((w) => {
      if (!cancelled && w) setWorkflow(w)
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
        const maxX = prev.nodes.reduce((mx, n) => Math.max(mx, n.x), 0)
        const maxY = prev.nodes.reduce((mx, n) => Math.max(mx, n.y), 0)

        const defaultNames: Record<WorkflowNodeType, string> = {
          agent: 'New Agent',
          shell: 'Shell Command',
          checkpoint: 'Checkpoint',
        }

        const newNode: WorkflowNode = {
          id,
          type,
          name: defaultNames[type],
          x: maxX + 260,
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
    (fromId: string, toId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev
        // Prevent duplicate edges
        const exists = prev.edges.some((e) => e.fromNodeId === fromId && e.toNodeId === toId)
        if (exists) return prev

        const edgeId = `edge-${Date.now()}`
        const updated: Workflow = {
          ...prev,
          edges: [...prev.edges, { id: edgeId, fromNodeId: fromId, toNodeId: toId }],
          updatedAt: Date.now(),
        }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

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
        if (updatedNode.id === selectedNodeId) {
          setDetailNode(updatedNode)
        }
        return updated
      })
    },
    [autoSave, selectedNodeId],
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
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
        setDetailNode(null)
      }
    },
    [autoSave, selectedNodeId, workflowId, updateWorkflowMeta],
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

  // M6: Use setter-function pattern to read latest workflow without dependency
  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
    if (id) {
      setWorkflow((prev) => {
        const node = prev?.nodes.find((n) => n.id === id)
        setDetailNode(node ?? null)
        return prev
      })
    } else {
      setDetailNode(null)
    }
  }, [])

  // ── Workflow execution ──

  const handleRun = useCallback(() => {
    useAppStore.getState().resetWorkflowExecution(workflowId)
    useAppStore.getState().setWorkflowStatus(workflowId, 'running')
    // Resolve project path from workflow's projectId (if any)
    const projectPath = workflow?.projectId
      ? projects.find((p) => p.id === workflow.projectId)?.path
      : undefined
    // H8: Flush pending auto-save so engine reads latest, H9: catch errors
    flushSave()
      .then(() => window.agentDeck.workflows.run(workflowId, projectPath))
      .catch(() => {
        useAppStore.getState().setWorkflowStatus(workflowId, 'error')
      })
  }, [workflowId, flushSave, workflow, projects])

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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const pid = e.target.value || undefined
      setWorkflow((prev) => {
        if (!prev) return prev
        const updated: Workflow = { ...prev, projectId: pid, updatedAt: Date.now() }
        autoSave(updated)
        return updated
      })
    },
    [autoSave],
  )

  // ── Render ──

  const statusText = STATUS_TEXT[workflowStatus]

  return (
    <div className="wf-editor">
      {/* Toolbar */}
      <div className="wf-toolbar">
        <span className="wf-name">{workflow?.name ?? 'Workflow'}</span>
        <span className="wf-name-badge">workflow</span>
        <div className="wf-sep" />
        <button
          className={`wf-btn play${workflowStatus === 'running' ? ' running' : ''}`}
          onClick={workflowStatus === 'running' ? handleStop : handleRun}
          type="button"
        >
          <span className="wf-btn-icon">{workflowStatus === 'running' ? '\u25A0' : '\u25B6'}</span>
          {workflowStatus === 'running' ? 'Stop' : 'Run Workflow'}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className="wf-btn add-node"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            type="button"
          >
            <span className="wf-btn-icon">{'\u2295'}</span> Add Node
          </button>
          <AddNodeMenu
            open={addMenuOpen}
            onAdd={handleAddNode}
            onClose={() => setAddMenuOpen(false)}
          />
        </div>
        <div className="wf-sep" />
        <select
          className="wf-project-select"
          value={workflow?.projectId ?? ''}
          onChange={handleProjectChange}
        >
          <option value="">No project (cwd)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="wf-spacer" />
        <div className="wf-status">
          <div className={`wf-status-dot ${workflowStatus}`} />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Content: canvas + log panel */}
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
            onDeleteEdge={handleDeleteEdge}
          />

          {/* Detail panel — absolute-positioned at bottom of canvas area */}
          {detailNode && (
            <div className="wf-detail-panel">
              <div className="wf-detail-header">
                <span className="wf-detail-title">{detailNode.name}</span>
                <button
                  className="wf-detail-close"
                  onClick={() => {
                    setDetailNode(null)
                    setSelectedNodeId(null)
                  }}
                  type="button"
                >
                  {'\u00D7'}
                </button>
              </div>
              <div className="wf-detail-body">
                <div className="wf-detail-fields">
                  <div className="wf-detail-field">
                    <div className="wf-detail-label">Type</div>
                    <div className="wf-detail-value">{detailNode.type}</div>
                  </div>
                  {detailNode.agent && (
                    <div className="wf-detail-field">
                      <div className="wf-detail-label">Agent</div>
                      <div className="wf-detail-value">{detailNode.agent}</div>
                    </div>
                  )}
                  <div className="wf-detail-field">
                    <div className="wf-detail-label">Status</div>
                    <div className="wf-detail-value">{nodeStatuses[detailNode.id] ?? 'idle'}</div>
                  </div>
                </div>
                <div className="wf-detail-prompt">
                  <div className="wf-detail-label">Prompt / Role</div>
                  <div className="wf-detail-prompt-text">
                    {detailNode.prompt ?? detailNode.command ?? detailNode.message ?? '\u2014'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <PanelDivider
          side="right"
          panelRef={logPanelRef}
          minWidth={200}
          maxWidth={600}
          onResizeEnd={setWfLogPanelWidth}
        />
        <div ref={logPanelRef} style={{ width: wfLogPanelWidth, flexShrink: 0 }}>
          <WorkflowLogPanel
            events={logs}
            workflow={workflow}
            nodeStatuses={nodeStatuses}
            onResumeCheckpoint={handleResume}
            onClear={handleClearLogs}
          />
        </div>
      </div>
    </div>
  )
}
