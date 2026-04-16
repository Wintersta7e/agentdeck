import type React from 'react'
import { useDailyDigest } from '../../hooks/useDailyDigest'
import './DailyDigest.css'

export function DailyDigest(): React.JSX.Element {
  const digest = useDailyDigest()

  return (
    <div className="daily-digest">
      <div className="daily-digest-title">Today&apos;s Summary</div>
      <div className="daily-digest-row">
        <span className="daily-digest-label">Sessions</span>
        <span className="daily-digest-value">{digest.sessionsToday}</span>
      </div>
      <div className="daily-digest-row">
        <span className="daily-digest-label">Files changed</span>
        <span className="daily-digest-value">{digest.filesChanged}</span>
      </div>
      <div className="daily-digest-row">
        <span className="daily-digest-label">Cost</span>
        <span className="daily-digest-value daily-digest-cost">${digest.costToday.toFixed(2)}</span>
      </div>
      <div className="daily-digest-row">
        <span className="daily-digest-label">Clean exits</span>
        <span className="daily-digest-value daily-digest-rate">
          {digest.cleanExitRate !== null ? `${Math.round(digest.cleanExitRate)}%` : '\u2014'}
        </span>
      </div>
      <div className="daily-digest-row">
        <span className="daily-digest-label">Top agent</span>
        <span className="daily-digest-value">{digest.topAgent || '\u2014'}</span>
      </div>
    </div>
  )
}
