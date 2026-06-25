import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { getSessionAgentId, selectAgentMeta } from '../../utils/agent-ui'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
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
  const projects = useAppStore((s) => s.projects)
  const registry = useAgentRegistry()
  const meta = selectAgentMeta(registry, agentId)
  const descriptor = registry.find((d) => d.id === agentId)

  const ctx = useEffectiveContext(agentId)

  const runningCount = useMemo(() => {
    const projectById = new Map(projects.map((p) => [p.id, p]))
    return Object.values(sessions).filter(
      (sess) =>
        sess.status === 'running' &&
        getSessionAgentId(sess, projectById.get(sess.projectId)) === agentId,
    ).length
  }, [sessions, projects, agentId])

  const displayValue = ctx.value ?? descriptor?.contextWindow ?? 0
  const badge = badgeLabelFor(ctx.source, ctx.modelId)

  return (
    <article
      className="agent-chip-b1"
      style={{ ['--chip-color' as 'color']: `var(${meta.colorVar})` }}
      aria-label={meta.name}
      {...(meta.isRegistered ? {} : { title: 'Agent no longer registered' })}
    >
      <div className="agent-chip-b1__head">
        <span className="agent-chip-b1__glyph" aria-hidden="true">
          {meta.icon}
        </span>
        <span className="agent-chip-b1__short">{meta.short}</span>
      </div>
      <div className="agent-chip-b1__name">{meta.name}</div>
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
