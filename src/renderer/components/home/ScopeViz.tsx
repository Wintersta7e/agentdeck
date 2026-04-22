import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import './ScopeViz.css'

interface ScopeVizProps {
  /** Pixel size of the square canvas. Default 280. */
  size?: number
}

const RING_RADII = [30, 60, 90, 120]
const TICK_COUNT = 24

/**
 * Concentric-ring "scope" visualization for the Home screen.
 *
 * Shows running sessions as pulsing blips placed on the ring, with a rotating
 * sweep beam behind them. Pure CSS/SVG; no Canvas. Respects reduced-motion.
 */
export function ScopeViz({ size = 280 }: ScopeVizProps): React.JSX.Element {
  const running = useAppStore((s) =>
    Object.values(s.sessions).filter((sess) => sess.status === 'running'),
  )
  const center = size / 2
  const agentById = useMemo(() => new Map(AGENTS.map((a) => [a.id, a])), [])

  const blips = useMemo(
    () =>
      running.map((session, i) => {
        const angle = (i / Math.max(running.length, 1)) * Math.PI * 2 - Math.PI / 2
        const radius = 70 + ((i * 13) % 45)
        const x = center + Math.cos(angle) * radius
        const y = center + Math.sin(angle) * radius
        const agent = agentById.get(session.agentOverride ?? 'claude-code')
        const label = agent?.id.replace(/-.*/, '').slice(0, 2).toUpperCase() ?? 'AG'
        return { id: session.id, x, y, label, agent: agent?.id ?? 'claude-code', delay: i * 0.3 }
      }),
    [running, center, agentById],
  )

  return (
    <div className="scope-viz" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} className="scope-viz__svg">
        <defs>
          <radialGradient id="scope-viz-grad" cx="50%" cy="50%">
            <stop offset="0%" className="scope-viz__grad-stop-inner" />
            <stop offset="60%" className="scope-viz__grad-stop-mid" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="scope-viz-sweep" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" className="scope-viz__sweep-stop-start" />
            <stop offset="100%" className="scope-viz__sweep-stop-end" />
          </linearGradient>
        </defs>

        <circle cx={center} cy={center} r={size / 2 - 6} fill="url(#scope-viz-grad)" />

        {RING_RADII.map((r) => (
          <circle key={r} cx={center} cy={center} r={r} fill="none" className="scope-viz__ring" />
        ))}

        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const a = (i / TICK_COUNT) * Math.PI * 2
          const r1 = 125
          const r2 = i % 3 === 0 ? 132 : 128
          return (
            <line
              key={i}
              x1={center + Math.cos(a) * r1}
              y1={center + Math.sin(a) * r1}
              x2={center + Math.cos(a) * r2}
              y2={center + Math.sin(a) * r2}
              className={`scope-viz__tick${i % 3 === 0 ? ' scope-viz__tick--major' : ''}`}
            />
          )
        })}

        <line x1={center} y1={10} x2={center} y2={size - 10} className="scope-viz__crosshair" />
        <line x1={10} y1={center} x2={size - 10} y2={center} className="scope-viz__crosshair" />

        <g className="scope-viz__sweep" style={{ transformOrigin: `${center}px ${center}px` }}>
          <path
            d={`M${center},${center} L${center + 125},${center} A125,125 0 0 0 ${
              center + 125 * Math.cos(-Math.PI / 3)
            },${center + 125 * Math.sin(-Math.PI / 3)} Z`}
            fill="url(#scope-viz-sweep)"
          />
        </g>

        {blips.map((blip) => (
          <g key={blip.id}>
            <circle cx={blip.x} cy={blip.y} r="10" className="scope-viz__blip-halo">
              <animate
                attributeName="r"
                values="6;16;6"
                dur="2.2s"
                repeatCount="indefinite"
                begin={`${blip.delay}s`}
              />
              <animate
                attributeName="opacity"
                values="0.3;0;0.3"
                dur="2.2s"
                repeatCount="indefinite"
                begin={`${blip.delay}s`}
              />
            </circle>
            <circle cx={blip.x} cy={blip.y} r="3.5" className="scope-viz__blip-core" />
            <text x={blip.x + 10} y={blip.y + 4} className="scope-viz__blip-label">
              {blip.label}
            </text>
          </g>
        ))}

        <circle cx={center} cy={center} r={4} className="scope-viz__origin" />
      </svg>

      <div className="scope-viz__caption scope-viz__caption--tl">NOW · {running.length} ACTIVE</div>
      <div className="scope-viz__caption scope-viz__caption--br">LAST 30M</div>
    </div>
  )
}
