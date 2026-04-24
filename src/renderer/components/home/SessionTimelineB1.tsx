import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { Session } from '../../../shared/types'
import './SessionTimelineB1.css'

const WINDOW_MS = 60 * 60 * 1000 // last 60 minutes

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

interface Row {
  id: string
  projectName: string
  agentId: string
  glyph: string
  startPct: number
  widthPct: number
  running: boolean
  mins: number
  cost: number
}

/**
 * 60-minute session timeline — prototype's B1SessionTimeline.
 * Ruler + per-session rows with agent glyph · project · gradient bar ·
 * min/$cost. Running sessions show a blinking leading edge.
 */
export function SessionTimelineB1({ now }: { now: number }): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  const projects = useAppStore((s) => s.projects)

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const rows: Row[] = useMemo(() => {
    const windowStart = now - WINDOW_MS
    return (Object.values(sessions) as Session[])
      .filter((s) => s.startedAt >= windowStart || s.status === 'running')
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(0, 6)
      .map((s) => {
        const clampedStart = Math.max(s.startedAt, windowStart)
        const endTs = s.status === 'running' ? now : Math.min(s.startedAt + WINDOW_MS, now)
        const startPct = Math.max(0, ((clampedStart - windowStart) / WINDOW_MS) * 100)
        const endPct = Math.max(startPct + 2, ((endTs - windowStart) / WINDOW_MS) * 100)
        const widthPct = Math.min(100 - startPct, endPct - startPct)
        const agentId = s.agentOverride ?? 'claude-code'
        const agent = AGENT_BY_ID.get(agentId)
        const project = projectById.get(s.projectId)
        const usage = sessionUsage[s.id]
        return {
          id: s.id,
          projectName: project?.name ?? (s.projectId || 'ad-hoc'),
          agentId,
          glyph: agent?.icon ?? '◈',
          startPct,
          widthPct,
          running: s.status === 'running',
          mins: Math.max(0, Math.floor((now - s.startedAt) / 60000)),
          cost: usage?.totalCostUsd ?? 0,
        }
      })
  }, [sessions, sessionUsage, projectById, now])

  return (
    <div className="st-b1">
      <div className="st-b1__ruler" aria-hidden="true">
        <span>-60M</span>
        <span>-45M</span>
        <span>-30M</span>
        <span>-15M</span>
        <span>NOW</span>
      </div>

      {rows.length === 0 ? (
        <div className="st-b1__empty">
          No agent activity recorded today. Start an agent to use the timeline.
        </div>
      ) : (
        <ul className="st-b1__list">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={`st-b1__row${i === rows.length - 1 ? ' st-b1__row--last' : ''}`}
              style={{ ['--row-color' as 'color']: `var(${agentColorVar(row.agentId)})` }}
            >
              <span className="st-b1__glyph">{row.glyph}</span>
              <span className="st-b1__project" title={row.projectName}>
                {row.projectName}
              </span>
              <div className="st-b1__track">
                <div
                  className="st-b1__bar"
                  style={{ left: `${row.startPct}%`, width: `${row.widthPct}%` }}
                >
                  {row.running && <span className="st-b1__edge" aria-hidden="true" />}
                </div>
              </div>
              <span className="st-b1__stat">
                {row.mins}m{row.cost > 0 ? ` · ${formatCost(row.cost)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
