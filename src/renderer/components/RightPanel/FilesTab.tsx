import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { ACTIVITY_FEED_CAP } from '../../../shared/constants'
import './FilesTab.css'

/**
 * Files touched by the active session — derived from the session's
 * activity feed (read / write events). Deduped, most-recent first.
 */
export function FilesTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const feed = useAppStore((s) => (activeSessionId ? s.activityFeeds[activeSessionId] : undefined))

  const files = useMemo(() => {
    if (!feed) return []
    const seen = new Map<string, { path: string; action: 'read' | 'write'; ts: number }>()
    for (let i = feed.length - 1; i >= 0; i -= 1) {
      const event = feed[i]
      if (!event) continue
      if (event.type !== 'read' && event.type !== 'write') continue
      const path = event.detail.split(/\s+/)[0]
      if (!path) continue
      const existing = seen.get(path)
      if (!existing) {
        seen.set(path, { path, action: event.type, ts: event.timestamp })
      }
    }
    return [...seen.values()].sort((a, b) => b.ts - a.ts).slice(0, ACTIVITY_FEED_CAP)
  }, [feed])

  if (!activeSessionId) {
    return <div className="ri-tab__empty">Open a session to see its files.</div>
  }

  if (files.length === 0) {
    return (
      <div className="ri-tab__empty">
        No file activity yet. Files the agent reads or writes appear here automatically.
      </div>
    )
  }

  return (
    <ul className="ri-files">
      {files.map((f) => (
        <li key={f.path} className={`ri-files__item ri-files__item--${f.action}`} title={f.path}>
          <span className="ri-files__glyph" aria-hidden="true">
            {f.action === 'write' ? '✎' : '·'}
          </span>
          <span className="ri-files__path">{f.path}</span>
          <span className="ri-files__action">{f.action.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  )
}
