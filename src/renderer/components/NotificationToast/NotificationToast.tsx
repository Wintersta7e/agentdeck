import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, AlertTriangle, Info, Copy, Check } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import './NotificationToast.css'

export function NotificationToast(): React.JSX.Element | null {
  const notifications = useAppStore((s) => s.notifications)
  const silencedToastIds = useAppStore((s) => s.silencedToastIds)
  const silenceToast = useAppStore((s) => s.silenceToast)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Only notifications that haven't been silenced (i.e. never surfaced on the
  // toast rail or manually closed) are candidates for display. The persistent
  // list remains available in the Alerts tab.
  const active = useMemo(() => {
    const silenced = new Set(silencedToastIds)
    return notifications.filter(
      (n): n is Extract<typeof n, { kind: 'basic' }> => n.kind === 'basic' && !silenced.has(n.id),
    )
  }, [notifications, silencedToastIds])

  // Auto-silence (not delete) after 5 s — skip error toasts (sticky). The
  // timer is closed over by a local const so the cleanup is always the timer
  // we actually scheduled, even when `active` changes in quick bursts.
  useEffect(() => {
    const oldest = active[0]
    if (!oldest || oldest.type === 'error') return
    const remaining = Math.max(0, oldest.timestamp + 5000 - Date.now())
    const timer = setTimeout(() => silenceToast(oldest.id), remaining)
    return () => clearTimeout(timer)
  }, [active, silenceToast])

  const handleCopy = useCallback((e: React.MouseEvent, id: string, message: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(message).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  // Clicking the toast expands it; clicking again hides the toast (silences,
  // still readable in Alerts tab). The explicit × button fully dismisses.
  const handleClick = useCallback(
    (id: string) => {
      if (expandedId === id) {
        silenceToast(id)
        setExpandedId(null)
      } else {
        setExpandedId(id)
      }
    },
    [expandedId, silenceToast],
  )

  const visible = active.slice(0, 5)

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
                // Close from toast = silence only (keeps a copy in Alerts);
                // Alerts tab has its own full-dismiss buttons.
                silenceToast(n.id)
                if (expandedId === n.id) setExpandedId(null)
              }}
              aria-label="Hide toast"
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
