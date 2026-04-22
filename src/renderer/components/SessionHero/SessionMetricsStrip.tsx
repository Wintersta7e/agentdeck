import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { AgentType } from '../../../shared/types'
import './SessionMetricsStrip.css'

interface SessionMetricsStripProps {
  sessionId: string | null
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
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
 * Bottom metrics strip for the Session Detail hero — tokens/min ·
 * elapsed · LOC touched · cost. Values from existing cost-tracker +
 * sessions slice + writeCountBySession.
 */
export function SessionMetricsStrip({ sessionId }: SessionMetricsStripProps): React.JSX.Element {
  const session = useAppStore((s) => (sessionId ? s.sessions[sessionId] : undefined))
  const usage = useAppStore((s) => (sessionId ? s.sessionUsage[sessionId] : undefined))
  const writeCount = useAppStore((s) => (sessionId ? (s.writeCountBySession[sessionId] ?? 0) : 0))

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const agentId = (session?.agentOverride ?? 'claude-code') as AgentType
  const agent = AGENT_BY_ID.get(agentId)

  const totals = useMemo(() => {
    const input = usage?.inputTokens ?? 0
    const output = usage?.outputTokens ?? 0
    const tokens = input + output
    const cost = usage?.totalCostUsd ?? 0
    const elapsedMin = session ? Math.max(1, (now - session.startedAt) / 60000) : 1
    return { tokens, cost, input, output, elapsedMin }
  }, [usage, session, now])

  const tokensPerMin = Math.round(totals.tokens / totals.elapsedMin)

  return (
    <footer
      className="session-strip"
      style={{ ['--strip-color' as 'color']: `var(${agentColorVar(agentId)})` }}
    >
      <div className="session-strip__item">
        <div className="session-strip__label">AGENT</div>
        <div className="session-strip__value session-strip__value--agent">
          <span className="session-strip__glyph" aria-hidden="true">
            {agent?.icon ?? '◈'}
          </span>
          {agent?.name ?? agentId}
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
        <div className="session-strip__label">TOKENS</div>
        <div className="session-strip__value">{formatTokens(totals.tokens)}</div>
      </div>

      <div className="session-strip__sep" aria-hidden="true" />

      <div className="session-strip__item">
        <div className="session-strip__label">TOK/MIN</div>
        <div className="session-strip__value">{formatTokens(tokensPerMin)}</div>
      </div>

      <div className="session-strip__sep" aria-hidden="true" />

      <div className="session-strip__item">
        <div className="session-strip__label">WRITES</div>
        <div className="session-strip__value">{writeCount}</div>
      </div>

      <div className="session-strip__sep" aria-hidden="true" />

      <div className="session-strip__item">
        <div className="session-strip__label">COST</div>
        <div className="session-strip__value session-strip__value--cost">
          {formatCost(totals.cost)}
        </div>
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
