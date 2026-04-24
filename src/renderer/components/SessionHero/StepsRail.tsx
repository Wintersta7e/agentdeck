import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ACTIVITY_FEED_CAP } from '../../../shared/constants'
import './StepsRail.css'

interface StepsRailProps {
  sessionId: string | null
}

type StepTone = 'read' | 'write' | 'command' | 'tool' | 'think' | 'error'

const TONE_CLASS: Record<StepTone, string> = {
  read: 'read',
  write: 'write',
  command: 'command',
  tool: 'tool',
  think: 'think',
  error: 'error',
}

function relativeMinutes(ts: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

/**
 * Prototype's B1StepsRail — chronological stream of the agent's actions,
 * parsed straight from the session's ActivityEvent feed. Shows up to
 * ACTIVITY_FEED_CAP events; visually highlights the active step and
 * differentiates done/pending by color.
 */
export function StepsRail({ sessionId }: StepsRailProps): React.JSX.Element {
  const feed = useAppStore((s) => (sessionId ? s.activityFeeds[sessionId] : undefined))

  const steps = useMemo(() => {
    if (!feed) return []
    // Most recent first
    return feed.slice(-Math.min(feed.length, ACTIVITY_FEED_CAP)).reverse()
  }, [feed])

  const activeIdx = useMemo(() => steps.findIndex((s) => s.status === 'active'), [steps])

  // Tick every 20 s so "relative time" labels refresh without spamming renders
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <aside className="steps-rail" aria-label="Session steps">
      <header className="steps-rail__head">
        <span className="steps-rail__title">STEPS</span>
        <span className="steps-rail__count">{steps.length > 0 ? `${steps.length}` : '0'}</span>
      </header>

      {steps.length === 0 ? (
        <div className="steps-rail__empty">
          Actions appear here as the agent reads, writes, runs commands, and thinks.
        </div>
      ) : (
        <ol className="steps-rail__list">
          {steps.map((step, i) => {
            const tone = TONE_CLASS[step.type as StepTone] ?? 'tool'
            const isActive = i === activeIdx
            const statusTone =
              step.status === 'active' ? 'active' : step.status === 'pending' ? 'pending' : 'done'
            return (
              <li
                key={step.id}
                className={`steps-rail__step steps-rail__step--${tone} steps-rail__step--${statusTone}${isActive ? ' is-active' : ''}`}
              >
                <div className="steps-rail__connector" aria-hidden="true" />
                <div className="steps-rail__dot" aria-hidden="true" />
                <div className="steps-rail__body">
                  <div className="steps-rail__row">
                    <span className="steps-rail__type">{step.type.toUpperCase()}</span>
                    <span className="steps-rail__time">{relativeMinutes(step.timestamp, now)}</span>
                  </div>
                  <div className="steps-rail__title-row">{step.title}</div>
                  <div className="steps-rail__detail" title={step.detail}>
                    {step.detail}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
