import { memo } from 'react'
import { getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'

export interface WorkflowEdgeData {
  state: 'idle' | 'active' | 'done'
  [key: string]: unknown
}

type WfEdge = Edge<WorkflowEdgeData, 'workflowEdge'>

function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<WfEdge>): React.JSX.Element {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const state = data?.state ?? 'idle'
  const strokeColor =
    state === 'active' || state === 'done' ? 'var(--green)' : 'var(--border-bright)'
  const dashArray = state === 'active' ? '6 4' : undefined

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      <path
        id={id}
        className={`react-flow__edge-path wf-edge-${state}${selected ? ' wf-edge-selected' : ''}`}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={dashArray}
        markerEnd={`url(#wf-arrowhead-${state})`}
      />
      {state === 'active' && (
        <>
          <circle
            r="3"
            className="wf-edge-particle wf-edge-particle-1"
            style={{ offsetPath: `path('${edgePath}')` }}
            fill="var(--green)"
          />
          <circle
            r="2"
            className="wf-edge-particle wf-edge-particle-2"
            style={{ offsetPath: `path('${edgePath}')` }}
            fill="var(--green)"
          />
        </>
      )}
    </>
  )
}

export default memo(WorkflowEdgeComponent)
