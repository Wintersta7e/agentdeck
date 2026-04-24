import { memo } from 'react'
import { type EdgeProps, type Edge } from '@xyflow/react'

export interface WorkflowEdgeData {
  state: 'idle' | 'active' | 'done'
  branch?: 'true' | 'false' | undefined
  edgeType?: 'normal' | 'loop' | undefined
  [key: string]: unknown
}

type WfEdge = Edge<WorkflowEdgeData, 'workflowEdge'>

/**
 * B1-style step-elbow edge: straight horizontal runs joined by a short
 * 12px diagonal in the middle. Matches the variation-b1.jsx workflow
 * mockup. Branch labels render as inline uppercase text (TRUE/FALSE)
 * above the midpoint, no background pill.
 */
function computeStepPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} L${mx - 6},${y1} L${mx + 6},${y2} L${x2},${y2}`
}

function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<WfEdge>): React.JSX.Element {
  const edgePath = computeStepPath(sourceX, sourceY, targetX, targetY)
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2

  const state = data?.state ?? 'idle'
  const branch = data?.branch
  const isLoop = data?.edgeType === 'loop'

  // Branch colouring: true = green, false = red, loop = amber,
  // otherwise state-based (running/done → green, idle → subdued)
  let strokeColor: string
  if (branch === 'true') {
    strokeColor = 'var(--green)'
  } else if (branch === 'false') {
    strokeColor = 'var(--red)'
  } else if (isLoop) {
    strokeColor = 'var(--accent)'
  } else if (state === 'active' || state === 'done') {
    strokeColor = 'var(--green)'
  } else {
    strokeColor = 'color-mix(in oklch, var(--text2) 55%, transparent)'
  }

  // Dash pattern: loop edges stay dashed, active edges get animated dash
  let dashArray: string | undefined
  if (isLoop) {
    dashArray = '6 4'
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

  // Bigger transparent hit target so the 1.25px path is still clickable
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
        strokeWidth={selected ? 2 : 1.25}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#wf-arrowhead-${state})`}
        opacity={0.9}
      />
      {/* Branch label — uppercase mono text above the midpoint */}
      {branch && (
        <text
          x={labelX}
          y={labelY - 6}
          textAnchor="middle"
          fill={branch === 'true' ? 'var(--green)' : 'var(--red)'}
          fontSize={9}
          fontFamily="var(--font-mono)"
          letterSpacing={1.5}
          style={{ pointerEvents: 'none' }}
        >
          {branch.toUpperCase()}
        </text>
      )}
      {/* Loop indicator — recycle glyph, subdued */}
      {isLoop && !branch && (
        <text
          x={labelX}
          y={labelY - 6}
          textAnchor="middle"
          fill="var(--accent)"
          fontSize={10}
          fontFamily="var(--font-mono)"
          style={{ pointerEvents: 'none' }}
        >
          ↻ LOOP
        </text>
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
