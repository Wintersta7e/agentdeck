import { useMemo } from 'react'
import { CollapsibleSection } from '../shared/CollapsibleSection'
import { useSessionTimeline } from '../../hooks/useSessionTimeline'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { useMidnight } from '../../hooks/useMidnight'
import './SessionTimeline.css'

const LEGEND = [
  { type: 'think', label: 'Thinking', color: 'var(--accent)' },
  { type: 'write', label: 'Writing', color: 'var(--green)' },
  { type: 'tool', label: 'Tool use', color: 'var(--blue)' },
  { type: 'error', label: 'Error', color: 'var(--red)' },
]

const SEG_COLORS: Record<string, string> = {
  think: 'tl-think',
  write: 'tl-write',
  tool: 'tl-tool',
  error: 'tl-error',
  read: 'tl-idle',
  command: 'tl-tool',
}

// Inner component — only mounted when CollapsibleSection is open, so the hooks
// only run when the section is actually visible.
function SessionTimelineContent(): React.JSX.Element {
  const rows = useSessionTimeline()
  const historyRows = useSessionHistory(1)
  const midnight = useMidnight()

  // A session counts as "today" if it started at or after midnight.
  // Persisted records are authoritative — if any ran today we don't show empty.
  const hasTodaySessions = useMemo(
    () => historyRows.some((r) => r.startedAt >= midnight),
    [historyRows, midnight],
  )

  const isEmpty = rows.length === 0 && !hasTodaySessions

  return isEmpty ? (
    <div className="tl-empty">
      No agent activity recorded today. Start an agent session to see the timeline.
    </div>
  ) : rows.length === 0 ? (
    // Sessions ran today (persisted) but activityFeeds aren't available (e.g. after
    // restart). Show a quiet placeholder so the section isn't incorrectly empty.
    <div className="tl-empty tl-empty--has-history">
      Session data recorded — detailed timeline available for active sessions.
    </div>
  ) : (
    <div className="tl-container">
      {rows.map((row) => (
        <div key={row.sessionId} className="tl-row">
          <span className="tl-label">{row.label}</span>
          <div className="tl-track">
            {row.segments.map((seg, i) => (
              <div
                key={i}
                className={`tl-seg ${SEG_COLORS[seg.type] ?? 'tl-idle'}`}
                style={{ width: `${seg.widthPct}%` }}
              />
            ))}
          </div>
          <span className="tl-duration">{row.duration}</span>
        </div>
      ))}
      <div className="tl-legend">
        {LEGEND.map((l) => (
          <div key={l.type} className="tl-legend-item">
            <div className="tl-legend-dot" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SessionTimeline(): React.JSX.Element {
  return (
    <CollapsibleSection title="Session Timeline — Today" storageKey="timeline">
      <SessionTimelineContent />
    </CollapsibleSection>
  )
}
