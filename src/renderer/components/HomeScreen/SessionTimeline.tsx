import { CollapsibleSection } from '../shared/CollapsibleSection'
import { useSessionTimeline } from '../../hooks/useSessionTimeline'
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

export function SessionTimeline(): React.JSX.Element {
  const rows = useSessionTimeline()

  return (
    <CollapsibleSection title="Session Timeline — Today" storageKey="timeline">
      {rows.length === 0 ? (
        <div className="tl-empty">No sessions today</div>
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
      )}
    </CollapsibleSection>
  )
}
