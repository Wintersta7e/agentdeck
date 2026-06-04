import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { isoKeyFromTs } from '../../../shared/date-keys'
import { formatDuration } from '../../utils/format-duration'
import type { ProductivityData } from '../../hooks/useProductivity'
import './ProductivityPanel.css'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function dowIndex(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00`)
  return (d.getDay() + 6) % 7
}

export function ProductivityPanel({
  data,
  midnight,
}: {
  data: ProductivityData
  midnight: number
}): React.JSX.Element {
  const { history, sessions, activeMs, filesChanged } = data
  const projects = useAppStore((s) => s.projects)
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  const todayIso = isoKeyFromTs(midnight)

  const series = useMemo(() => {
    const days: Array<{ iso: string; files: number; dow: string }> = []
    for (let i = 6; i >= 0; i -= 1) {
      const iso = isoKeyFromTs(midnight - i * 86_400_000)
      const entry = history.find((e) => e.date === iso)
      const files = iso === todayIso ? filesChanged : (entry?.filesChanged ?? 0)
      days.push({ iso, files, dow: WEEKDAYS[dowIndex(iso)] ?? '' })
    }
    return days
  }, [history, filesChanged, midnight, todayIso])

  const maxFiles = series.reduce((m, d) => (d.files > m ? d.files : m), 1)

  const perProject = useMemo(() => {
    const combined: Record<string, number> = {}
    for (const e of history) {
      for (const [pid, t] of Object.entries(e.perProject)) {
        combined[pid] = (combined[pid] ?? 0) + t.filesChanged
      }
    }
    return Object.entries(combined)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [history])

  const maxProject = perProject.length > 0 ? Math.max(...perProject.map(([, v]) => v)) : 1

  return (
    <div className="prod-panel">
      <div className="prod-panel__stats">
        <div className="prod-panel__stat">
          <span className="prod-panel__num">{sessions}</span>
          <span className="prod-panel__lbl">sessions</span>
        </div>
        <div className="prod-panel__stat">
          <span className="prod-panel__num">{formatDuration(activeMs)}</span>
          <span className="prod-panel__lbl">active</span>
        </div>
        <div className="prod-panel__stat">
          <span className="prod-panel__num">{filesChanged}</span>
          <span className="prod-panel__lbl">files</span>
        </div>
      </div>

      <div className="prod-panel__spark" aria-label="Files changed, last 7 days">
        {series.map((d) => (
          <div key={d.iso} className="prod-panel__bar-wrap">
            <div className="prod-panel__bar" style={{ height: `${(d.files / maxFiles) * 100}%` }} />
            <span className="prod-panel__dow">{d.dow}</span>
          </div>
        ))}
      </div>

      <div className="prod-panel__projects">
        {perProject.length === 0 ? (
          <div className="prod-panel__empty">No activity this week.</div>
        ) : (
          perProject.map(([pid, files]) => (
            <div key={pid} className="prod-panel__proj-row">
              <span className="prod-panel__proj-name">{projectName.get(pid) ?? pid}</span>
              <div className="prod-panel__proj-track">
                <span
                  className="prod-panel__proj-fill"
                  style={{ width: `${Math.max(4, (files / maxProject) * 100)}%` }}
                />
              </div>
              <span className="prod-panel__proj-num">{files}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
