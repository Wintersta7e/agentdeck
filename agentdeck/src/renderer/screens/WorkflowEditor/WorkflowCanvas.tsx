import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeStatus,
} from '../../../shared/types'
import { WorkflowNodeComponent } from './WorkflowNode'
import './WorkflowCanvas.css'

interface WorkflowCanvasProps {
  workflow: Workflow | null
  nodeStatuses: Record<string, WorkflowNodeStatus>
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onMoveNode: (nodeId: string, x: number, y: number) => void
  onConnect: (fromNodeId: string, toNodeId: string) => void
  onUpdateNode: (node: WorkflowNode) => void
  onDeleteNode: (nodeId: string) => void
}

/** Estimated node height for arrow center calculation */
const NODE_HEIGHT = 100
const NODE_WIDTH = 200

/** Determine arrow visual state from source/target node statuses */
function getEdgeState(
  edge: WorkflowEdge,
  statuses: Record<string, WorkflowNodeStatus>,
): 'idle' | 'active' | 'done' {
  const fromStatus = statuses[edge.fromNodeId] ?? 'idle'
  const toStatus = statuses[edge.toNodeId] ?? 'idle'
  if (fromStatus === 'done' && (toStatus === 'done' || toStatus === 'error')) return 'done'
  if (fromStatus === 'done' && (toStatus === 'running' || toStatus === 'paused')) return 'active'
  if (fromStatus === 'running') return 'active'
  return 'idle'
}

/** Build cubic bezier path between two node positions */
function buildArrowPath(from: WorkflowNode, to: WorkflowNode): string {
  const fromX = from.x + NODE_WIDTH
  const fromY = from.y + NODE_HEIGHT / 2
  const toX = to.x
  const toY = to.y + NODE_HEIGHT / 2
  const cx1 = fromX + (toX - fromX) * 0.5
  const cy1 = fromY
  const cx2 = fromX + (toX - fromX) * 0.5
  const cy2 = toY
  return `M${fromX},${fromY} C${cx1},${cy1} ${cx2},${cy2} ${toX},${toY}`
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
}: WorkflowCanvasProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)

  // Drag state
  const dragRef = useRef<{
    nodeId: string
    offsetX: number
    offsetY: number
  } | null>(null)

  // Connecting state
  const [connecting, setConnecting] = useState<{ fromNodeId: string } | null>(null)

  // Cancel connecting on Escape
  useEffect(() => {
    if (!connecting) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setConnecting(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [connecting])

  // ── Drag handlers ──

  const handleStartDrag = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (!wrapRef.current || !workflow) return
      const node = workflow.nodes.find((n) => n.id === nodeId)
      if (!node) return

      e.preventDefault()
      const wrapRect = wrapRef.current.getBoundingClientRect()
      const offsetX = e.clientX - wrapRect.left - node.x
      const offsetY = e.clientY - wrapRect.top - node.y
      dragRef.current = { nodeId, offsetX, offsetY }

      function handleMouseMove(ev: MouseEvent): void {
        if (!dragRef.current || !wrapRef.current) return
        const rect = wrapRef.current.getBoundingClientRect()
        const x = Math.max(0, ev.clientX - rect.left - dragRef.current.offsetX)
        const y = Math.max(0, ev.clientY - rect.top - dragRef.current.offsetY)
        onMoveNode(dragRef.current.nodeId, x, y)
      }

      function handleMouseUp(): void {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [workflow, onMoveNode],
  )

  // ── Port click (connect) ──

  const handlePortClick = useCallback(
    (nodeId: string, port: 'in' | 'out') => {
      if (port === 'out') {
        // Start connection from this node
        setConnecting({ fromNodeId: nodeId })
      } else if (port === 'in' && connecting) {
        // Complete connection
        if (connecting.fromNodeId !== nodeId) {
          onConnect(connecting.fromNodeId, nodeId)
        }
        setConnecting(null)
      }
    },
    [connecting, onConnect],
  )

  // ── Canvas click: deselect or cancel connecting ──

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.wf-node') || target.closest('.wf-port')) return
      if (connecting) {
        setConnecting(null)
        return
      }
      onSelectNode(null)
    },
    [connecting, onSelectNode],
  )

  // ── Render ──

  if (!workflow) {
    return (
      <div className="wf-canvas-wrap">
        <div className="wf-canvas-grid" />
        <div className="wf-canvas-dots" />
        <div className="wf-canvas-empty">
          <div className="wf-canvas-empty-icon">{'\u2B21'}</div>
          <div className="wf-canvas-empty-text">No workflow selected</div>
        </div>
      </div>
    )
  }

  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]))

  return (
    <div
      ref={wrapRef}
      className={`wf-canvas-wrap ${connecting ? 'connecting' : ''}`}
      onClick={handleCanvasClick}
    >
      <div className="wf-canvas-grid" />
      <div className="wf-canvas-dots" />

      {/* SVG arrows */}
      <svg className="wf-arrows">
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

        {workflow.edges.map((edge) => {
          const fromNode = nodeMap.get(edge.fromNodeId)
          const toNode = nodeMap.get(edge.toNodeId)
          if (!fromNode || !toNode) return null

          const state = getEdgeState(edge, nodeStatuses)
          const pathD = buildArrowPath(fromNode, toNode)
          const arrowClass =
            state === 'active'
              ? 'wf-arrow-active'
              : state === 'done'
                ? 'wf-arrow-done'
                : 'wf-arrow-idle'
          const markerId = `wf-arrowhead-${state}`

          return (
            <path key={edge.id} className={arrowClass} d={pathD} markerEnd={`url(#${markerId})`} />
          )
        })}
      </svg>

      {/* Nodes */}
      {workflow.nodes.map((node) => (
        <WorkflowNodeComponent
          key={node.id}
          node={node}
          status={nodeStatuses[node.id] ?? 'idle'}
          selected={selectedNodeId === node.id}
          connectTarget={connecting !== null && connecting.fromNodeId !== node.id}
          onSelect={onSelectNode}
          onStartDrag={handleStartDrag}
          onPortClick={handlePortClick}
          onUpdateNode={onUpdateNode}
          onDeleteNode={onDeleteNode}
        />
      ))}
    </div>
  )
}
