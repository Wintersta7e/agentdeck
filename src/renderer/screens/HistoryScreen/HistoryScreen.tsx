import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useMidnight } from '../../hooks/useMidnight'
import { AGENTS } from '../../../shared/agents'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import type { Session } from '../../../shared/types'
import './HistoryScreen.css'

type Metric = 'count' | 'cost'

const DAYS = 14
const HOURS = 24
const DAY_MS = 24 * 60 * 60 * 1000
const AGENT_META_MAP = new Map(AGENTS.map((a) => [a.id, a]))

function weekdayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase().slice(0, 3)
}

function dayOfMonthLabel(ts: number): string {
  return String(new Date(ts).getDate())
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

export function HistoryScreen(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [metric, setMetric] = useState<Metric>('count')
  const todayStart = useMidnight()

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const heatmap = useMemo(() => {
    const gridStart = todayStart - (DAYS - 1) * DAY_MS
    const cells: number[][] = Array.from({ length: DAYS }, () =>
      Array.from({ length: HOURS }, () => 0),
    )
    let max = 0
    for (const session of Object.values(sessions) as Session[]) {
      if (session.startedAt < gridStart) continue
      const dayIdx = Math.floor((session.startedAt - gridStart) / DAY_MS)
      if (dayIdx < 0 || dayIdx >= DAYS) continue
      const row = cells[dayIdx]
      if (!row) continue
      const hour = new Date(session.startedAt).getHours()
      const current = row[hour] ?? 0
      const delta = metric === 'count' ? 1 : (sessionUsage[session.id]?.totalCostUsd ?? 0)
      const next = current + delta
      row[hour] = next
      if (next > max) max = next
    }
    return { cells, max, gridStart }
  }, [sessions, sessionUsage, metric, todayStart])

  const sortedSessions = useMemo(() => {
    return (Object.values(sessions) as Session[])
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 60)
  }, [sessions])

  const totals = useMemo(() => {
    let count = 0
    let cost = 0
    for (const session of Object.values(sessions) as Session[]) {
      count += 1
      const usage = sessionUsage[session.id]
      cost += usage?.totalCostUsd ?? 0
    }
    return { count, cost }
  }, [sessions, sessionUsage])

  const handleOpenSession = (session: Session): void => {
    setActiveSession(session.id)
    setCurrentView('sessions')
  }

  return (
    <ScreenShell
      eyebrow="Archive"
      title="History"
      sub="14-day heatmap of when agents run, plus a scrollable log of every session."
      filters={
        <>
          <FilterChip active={metric === 'count'} onClick={() => setMetric('count')}>
            By count
          </FilterChip>
          <FilterChip active={metric === 'cost'} onClick={() => setMetric('cost')}>
            By cost
          </FilterChip>
          <div className="history-screen__spacer" />
          <span className="history-screen__total">
            {totals.count} sessions · {formatCost(totals.cost)}
          </span>
        </>
      }
      className="history-screen"
    >
      <section className="history-heatmap" aria-label="Session heatmap">
        <div className="history-heatmap__hours" role="presentation">
          <span className="history-heatmap__corner" aria-hidden="true" />
          {Array.from({ length: HOURS }).map((_, h) => (
            <span key={h} className={`history-heatmap__hour${h % 3 === 0 ? ' is-major' : ''}`}>
              {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
        {heatmap.cells.map((row, dayIdx) => {
          const ts = heatmap.gridStart + dayIdx * DAY_MS
          return (
            <div className="history-heatmap__row" key={dayIdx}>
              <span className="history-heatmap__day">
                <span className="history-heatmap__day-name">{weekdayLabel(ts)}</span>
                <span className="history-heatmap__day-num">{dayOfMonthLabel(ts)}</span>
              </span>
              {row.map((value, hour) => {
                const intensity = heatmap.max > 0 ? value / heatmap.max : 0
                const opacity = value === 0 ? 0 : 0.15 + intensity * 0.85
                return (
                  <span
                    key={hour}
                    className={`history-heatmap__cell${value > 0 ? ' has-value' : ''}`}
                    style={{ opacity: opacity || undefined }}
                    title={
                      value > 0
                        ? `${weekdayLabel(ts)} ${String(hour).padStart(2, '0')}:00 · ${
                            metric === 'count' ? `${value} sessions` : formatCost(value as number)
                          }`
                        : undefined
                    }
                    aria-hidden="true"
                  />
                )
              })}
            </div>
          )
        })}
      </section>

      <section className="history-log" aria-label="Recent sessions">
        <header className="history-log__head">Recent sessions</header>
        {sortedSessions.length === 0 ? (
          <div className="history-log__empty">No sessions archived yet.</div>
        ) : (
          <ul className="history-log__list">
            {sortedSessions.map((session) => {
              const usage = sessionUsage[session.id]
              const cost = usage?.totalCostUsd ?? 0
              const project = projectById.get(session.projectId)
              const agent = AGENT_META_MAP.get(session.agentOverride ?? 'claude-code')
              return (
                <li key={session.id} className="history-log__row">
                  <button
                    type="button"
                    className="history-log__btn"
                    onClick={() => handleOpenSession(session)}
                  >
                    <span className="history-log__time">{formatTs(session.startedAt)}</span>
                    <span className="history-log__agent">
                      <span aria-hidden="true">{agent?.icon ?? '◈'}</span>
                      {agent?.name ?? session.agentOverride ?? 'agent'}
                    </span>
                    <span className="history-log__project">
                      {project?.name ?? (session.projectId || 'ad-hoc')}
                    </span>
                    <span className="history-log__status">{session.status.toUpperCase()}</span>
                    <span className="history-log__cost">{cost > 0 ? formatCost(cost) : '—'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </ScreenShell>
  )
}
