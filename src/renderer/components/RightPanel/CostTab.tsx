import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { AgentType } from '../../../shared/types'
import './CostTab.css'

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * Session-level cost breakdown for the right inspector.
 * Pulls live token usage + cost from the sessionUsage slice.
 */
export function CostTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined))
  const usage = useAppStore((s) => (activeSessionId ? s.sessionUsage[activeSessionId] : undefined))

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000)
    return () => window.clearInterval(id)
  }, [])

  const agentId = (session?.agentOverride ?? 'claude-code') as AgentType
  const agent = AGENT_BY_ID.get(agentId)

  const totals = useMemo(() => {
    const input = usage?.inputTokens ?? 0
    const output = usage?.outputTokens ?? 0
    const cacheRead = usage?.cacheReadTokens ?? 0
    const cacheWrite = usage?.cacheWriteTokens ?? 0
    const total = input + output + cacheRead + cacheWrite
    const cost = usage?.totalCostUsd ?? 0
    const elapsedMin = session ? Math.max(1, (now - session.startedAt) / 60000) : 1
    return {
      input,
      output,
      cacheRead,
      cacheWrite,
      total,
      cost,
      costPerMin: cost / elapsedMin,
      tokensPerMin: Math.round(total / elapsedMin),
    }
  }, [usage, session, now])

  if (!activeSessionId) {
    return <div className="ri-tab__empty">Open a session to see its cost.</div>
  }

  return (
    <div className="ri-cost">
      <div
        className="ri-cost__hero"
        style={{ ['--sel-color' as 'color']: `var(${agentColorVar(agentId)})` }}
      >
        <div className="ri-cost__hero-label">Total spend</div>
        <div className="ri-cost__hero-value">{formatCost(totals.cost)}</div>
        <div className="ri-cost__hero-meta">
          <span aria-hidden="true">{agent?.icon ?? '◈'}</span>
          {agent?.name ?? agentId}
        </div>
      </div>

      <dl className="ri-cost__list">
        <div>
          <dt>Input tokens</dt>
          <dd>{formatTokens(totals.input)}</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>{formatTokens(totals.output)}</dd>
        </div>
        <div>
          <dt>Cache read</dt>
          <dd>{formatTokens(totals.cacheRead)}</dd>
        </div>
        <div>
          <dt>Cache write</dt>
          <dd>{formatTokens(totals.cacheWrite)}</dd>
        </div>
        <div>
          <dt>Total tokens</dt>
          <dd className="ri-cost__emph">{formatTokens(totals.total)}</dd>
        </div>
        <div>
          <dt>Tok / min</dt>
          <dd>{formatTokens(totals.tokensPerMin)}</dd>
        </div>
        <div>
          <dt>$ / min</dt>
          <dd>{formatCost(totals.costPerMin)}</dd>
        </div>
      </dl>
    </div>
  )
}
