import './HexDot.css'

type HexDotStatus = 'live' | 'idle' | 'error'

interface HexDotProps {
  status: HexDotStatus
  size: number
}

export function HexDot({ status, size }: HexDotProps) {
  const h = Math.round(size * 1.155)
  const cx = size / 2
  const cy = h / 2
  const r = size / 2 - 0.5
  const points = hexPoints(cx, cy, r)

  return (
    <svg
      className={`hex-dot hex-dot--${status}`}
      width={size}
      height={h}
      viewBox={`0 0 ${size} ${h}`}
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  )
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
