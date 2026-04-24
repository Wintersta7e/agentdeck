import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { AGENT_BY_ID, agentColorVar, agentShort } from '../../utils/agent-ui'
import { useEffectiveContext, badgeLabelFor } from '../../hooks/useEffectiveContext'
import type { AgentType } from '../../../shared/types'
import './AgentChipB1.css'

function formatContextWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

interface AgentChipProps {
  agentId: AgentType
}

/**
 * B1-style agent chip — tinted border + glyph, short code, full name,
 * context window size, live running-count badge with pulse.
 */
export function AgentChipB1({ agentId }: AgentChipProps): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const agent = AGENT_BY_ID.get(agentId)

  const ctx = useEffectiveContext(agentId)

  const runningCount = useMemo(
    () =>
      Object.values(sessions).filter(
        (sess) => sess.status === 'running' && (sess.agentOverride ?? 'claude-code') === agentId,
      ).length,
    [sessions, agentId],
  )

  if (!agent) return <></>

  const displayValue = ctx.value ?? agent.contextWindow
  const badge = badgeLabelFor(ctx.source, ctx.modelId)
  const colorVar = agentColorVar(agentId)

  return (
    <article
      className="agent-chip-b1"
      style={{ ['--chip-color' as 'color']: `var(${colorVar})` }}
      aria-label={agent.name}
    >
      <div className="agent-chip-b1__head">
        <span className="agent-chip-b1__glyph" aria-hidden="true">
          {agent.icon}
        </span>
        <span className="agent-chip-b1__short">{agentShort(agentId)}</span>
      </div>
      <div className="agent-chip-b1__name">{agent.name}</div>
      <div className="agent-chip-b1__ctx">
        ctx {formatContextWindow(displayValue)}
        {badge !== null && <span className="agent-chip-b1__ctx-badge">{badge}</span>}
      </div>
      {runningCount > 0 && (
        <span className="agent-chip-b1__running">
          <span className="ad-pulse agent-chip-b1__running-dot" aria-hidden="true" />
          {runningCount}
        </span>
      )}
    </article>
  )
}

/** Full 7-agent strip — used on Home in the AGENTS panel. */
export function AgentChipStripB1(): React.JSX.Element {
  return (
    <div className="agent-chip-b1__grid">
      {AGENTS.map((a) => (
        <AgentChipB1 key={a.id} agentId={a.id as AgentType} />
      ))}
    </div>
  )
}
