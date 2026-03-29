import { useCallback, useEffect, useRef, useState } from 'react'
import { X, AlertTriangle, Info, Copy, Check } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import './NotificationToast.css'

export function NotificationToast(): React.JSX.Element | null {
  const notifications = useAppStore((s) => s.notifications)
  const dismissNotification = useAppStore((s) => s.dismissNotification)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timedIdRef = useRef<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Auto-dismiss after 5 seconds — skip error toasts (they require manual close)
  useEffect(() => {
    if (notifications.length === 0) {
      timedIdRef.current = null
      return
    }
    const oldest = notifications[0]
    if (!oldest) return
    // Error toasts don't auto-dismiss
    if (oldest.type === 'error') {
      timedIdRef.current = null
      return
    }
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

  const handleCopy = useCallback((e: React.MouseEvent, id: string, message: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(message).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  const handleClick = useCallback(
    (id: string) => {
      if (expandedId === id) {
        dismissNotification(id)
        setExpandedId(null)
      } else {
        setExpandedId(id)
      }
    },
    [expandedId, dismissNotification],
  )

  const visible = notifications.slice(0, 5)

  if (visible.length === 0) return null

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {visible.map((n) => {
        const isExpanded = expandedId === n.id
        return (
          <div
            key={n.id}
            className={`toast toast-${n.type}${isExpanded ? ' toast-expanded' : ''}`}
            onClick={() => handleClick(n.id)}
            role={n.type === 'error' ? 'alert' : 'status'}
            aria-live={n.type === 'error' ? 'assertive' : 'polite'}
          >
            <span className="toast-icon">
              {n.type === 'error' ? (
                <X size={14} />
              ) : n.type === 'warning' ? (
                <AlertTriangle size={14} />
              ) : (
                <Info size={14} />
              )}
            </span>
            <span className="toast-message">{n.message}</span>
            <button
              className="toast-copy"
              onClick={(e) => handleCopy(e, n.id, n.message)}
              aria-label="Copy message"
              type="button"
            >
              {copiedId === n.id ? <Check size={12} /> : <Copy size={12} />}
            </button>
            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation()
                dismissNotification(n.id)
                if (expandedId === n.id) setExpandedId(null)
              }}
              aria-label="Dismiss notification"
              type="button"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
