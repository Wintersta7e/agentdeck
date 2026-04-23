import { useMemo } from 'react'
import { useCostHistory } from '../../hooks/useCostHistory'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { AgentType } from '../../../shared/types'
import './CostReadoutB1.css'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function dowIndex(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00`)
  // JS Sunday=0, Mon=1..Sat=6 → map to Mon=0..Sun=6
  return (d.getDay() + 6) % 7
}

interface SparkProps {
  data: number[]
  width: number
  height: number
}

function Spark({ data, width, height }: SparkProps): React.JSX.Element {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} className="cr-b1__spark">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} className="cr-b1__spark-empty" />
      </svg>
    )
  }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = data.length > 1 ? width / (data.length - 1) : width
  const pts = data.map((d, i) => {
    const x = i * step
    const y = height - ((d - min) / range) * (height - 6) - 3
    return [x, y] as const
  })
  const line = pts
    .map(([x, y], i) =>
      i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`,
    )
    .join(' ')
  const lastPoint = pts[pts.length - 1]
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} className="cr-b1__spark">
      <path d={area} className="cr-b1__spark-area" />
      <path d={line} className="cr-b1__spark-line" />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === pts.length - 1 ? 3 : 1.5}
          className="cr-b1__spark-dot"
        />
      ))}
      {lastPoint && (
        <line x1={lastPoint[0]} y1={0} x2={lastPoint[0]} y2={height} className="cr-b1__spark-now" />
      )}
    </svg>
  )
}

/**
 * B1 cost readout — 7-day total · sparkline · per-agent breakdown bars.
 * Pulls from useCostHistory + today's merged live/persisted totals.
 */
export function CostReadoutB1(): React.JSX.Element {
  const data = useCostHistory()

  // Build a dense 7-day series (oldest → today). Missing days render as 0.
  const series = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days: Array<{ iso: string; cost: number; dow: string }> = []
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86_400_000)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const entry = data.history.find((e) => e.date === iso)
      const cost = i === 0 ? data.todayCost : (entry?.totalCostUsd ?? 0)
      days.push({ iso, cost, dow: WEEKDAYS[dowIndex(iso)] ?? '' })
    }
    return days
  }, [data.history, data.todayCost])

  const total = useMemo(() => series.reduce((sum, d) => sum + d.cost, 0), [series])
  const avg = total / 7

  const perAgent = useMemo(() => {
    const combined: Record<string, number> = {}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    for (const entry of data.history.slice(-7)) {
      if (entry.date === todayIso) continue
      for (const [agent, cost] of Object.entries(entry.perAgent ?? {})) {
        combined[agent] = (combined[agent] ?? 0) + cost
      }
    }
    for (const [agent, cost] of Object.entries(data.perAgentToday)) {
      combined[agent] = (combined[agent] ?? 0) + cost
    }
    return Object.entries(combined)
      .filter(([, cost]) => cost > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [data.history, data.perAgentToday])

  const maxAgent = perAgent.length > 0 ? Math.max(...perAgent.map(([, v]) => v)) : 1

  return (
    <div className="cr-b1">
      <div className="cr-b1__total" aria-label={`Total ${formatCost(total)}`}>
        {formatCost(total)}
      </div>
      <div className="cr-b1__sub">7-DAY TOTAL · AVG {formatCost(avg)}/DAY</div>

      <div className="cr-b1__spark-wrap">
        <Spark data={series.map((d) => d.cost)} width={240} height={44} />
      </div>

      <div className="cr-b1__weekdays" aria-hidden="true">
        {series.map((d) => (
          <span key={d.iso}>{d.dow}</span>
        ))}
      </div>

      <div className="cr-b1__agents">
        {perAgent.length === 0 ? (
          <div className="cr-b1__agents-empty">No billable agent activity this week.</div>
        ) : (
          perAgent.map(([agentId, cost]) => {
            const agent = AGENT_BY_ID.get(agentId as AgentType)
            const pct = Math.max(4, (cost / maxAgent) * 100)
            return (
              <div
                key={agentId}
                className="cr-b1__agent-row"
                style={{ ['--agent-color' as 'color']: `var(${agentColorVar(agentId)})` }}
              >
                <span className="cr-b1__agent-glyph" aria-hidden="true">
                  {agent?.icon ?? '◈'}
                </span>
                <span className="cr-b1__agent-name">{agent?.name ?? agentId}</span>
                <div className="cr-b1__agent-track">
                  <span className="cr-b1__agent-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="cr-b1__agent-cost">{formatCost(cost)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
