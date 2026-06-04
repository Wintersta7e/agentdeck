import { useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useMidnight } from '../../hooks/useMidnight'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { AGENTS } from '../../../shared/agents'
import type { AgentType } from '../../../shared/types'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import { DAYS as HISTORY_DAYS } from './constants'
import './HistoryScreen.css'

type Metric = 'count' | 'filesChanged'

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

export function HistoryScreen(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [metric, setMetric] = useState<Metric>('count')
  const todayStart = useMidnight()
  const gridStart = todayStart - (HISTORY_DAYS - 1) * DAY_MS

  const rows = useSessionHistory(HISTORY_DAYS)

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const heatmap = useMemo(() => {
    const cells: number[][] = Array.from({ length: HISTORY_DAYS }, () =>
      Array.from({ length: HOURS }, () => 0),
    )
    let max = 0
    for (const row of rows) {
      if (row.startedAt < gridStart) continue
      const dayIdx = Math.floor((row.startedAt - gridStart) / DAY_MS)
      if (dayIdx < 0 || dayIdx >= HISTORY_DAYS) continue
      const dayRow = cells[dayIdx]
      if (!dayRow) continue
      const hour = new Date(row.startedAt).getHours()
      const current = dayRow[hour] ?? 0
      const delta = metric === 'count' ? 1 : row.filesChanged
      const next = current + delta
      dayRow[hour] = next
      if (next > max) max = next
    }
    return { cells, max }
  }, [rows, metric, gridStart])

  const sortedRows = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 60),
    [rows],
  )

  const totals = useMemo(() => {
    let count = 0
    let filesChanged = 0
    for (const row of rows) {
      if (row.startedAt < gridStart) continue
      count += 1
      filesChanged += row.filesChanged
    }
    return { count, filesChanged }
  }, [rows, gridStart])

  const handleOpenSession = (sessionId: string): void => {
    setActiveSession(sessionId)
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
          <FilterChip active={metric === 'filesChanged'} onClick={() => setMetric('filesChanged')}>
            By files
          </FilterChip>
          <div className="history-screen__spacer" />
          <span className="history-screen__total">
            {totals.count} sessions · {totals.filesChanged} files
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
          const ts = gridStart + dayIdx * DAY_MS
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
                            metric === 'count' ? `${value} sessions` : `${value} files`
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
        {sortedRows.length === 0 ? (
          <div className="history-log__empty">No sessions archived yet.</div>
        ) : (
          <ul className="history-log__list">
            {sortedRows.map((row) => {
              const project = projectById.get(row.projectId)
              const agent = AGENT_META_MAP.get(row.agent as AgentType)
              const files = row.filesChanged
              return (
                <li key={row.sessionId} className="history-log__row">
                  <button
                    type="button"
                    className="history-log__btn"
                    onClick={() => handleOpenSession(row.sessionId)}
                  >
                    <span className="history-log__time">{formatTs(row.startedAt)}</span>
                    <span className="history-log__agent">
                      <span aria-hidden="true">{agent?.icon ?? '◈'}</span>
                      {agent?.name ?? row.agent}
                    </span>
                    <span className="history-log__project">
                      {project?.name ?? (row.projectId || 'ad-hoc')}
                    </span>
                    <span className="history-log__status">{row.status.toUpperCase()}</span>
                    <span className="history-log__files">{files > 0 ? String(files) : '—'}</span>
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
