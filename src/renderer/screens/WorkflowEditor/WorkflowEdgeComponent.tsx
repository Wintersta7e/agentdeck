import { memo } from 'react'
import { getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'

export interface WorkflowEdgeData {
  state: 'idle' | 'active' | 'done'
  branch?: 'true' | 'false' | undefined
  edgeType?: 'normal' | 'loop' | undefined
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const state = data?.state ?? 'idle'
  const branch = data?.branch
  const isLoop = data?.edgeType === 'loop'

  // Branch coloring: true = green, false = red, otherwise state-based
  let strokeColor: string
  if (branch === 'true') {
    strokeColor = 'var(--green)'
  } else if (branch === 'false') {
    strokeColor = 'var(--red)'
  } else if (state === 'active' || state === 'done') {
    strokeColor = 'var(--green)'
  } else {
    strokeColor = 'var(--border-bright)'
  }

  // Dash pattern: loop edges always dashed, active edges animated dash
  let dashArray: string | undefined
  if (isLoop) {
    dashArray = '8 4'
  } else if (state === 'active') {
    dashArray = '6 4'
  }

  const edgeClassName = [
    'react-flow__edge-path',
    `wf-edge-${state}`,
    isLoop ? 'wf-edge-loop' : '',
    selected ? 'wf-edge-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

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
        className={edgeClassName}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={dashArray}
        markerEnd={`url(#wf-arrowhead-${state})`}
      />
      {/* Branch label (T/F) shown near the source of condition edges */}
      {branch && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-9}
            y={-9}
            width={18}
            height={18}
            rx={4}
            fill="var(--bg2)"
            stroke={branch === 'true' ? 'var(--green)' : 'var(--red)'}
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={branch === 'true' ? 'var(--green)' : 'var(--red)'}
            fontSize={10}
            fontWeight={700}
            fontFamily="var(--font-mono)"
          >
            {branch === 'true' ? 'T' : 'F'}
          </text>
        </g>
      )}
      {/* Loop indicator icon */}
      {isLoop && !branch && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <rect
            x={-10}
            y={-9}
            width={20}
            height={18}
            rx={4}
            fill="var(--bg2)"
            stroke="var(--border-bright)"
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text2)"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            {'\u21BA'}
          </text>
        </g>
      )}
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
