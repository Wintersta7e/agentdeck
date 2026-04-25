import type { ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { SessionMetricsStrip } from './SessionMetricsStrip'
import { SessionTabs } from '../SessionTabs/SessionTabs'
import { SessionHeader } from '../SessionHeader/SessionHeader'
import './SessionHero.css'

interface SessionHeroProps {
  children: ReactNode
}

export function SessionHero({ children }: SessionHeroProps): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  return (
    <div className="session-hero">
      <SessionTabs />
      <SessionHeader />
      <div className="session-hero__body">
        <div className="session-hero__main">{children}</div>
      </div>
      <SessionMetricsStrip sessionId={activeSessionId} />
    </div>
  )
}
