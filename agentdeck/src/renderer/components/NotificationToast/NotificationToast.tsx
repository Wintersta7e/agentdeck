import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import './NotificationToast.css'

export function NotificationToast(): React.JSX.Element | null {
  const notifications = useAppStore((s) => s.notifications)
  const dismissNotification = useAppStore((s) => s.dismissNotification)

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (notifications.length === 0) return
    const oldest = notifications[0]
    if (!oldest) return
    const age = Date.now() - oldest.timestamp
    const remaining = Math.max(5000 - age, 100)
    const timer = setTimeout(() => dismissNotification(oldest.id), remaining)
    return () => clearTimeout(timer)
  }, [notifications, dismissNotification])

  const visible = notifications.slice(-5)

  if (visible.length === 0) return null

  return (
    <div className="toast-container">
      {visible.map((n) => (
        <div
          key={n.id}
          className={`toast toast-${n.type}`}
          onClick={() => dismissNotification(n.id)}
        >
          <span className="toast-icon">
            {n.type === 'error' ? '\u2717' : n.type === 'warning' ? '\u26A0' : '\u2139'}
          </span>
          <span className="toast-message">{n.message}</span>
        </div>
      ))}
    </div>
  )
}
