import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { LiveSessionCard } from './LiveSessionCard'

const MAX_VISIBLE = 4

export function LiveSessionGrid(): React.JSX.Element | null {
  const sessions = useAppStore((s) => s.sessions)

  const runningIds = useMemo(() => {
    return Object.entries(sessions)
      .filter(([, s]) => s.status === 'running')
      .sort(([, a], [, b]) => b.startedAt - a.startedAt)
      .map(([id]) => id)
  }, [sessions])

  if (runningIds.length === 0) {
    return (
      <div className="live-grid-empty">
        No active sessions. Start one with <kbd>Ctrl+N</kbd> or click a project below.
      </div>
    )
  }

  const visible = runningIds.slice(0, MAX_VISIBLE)
  const overflow = runningIds.length - MAX_VISIBLE

  return (
    <div className="live-grid-wrapper">
      <div className="live-grid">
        {visible.map((id) => (
          <LiveSessionCard key={id} sessionId={id} />
        ))}
      </div>
      {overflow > 0 && (
        <div className="live-grid-overflow">
          and {overflow} more session{overflow !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
