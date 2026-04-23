import type { ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { StepsRail } from './StepsRail'
import { SessionMetricsStrip } from './SessionMetricsStrip'
import './SessionHero.css'

interface SessionHeroProps {
  children: ReactNode
}

/**
 * Wraps the persistent session view panel (SplitView + RightPanel) with
 * the B1SessionDetail chrome: left steps rail parsed from the active
 * session's activity feed, and a bottom metrics strip. Collapses to a
 * plain column in 2/3-pane mode so the existing SplitView chrome is
 * unobstructed.
 */
export function SessionHero({ children }: SessionHeroProps): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const paneLayout = useAppStore((s) => s.paneLayout)
  const isSinglePane = paneLayout === 1

  return (
    <div
      className={`session-hero${isSinglePane ? ' session-hero--hero' : ' session-hero--compact'}`}
    >
      <div className="session-hero__body">
        {isSinglePane && (
          <div className="session-hero__rail">
            <StepsRail sessionId={activeSessionId} />
          </div>
        )}
        <div className="session-hero__main">{children}</div>
      </div>
      <SessionMetricsStrip sessionId={activeSessionId} />
    </div>
  )
}
