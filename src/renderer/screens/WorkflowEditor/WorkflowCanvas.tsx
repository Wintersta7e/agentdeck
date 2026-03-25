import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge as WfEdge,
  WorkflowNodeStatus,
} from '../../../shared/types'
import { WorkflowNodeComponent, type WorkflowNodeData, type WfNode } from './WorkflowNode'
import WorkflowEdgeComponent, { type WorkflowEdgeData } from './WorkflowEdgeComponent'
import './WorkflowCanvas.css'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  nodeStatuses: Record<string, WorkflowNodeStatus>
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onMoveNode: (nodeId: string, x: number, y: number) => void
  onConnect: (fromNodeId: string, toNodeId: string, branch?: 'true' | 'false') => void
  onUpdateNode: (node: WorkflowNode) => void
  onDeleteNode: (nodeId: string) => void
  onDeleteEdge: (edgeId: string) => void
}

const nodeTypes = { workflowNode: WorkflowNodeComponent }
const edgeTypes = { workflowEdge: WorkflowEdgeComponent }

function getEdgeState(
  edge: WfEdge,
  statuses: Record<string, WorkflowNodeStatus>,
): 'idle' | 'active' | 'done' {
  const fromStatus = statuses[edge.fromNodeId] ?? 'idle'
  const toStatus = statuses[edge.toNodeId] ?? 'idle'
  if (fromStatus === 'done' && (toStatus === 'done' || toStatus === 'error')) return 'done'
  if (fromStatus === 'done' && (toStatus === 'running' || toStatus === 'paused')) return 'active'
  if (fromStatus === 'running') return 'active'
  return 'idle'
}

/** Build React Flow nodes from our Workflow data */
function toFlowNodes(
  wf: Workflow,
  statuses: Record<string, WorkflowNodeStatus>,
  selectedId: string | null,
  onUpdate: (node: WorkflowNode) => void,
  onDelete: (nodeId: string) => void,
): WfNode[] {
  return wf.nodes.map((n) => ({
    id: n.id,
    type: 'workflowNode' as const,
    position: { x: n.x, y: n.y },
    selected: n.id === selectedId,
    data: {
      node: n,
      status: statuses[n.id] ?? 'idle',
      onUpdateNode: onUpdate,
      onDeleteNode: onDelete,
    } satisfies WorkflowNodeData,
  }))
}

/** Build React Flow edges from our Workflow data */
function toFlowEdges(wf: Workflow, statuses: Record<string, WorkflowNodeStatus>): Edge[] {
  return wf.edges.map((e) => ({
    id: e.id,
    source: e.fromNodeId,
    sourceHandle: e.branch ?? null,
    target: e.toNodeId,
    type: 'workflowEdge' as const,
    data: {
      state: getEdgeState(e, statuses),
      branch: e.branch,
      edgeType: e.edgeType,
    } satisfies WorkflowEdgeData,
  }))
}

export function WorkflowCanvas({
  workflow,
  nodeStatuses,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onConnect,
  onUpdateNode,
  onDeleteNode,
  onDeleteEdge,
}: WorkflowCanvasProps): React.JSX.Element {
  // ── Local state for React Flow ──
  // React Flow needs to freely update positions during drag (smooth movement).
  // We maintain local node state that React Flow can mutate via applyNodeChanges,
  // and re-derive from parent props when they change.
  const [localNodes, setLocalNodes] = useState<WfNode[]>([])

  // Track previous prop values to detect changes during render.
  // This is the React-recommended pattern for deriving state from props:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prev, setPrev] = useState(() => ({
    workflow,
    statuses: nodeStatuses,
    selectedId: selectedNodeId,
  }))

  // Re-derive local node state when parent props change
  const workflowOrStatusesChanged = workflow !== prev.workflow || nodeStatuses !== prev.statuses
  const selectedChanged = selectedNodeId !== prev.selectedId

  if (workflowOrStatusesChanged || selectedChanged) {
    // Merge into a single setState call to avoid two re-renders
    setPrev({ workflow, statuses: nodeStatuses, selectedId: selectedNodeId })
    setLocalNodes(
      workflow
        ? toFlowNodes(workflow, nodeStatuses, selectedNodeId, onUpdateNode, onDeleteNode)
        : [],
    )
  }

  // Edges are purely derived — memoize instead of setState-during-render
  const localEdges = useMemo(
    () => (workflow ? toFlowEdges(workflow, nodeStatuses) : []),
    [workflow, nodeStatuses],
  )

  // Apply ALL node changes to local state (smooth drag).
  // Only notify parent on significant events (drag end, select, remove).
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setLocalNodes((nds) => applyNodeChanges(changes, nds) as WfNode[])

      for (const change of changes) {
        // Sync position to parent only on drag end (avoids full re-render during drag)
        if (change.type === 'position' && !change.dragging && change.position) {
          onMoveNode(change.id, change.position.x, change.position.y)
        }
        if (change.type === 'select' && change.selected) {
          onSelectNode(change.id)
        }
        if (change.type === 'remove') {
          onDeleteNode(change.id)
        }
      }
    },
    [onMoveNode, onSelectNode, onDeleteNode],
  )

  // Sync edge removals to parent — edges are derived via useMemo so no local state to update
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          onDeleteEdge(change.id)
        }
      }
    },
    [onDeleteEdge],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        // Detect branch from sourceHandle when connecting from a condition node
        const sourceNode = workflow?.nodes.find((n) => n.id === connection.source)
        const branch =
          sourceNode?.type === 'condition' && connection.sourceHandle
            ? (connection.sourceHandle as 'true' | 'false')
            : undefined
        onConnect(connection.source, connection.target, branch)
      }
    },
    [onConnect, workflow],
  )

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (connection.source === connection.target) return false
      if (!workflow) return true
      return !workflow.edges.some(
        (e) => e.fromNodeId === connection.source && e.toNodeId === connection.target,
      )
    },
    [workflow],
  )

  const handlePaneClick = useCallback(() => {
    onSelectNode(null)
  }, [onSelectNode])

  if (!workflow) {
    return (
      <div className="wf-canvas-wrap">
        <div className="wf-canvas-empty">
          <div className="wf-canvas-empty-icon">{'\u2B21'}</div>
          <div className="wf-canvas-empty-text">No workflow selected</div>
        </div>
      </div>
    )
  }

  return (
    <div className="wf-canvas-wrap">
      <svg className="wf-arrow-defs">
        <defs>
          <marker
            id="wf-arrowhead-idle"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="var(--border-bright)" />
          </marker>
          <marker
            id="wf-arrowhead-active"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="var(--green)" />
          </marker>
          <marker
            id="wf-arrowhead-done"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="var(--green)" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        minZoom={0.25}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        elementsSelectable
        edgesFocusable
        proOptions={{ hideAttribution: true }}
        className="wf-reactflow"
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
