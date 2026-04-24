import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { agentColorVar, agentShort } from '../../utils/agent-ui'
import './ScopeViz.css'

interface ScopeVizProps {
  /** Pixel size of the square canvas. Default 300. */
  size?: number
}

const RING_RADII = [36, 72, 108, 140]
const TICK_COUNT = 36
const TICK_INNER = 140
const TICK_OUTER_MAJOR = 152
const TICK_OUTER_MINOR = 146
const BLIP_RINGS = [72, 100, 128]

/**
 * Concentric-ring "scope" visualization for the Home screen hero.
 *
 * Runs an ambient sweep behind four concentric rings and 36 tick marks.
 * Running sessions render as agent-colored blips with an expanding halo.
 * Selector subscribes to the raw `sessions` ref; the running list is
 * derived via useMemo so the snapshot stays stable (React #185 guard).
 */
export function ScopeViz({ size = 300 }: ScopeVizProps): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const running = useMemo(
    () => Object.values(sessions).filter((sess) => sess.status === 'running'),
    [sessions],
  )

  const center = size / 2
  const outer = size / 2 - 4

  const blips = useMemo(
    () =>
      running.map((session, i) => {
        const ring = BLIP_RINGS[i % BLIP_RINGS.length] ?? 100
        const angle = (i / Math.max(running.length, 1)) * Math.PI * 2 - Math.PI / 2
        const x = center + Math.cos(angle) * ring
        const y = center + Math.sin(angle) * ring
        const agentId = session.agentOverride ?? 'claude-code'
        return {
          id: session.id,
          x,
          y,
          short: agentShort(agentId),
          colorVar: agentColorVar(agentId),
          delay: (i * 0.4).toFixed(2),
        }
      }),
    [running, center],
  )

  return (
    <div className="scope-viz" style={{ width: size, height: size }}>
      <svg
        className="scope-viz__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="scope-viz-grad" cx="50%" cy="50%">
            <stop offset="0%" className="scope-viz__grad-inner" />
            <stop offset="45%" className="scope-viz__grad-mid" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="scope-viz-sweep" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" className="scope-viz__sweep-start" />
            <stop offset="100%" className="scope-viz__sweep-end" />
          </linearGradient>
        </defs>

        {/* ambient glow */}
        <circle cx={center} cy={center} r={outer} fill="url(#scope-viz-grad)" />

        {/* concentric rings */}
        {RING_RADII.map((r) => (
          <circle key={r} cx={center} cy={center} r={r} className="scope-viz__ring" />
        ))}

        {/* 36 tick marks, every 3rd is major */}
        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const major = i % 3 === 0
          const a = (i / TICK_COUNT) * Math.PI * 2
          const r2 = major ? TICK_OUTER_MAJOR : TICK_OUTER_MINOR
          return (
            <line
              key={i}
              x1={center + Math.cos(a) * TICK_INNER}
              y1={center + Math.sin(a) * TICK_INNER}
              x2={center + Math.cos(a) * r2}
              y2={center + Math.sin(a) * r2}
              className={`scope-viz__tick${major ? ' scope-viz__tick--major' : ''}`}
            />
          )
        })}

        {/* crosshair */}
        <line x1={center} y1={8} x2={center} y2={size - 8} className="scope-viz__crosshair" />
        <line x1={8} y1={center} x2={size - 8} y2={center} className="scope-viz__crosshair" />

        {/* rotating sweep — 90° wedge */}
        <g className="scope-viz__sweep" style={{ transformOrigin: `${center}px ${center}px` }}>
          <path
            d={`M${center},${center} L${center + TICK_INNER},${center} A${TICK_INNER},${TICK_INNER} 0 0 0 ${
              center + TICK_INNER * Math.cos(-Math.PI / 2)
            },${center + TICK_INNER * Math.sin(-Math.PI / 2)} Z`}
            fill="url(#scope-viz-sweep)"
          />
        </g>

        {/* sweep-following leading edge */}
        <line
          x1={center}
          y1={center}
          x2={center + TICK_INNER}
          y2={center}
          className="scope-viz__sweep-edge"
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* session blips */}
        {blips.map((blip) => (
          <g key={blip.id} style={{ color: `var(${blip.colorVar})` }}>
            <circle cx={blip.x} cy={blip.y} r="12" className="scope-viz__blip-halo">
              <animate
                attributeName="r"
                values="6;18;6"
                dur="2.4s"
                repeatCount="indefinite"
                begin={`${blip.delay}s`}
              />
              <animate
                attributeName="opacity"
                values="0.55;0;0.55"
                dur="2.4s"
                repeatCount="indefinite"
                begin={`${blip.delay}s`}
              />
            </circle>
            <circle cx={blip.x} cy={blip.y} r="4" className="scope-viz__blip-core" />
            <text x={blip.x + 10} y={blip.y + 4} className="scope-viz__blip-label">
              {blip.short}
            </text>
          </g>
        ))}

        {/* origin */}
        <circle cx={center} cy={center} r="5" className="scope-viz__origin-outer" />
        <circle cx={center} cy={center} r="2" className="scope-viz__origin-inner" />
      </svg>

      <div className="scope-viz__caption scope-viz__caption--tl">NOW · {running.length} ACTIVE</div>
      <div className="scope-viz__caption scope-viz__caption--br">SCOPE · 60M</div>
      {running.length === 0 && (
        <div className="scope-viz__caption scope-viz__caption--center">STANDBY</div>
      )}
    </div>
  )
}
