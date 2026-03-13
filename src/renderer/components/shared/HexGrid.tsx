import { useId } from 'react'

interface HexGridProps {
  rotation: number
  opacity?: number | undefined
  style?: React.CSSProperties | undefined
}

export function HexGrid({ rotation, opacity, style }: HexGridProps) {
  const patternId = useId()

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: opacity ?? 'var(--hex-grid-opacity)',
        color: 'var(--accent)',
        ...style,
      }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          width="24"
          height="42"
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${rotation})`}
        >
          <polygon
            points="12,2 22,8 22,22 12,28 2,22 2,8"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
