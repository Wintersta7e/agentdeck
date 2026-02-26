import { useAppStore } from '../../store/appStore'
import './ActivityTab.css'

export function ActivityTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activityFeeds = useAppStore((s) => s.activityFeeds)

  const events = activeSessionId ? (activityFeeds[activeSessionId] ?? []) : []

  if (events.length === 0) {
    return <div className="panel-placeholder">No activity yet</div>
  }

  return (
    <div>
      {events.map((event, i) => (
        <div key={event.id} className="activity-item">
          <div className="activity-line">
            <div className={`activity-dot ${event.status}`} />
            {i < events.length - 1 && <div className="activity-connector" />}
          </div>
          <div className="activity-content">
            <div className="activity-title">{event.title}</div>
            {event.detail && <div className="activity-detail">{event.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
