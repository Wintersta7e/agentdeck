import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowNodeStatus,
  WorkflowStatus,
  WorkflowEvent,
} from '../../../shared/types'
import { WorkflowCanvas } from './WorkflowCanvas'
import WorkflowLogPanel from './WorkflowLogPanel'
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

let nextNodeCounter = 0

export default function WorkflowEditor({ workflowId }: WorkflowEditorProps): React.JSX.Element {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, WorkflowNodeStatus>>({})
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('idle')
  const [logs, setLogs] = useState<WorkflowEvent[]>([])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [detailNode, setDetailNode] = useState<WorkflowNode | null>(null)

  // ── Auto-save debounce ──

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autoSave = useCallback((w: Workflow) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.agentDeck.workflows.save(w)
    }, 500)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ── Load workflow on mount ──

  useEffect(() => {
    window.agentDeck.workflows.load(workflowId).then((w) => {
      if (w) setWorkflow(w)
    })
  }, [workflowId])

  // ── Subscribe to execution events ──

  useEffect(() => {
    if (!workflowId) return

    const unsub = window.agentDeck.workflows.onEvent(workflowId, (event: WorkflowEvent) => {
      setLogs((prev) => [...prev, event].slice(-1000))

      const nid = event.nodeId

      switch (event.type) {
        case 'workflow:started':
          setWorkflowStatus('running')
          break
        case 'workflow:done':
          setWorkflowStatus('done')
          break
        case 'workflow:error':
          setWorkflowStatus('error')
          break
        case 'workflow:stopped':
          setWorkflowStatus('stopped')
          break
        case 'node:started':
          if (nid) setNodeStatuses((prev) => ({ ...prev, [nid]: 'running' }))
          break
        case 'node:done':
          if (nid) setNodeStatuses((prev) => ({ ...prev, [nid]: 'done' }))
          break
        case 'node:error':
          if (nid) setNodeStatuses((prev) => ({ ...prev, [nid]: 'error' }))
          break
        case 'node:paused':
          if (nid) setNodeStatuses((prev) => ({ ...prev, [nid]: 'paused' }))
          break
        case 'node:resumed':
          if (nid) setNodeStatuses((prev) => ({ ...prev, [nid]: 'running' }))
          break
      }
    })

    return unsub
  }, [workflowId])

  // ── Node operations ──

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      if (!workflow) return

      nextNodeCounter += 1
      const id = `node-${Date.now()}-${nextNodeCounter}`
      const maxX = workflow.nodes.reduce((mx, n) => Math.max(mx, n.x), 0)
      const maxY = workflow.nodes.reduce((mx, n) => Math.max(mx, n.y), 0)

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
        ...workflow,
        nodes: [...workflow.nodes, newNode],
        updatedAt: Date.now(),
      }
      setWorkflow(updated)
      autoSave(updated)
    },
    [workflow, autoSave],
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
      if (!workflow) return
      // Prevent duplicate edges
      const exists = workflow.edges.some((e) => e.fromNodeId === fromId && e.toNodeId === toId)
      if (exists) return

      const edgeId = `edge-${Date.now()}`
      const updated: Workflow = {
        ...workflow,
        edges: [...workflow.edges, { id: edgeId, fromNodeId: fromId, toNodeId: toId }],
        updatedAt: Date.now(),
      }
      setWorkflow(updated)
      autoSave(updated)
    },
    [workflow, autoSave],
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
        return updated
      })
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
        setDetailNode(null)
      }
    },
    [autoSave, selectedNodeId],
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

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id)
      if (id && workflow) {
        const node = workflow.nodes.find((n) => n.id === id)
        setDetailNode(node ?? null)
      } else {
        setDetailNode(null)
      }
    },
    [workflow],
  )

  // ── Workflow execution ──

  const handleRun = useCallback(() => {
    setNodeStatuses({})
    setWorkflowStatus('running')
    setLogs([])
    window.agentDeck.workflows.run(workflowId)
  }, [workflowId])

  const handleStop = useCallback(() => {
    window.agentDeck.workflows.stop(workflowId)
  }, [workflowId])

  const handleResume = useCallback((wfId: string, nodeId: string) => {
    window.agentDeck.workflows.resume(wfId, nodeId)
  }, [])

  const handleClearLogs = useCallback(() => {
    setLogs([])
  }, [])

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

        <WorkflowLogPanel
          events={logs}
          workflow={workflow}
          nodeStatuses={nodeStatuses}
          onResumeCheckpoint={handleResume}
          onClear={handleClearLogs}
        />
      </div>
    </div>
  )
}
