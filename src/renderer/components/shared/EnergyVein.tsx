import { useId, useMemo } from 'react'
import './EnergyVein.css'

interface EnergyVeinProps {
  color: string
  count: number
  speed: number // 0-1: 0=still, 0.3=idle, 1=max energy
}

export function EnergyVein({ color, count, speed }: EnergyVeinProps) {
  const gradId = useId()
  const highlightGradId = `${gradId}-hl`
  const paths = useMemo(() => generatePaths(count), [count])
  const duration = speed > 0 ? Math.round(8 + (1 - speed) * 20) : 0
  const paused = speed === 0

  return (
    <svg
      className="energy-vein"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        willChange: 'transform',
      }}
      viewBox="0 0 600 400"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Base gradient — fades at edges */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="30%" stopColor={color} stopOpacity="0.4" />
          <stop offset="70%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {/* Highlight gradient — brighter for the traveling pulse */}
        <linearGradient id={highlightGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="25%" stopColor={color} stopOpacity="0.8" />
          <stop offset="50%" stopColor={color} stopOpacity="1" />
          <stop offset="75%" stopColor={color} stopOpacity="0.8" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <g key={i}>
          {/* Base layer: continuous line, always visible */}
          <path
            d={d}
            stroke={`url(#${gradId})`}
            strokeWidth={1.2 - i * 0.2}
            fill="none"
            opacity={1}
          />
          {/* Highlight layer: traveling bright pulse */}
          <path
            d={d}
            stroke={`url(#${highlightGradId})`}
            strokeWidth={2 - i * 0.3}
            fill="none"
            opacity={0.7}
            strokeDasharray="100 500"
            style={{
              animationName: 'vein-drift',
              animationDuration: `${duration}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationPlayState: paused ? 'paused' : 'running',
              animationDelay: `${i * -4}s`,
            }}
          />
        </g>
      ))}
    </svg>
  )
}

function generatePaths(count: number): string[] {
  const templates = [
    'M0,100 Q150,75 300,110 T600,95',
    'M0,250 Q200,230 400,260 T600,240',
    'M0,180 Q120,160 240,185 T480,170 T600,180',
  ]
  return templates.slice(0, count)
}
