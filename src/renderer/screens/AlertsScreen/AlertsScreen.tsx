import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import './AlertsScreen.css'

type AlertType = 'error' | 'warning' | 'info'
type FilterId = 'all' | AlertType

interface Notification {
  id: string
  type: AlertType
  message: string
  timestamp: number
}

const TYPE_LABEL: Record<AlertType, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Notices',
}

function formatAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${Math.max(1, secs)}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AlertsScreen(): React.JSX.Element {
  const notifications = useAppStore((s) => s.notifications)
  const dismissNotification = useAppStore((s) => s.dismissNotification)

  const [filter, setFilter] = useState<FilterId>('all')

  const counts = useMemo(() => {
    const c: Record<'all' | AlertType, number> = { all: 0, error: 0, warning: 0, info: 0 }
    for (const n of notifications) {
      c.all += 1
      c[n.type] += 1
    }
    return c
  }, [notifications])

  const filtered: Notification[] = useMemo(() => {
    const pool = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter)
    return [...pool].sort((a, b) => b.timestamp - a.timestamp)
  }, [notifications, filter])

  const grouped = useMemo(() => {
    const groups: Record<AlertType, Notification[]> = { error: [], warning: [], info: [] }
    for (const n of filtered) groups[n.type].push(n)
    return groups
  }, [filtered])

  const handleDismissAll = useCallback(() => {
    for (const n of filtered) dismissNotification(n.id)
  }, [filtered, dismissNotification])

  return (
    <ScreenShell
      eyebrow="Notifications"
      title="Alerts"
      sub="Everything that wanted your attention. Dismiss the ones you've handled."
      actions={
        <button
          type="button"
          className="alerts-screen__clear-btn"
          onClick={handleDismissAll}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? 'Nothing to clear' : 'Dismiss the current selection'}
        >
          Clear {filter === 'all' ? 'all' : filter}
        </button>
      }
      filters={
        <>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterChip>
          <FilterChip
            active={filter === 'error'}
            dotColor="red"
            onClick={() => setFilter('error')}
            count={counts.error}
          >
            Errors
          </FilterChip>
          <FilterChip
            active={filter === 'warning'}
            dotColor="accent"
            onClick={() => setFilter('warning')}
            count={counts.warning}
          >
            Warnings
          </FilterChip>
          <FilterChip
            active={filter === 'info'}
            onClick={() => setFilter('info')}
            count={counts.info}
          >
            Notices
          </FilterChip>
        </>
      }
      className="alerts-screen"
    >
      {filtered.length === 0 ? (
        <div className="alerts-screen__empty" role="status">
          <div className="alerts-screen__empty-icon" aria-hidden="true">
            ◎
          </div>
          <div className="alerts-screen__empty-title">Nothing to review</div>
          <div className="alerts-screen__empty-sub">
            You&rsquo;re caught up. New notifications land here as they happen.
          </div>
        </div>
      ) : (
        (Object.entries(grouped) as Array<[AlertType, Notification[]]>).map(([type, items]) => {
          if (items.length === 0) return null
          return (
            <section key={type} className={`alerts-group alerts-group--${type}`}>
              <header className="alerts-group__head">
                <span className={`alerts-group__dot alerts-group__dot--${type}`} />
                <span className="alerts-group__label">{TYPE_LABEL[type]}</span>
                <span className="alerts-group__count">{items.length}</span>
              </header>
              <ul className="alerts-list">
                {items.map((n) => (
                  <li key={n.id} className={`alert-row alert-row--${n.type}`}>
                    <span className="alert-row__time">{formatAgo(n.timestamp)}</span>
                    <span className="alert-row__message">{n.message}</span>
                    <button
                      type="button"
                      className="alert-row__dismiss"
                      onClick={() => dismissNotification(n.id)}
                      aria-label="Dismiss alert"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </ScreenShell>
  )
}
