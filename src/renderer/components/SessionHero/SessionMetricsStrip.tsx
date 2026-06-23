import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { getSessionAgentId, selectAgentMeta } from '../../utils/agent-ui'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import './SessionMetricsStrip.css'

interface SessionMetricsStripProps {
  sessionId: string | null
}

function formatElapsed(startedAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Bottom metrics strip for the Session Detail hero — elapsed · writes.
 * Values from sessions slice + writeCountBySession.
 */
export function SessionMetricsStrip({ sessionId }: SessionMetricsStripProps): React.JSX.Element {
  const session = useAppStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const project = useAppStore((s) =>
    session ? (s.projects.find((p) => p.id === session.projectId) ?? null) : null,
  )
  const writeCount = useAppStore((s) => (sessionId ? (s.writeCountBySession[sessionId] ?? 0) : 0))
  const registry = useAgentRegistry()

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const agentId = getSessionAgentId(session, project)
  const meta = selectAgentMeta(registry, agentId)

  return (
    <footer
      className="session-strip"
      style={{ ['--strip-color' as 'color']: `var(${meta.colorVar})` }}
    >
      <div className="session-strip__item">
        <div className="session-strip__label">AGENT</div>
        <div className="session-strip__value session-strip__value--agent">
          <span className="session-strip__glyph" aria-hidden="true">
            {meta.icon}
          </span>
          {meta.name}
        </div>
      </div>

      <div className="session-strip__sep" aria-hidden="true" />

      <div className="session-strip__item">
        <div className="session-strip__label">ELAPSED</div>
        <div className="session-strip__value">
          {session ? formatElapsed(session.startedAt, now) : '—'}
        </div>
      </div>

      <div className="session-strip__sep" aria-hidden="true" />

      <div className="session-strip__item">
        <div className="session-strip__label">WRITES</div>
        <div className="session-strip__value">{writeCount}</div>
      </div>

      <div className="session-strip__spacer" />

      <div className="session-strip__item session-strip__item--status">
        <div className="session-strip__label">STATUS</div>
        <div className={`session-strip__value session-strip__status--${session?.status ?? 'idle'}`}>
          {session?.status === 'running' && (
            <span className="ad-pulse session-strip__pulse" aria-hidden="true" />
          )}
          {(session?.status ?? 'IDLE').toUpperCase()}
        </div>
      </div>
    </footer>
  )
}
