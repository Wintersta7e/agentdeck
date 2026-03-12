import { useId, useMemo } from 'react'
import './EnergyVein.css'

interface EnergyVeinProps {
  color: string
  count: number
  speed: number // 0-1: 0=still, 0.3=idle, 1=max energy
}

export function EnergyVein({ color, count, speed }: EnergyVeinProps) {
  const gradId = useId()
  const paths = useMemo(() => generatePaths(count), [count])
  const duration = speed > 0 ? Math.round(12 + (1 - speed) * 25.7) : 0
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
      }}
      viewBox="0 0 600 400"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="40%" stopColor={color} stopOpacity="0.6" />
          <stop offset="60%" stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={`url(#${gradId})`}
          strokeWidth={1.5 - i * 0.3}
          fill="none"
          opacity={1}
          strokeDasharray="200"
          style={{
            animationName: 'vein-drift',
            animationDuration: `${duration}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationPlayState: paused ? 'paused' : 'running',
            animationDelay: `${i * -5}s`,
          }}
        />
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
