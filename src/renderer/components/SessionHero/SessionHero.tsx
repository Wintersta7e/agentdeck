import type { ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { SessionMetricsStrip } from './SessionMetricsStrip'
import './SessionHero.css'

interface SessionHeroProps {
  children: ReactNode
}

/**
 * Wraps the session view. Phase-1 transitional shape: no rail, no tabs,
 * no header yet — those land in Phases 4 and 5.
 */
export function SessionHero({ children }: SessionHeroProps): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  return (
    <div className="session-hero session-hero--v6-1-0">
      <div className="session-hero__body">
        <div className="session-hero__main">{children}</div>
      </div>
      <SessionMetricsStrip sessionId={activeSessionId} />
    </div>
  )
}
