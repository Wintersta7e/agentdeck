import React from 'react'
import type { OfficeWorker } from '../../shared/office-types'
import { AGENTS } from '../../shared/agents'

interface OfficeSidebarProps {
  workers: OfficeWorker[]
}

const ACTIVITY_LABELS: Record<string, string> = {
  spawning: 'Starting up…',
  working: 'Working',
  'idle-coffee': 'Coffee break',
  'idle-window': 'Staring out the window',
}

function formatCost(usd: number): string {
  if (usd === 0) return ''
  return `$${usd.toFixed(2)}`
}

export function OfficeSidebar({ workers }: OfficeSidebarProps): React.JSX.Element {
  const handleClick = (sessionId: string): void => {
    window.agentDeckOffice?.focusSession(sessionId)
  }

  return (
    <aside className="office-sidebar" role="list" aria-label="Office workers">
      <div className="office-sidebar-header">Workers ({workers.length})</div>
      {workers.length === 0 && <div className="office-empty">No active sessions</div>}
      {workers.map((w) => {
        const agentDef = AGENTS.find((a) => a.id === w.agentId)
        return (
          <div
            key={w.id}
            className="office-worker-row"
            role="listitem"
            tabIndex={0}
            onClick={() => handleClick(w.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick(w.id)
              }
            }}
          >
            <span className="office-worker-agent-icon" aria-hidden="true">
              {agentDef?.icon ?? '?'}
            </span>
            <div className="office-worker-info">
              <div className="office-worker-label">{w.sessionLabel}</div>
              <div className="office-worker-activity">
                {ACTIVITY_LABELS[w.activity] ?? w.activity}
              </div>
            </div>
            {w.costUsd > 0 && <span className="office-worker-cost">{formatCost(w.costUsd)}</span>}
          </div>
        )
      })}
      <div className="office-live-region" role="status" aria-live="polite" aria-atomic="true" />
    </aside>
  )
}
