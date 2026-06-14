import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import { getSessionAgentId, AGENT_BY_ID } from '../../utils/agent-ui'
import type { ActivityEvent } from '../../../shared/types'
import './LiveSessionCard.css'

function getPulseClass(event: ActivityEvent | undefined): string {
  if (!event || event.status !== 'active') return 'idle'
  switch (event.type) {
    case 'think':
      return 'thinking'
    case 'write':
      return 'writing'
    case 'tool':
      return 'tool-use'
    case 'read':
      return 'reading'
    default:
      return 'idle'
  }
}

interface LiveSessionCardProps {
  sessionId: string
}

export function LiveSessionCard({ sessionId }: LiveSessionCardProps): React.JSX.Element {
  const session = useAppStore((s) => s.sessions[sessionId])
  // Narrow selector: only the last event in this session's feed — only re-renders
  // when a new event is appended (object reference changes for the new item).
  const latestActivity = useAppStore((s): ActivityEvent | null => {
    const feed = s.activityFeeds[sessionId]
    if (!feed || feed.length === 0) return null
    return feed[feed.length - 1] ?? null
  })
  // Write counter is maintained by the store; O(1) lookup, unaffected by the
  // 500-event feed cap and doesn't iterate events on every mutation.
  const filesChanged = useAppStore((s) => s.writeCountBySession[sessionId] ?? 0)
  const projects = useAppStore((s) => s.projects)

  const elapsed = useElapsedTime(session?.startedAt)

  const project = useMemo(
    () => projects.find((p) => p.id === session?.projectId),
    [projects, session?.projectId],
  )

  const agentId = getSessionAgentId(session, project)
  const meta = AGENT_BY_ID.get(agentId)
  const pulseClass = getPulseClass(latestActivity ?? undefined)

  if (!session) return <div className="live-card live-card-empty" />

  return (
    <div className="live-card">
      <div className="live-card-head">
        <span className="live-card-agent-icon">{meta?.icon ?? '\u25C8'}</span>
        <span className="live-card-agent-name">{meta?.name ?? agentId}</span>
        <span className="live-card-project">{project?.name ?? 'Unknown'}</span>
        <span className="live-card-elapsed">{elapsed}</span>
      </div>

      <div className="live-card-activity">
        <div className={`live-pulse ${pulseClass}`} aria-label={`Agent is ${pulseClass}`} />
        <span className="live-card-activity-text">
          {latestActivity?.title ?? latestActivity?.detail ?? 'Idle'}
        </span>
      </div>

      <div className="live-card-footer">
        <span className="live-card-files">
          {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed
        </span>
      </div>
    </div>
  )
}
