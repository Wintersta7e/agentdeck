import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import './NotificationToast.css'

export function NotificationToast(): React.JSX.Element | null {
  const notifications = useAppStore((s) => s.notifications)
  const dismissNotification = useAppStore((s) => s.dismissNotification)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timedIdRef = useRef<string | null>(null)

  // Auto-dismiss after 5 seconds — only reset the timer when the oldest notification changes
  useEffect(() => {
    if (notifications.length === 0) {
      timedIdRef.current = null
      return
    }
    const oldest = notifications[0]
    if (!oldest) return
    // Don't reset the timer if we're already timing this notification
    if (timedIdRef.current === oldest.id) return

    timedIdRef.current = oldest.id
    if (timerRef.current) clearTimeout(timerRef.current)
    const remaining = Math.max(0, oldest.timestamp + 5000 - Date.now())
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      timedIdRef.current = null
      dismissNotification(oldest.id)
    }, remaining)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
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
