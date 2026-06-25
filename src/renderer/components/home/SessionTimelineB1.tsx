import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { selectAgentMeta } from '../../utils/agent-ui'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import './SessionTimelineB1.css'

const WINDOW_MS = 60 * 60 * 1000 // last 60 minutes

interface Row {
  id: string
  projectName: string
  glyph: string
  colorVar: string
  startPct: number
  widthPct: number
  running: boolean
  mins: number
}

/**
 * 60-minute session timeline — prototype's B1SessionTimeline.
 * Ruler + per-session rows with agent glyph · project · gradient bar ·
 * min/$cost. Running sessions show a blinking leading edge.
 */
export function SessionTimelineB1({ now }: { now: number }): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const sessionRows = useSessionHistory(1)
  const registry = useAgentRegistry()

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const rows: Row[] = useMemo(() => {
    const windowStart = now - WINDOW_MS
    return sessionRows
      .filter((r) => r.startedAt >= windowStart || r.endedAt === null)
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(0, 6)
      .map((r) => {
        const running = r.endedAt === null
        const endTs = running ? now : Math.min(r.endedAt ?? now, now)
        const clampedStart = Math.max(r.startedAt, windowStart)
        const startPct = Math.max(0, ((clampedStart - windowStart) / WINDOW_MS) * 100)
        const endPct = Math.max(startPct + 2, ((endTs - windowStart) / WINDOW_MS) * 100)
        const widthPct = Math.min(100 - startPct, endPct - startPct)
        const projectName = projectById.get(r.projectId)?.name ?? (r.projectId || 'ad-hoc')
        const meta = selectAgentMeta(registry, r.agent)
        return {
          id: r.sessionId,
          projectName,
          glyph: meta.icon,
          colorVar: meta.colorVar,
          startPct,
          widthPct,
          running,
          mins: Math.max(0, Math.floor((now - r.startedAt) / 60000)),
        }
      })
  }, [sessionRows, projectById, registry, now])

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
              style={{ ['--row-color' as 'color']: `var(${row.colorVar})` }}
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
              <span className="st-b1__stat">{row.mins}m</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
