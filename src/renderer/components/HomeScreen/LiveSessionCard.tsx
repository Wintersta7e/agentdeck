import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import {
  useEffectiveContext,
  useEffectiveContextForModel,
  badgeLabelFor,
} from '../../hooks/useEffectiveContext'
import { AGENTS } from '../../../shared/agents'
import type { ActivityEvent, ContextSource } from '../../../shared/types'
import './LiveSessionCard.css'

const AGENT_META = new Map(AGENTS.map((a) => [a.id, a]))

const DEFAULT_CONTEXT = 128_000

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function getPulseClass(event: ActivityEvent | undefined): string {
  if (!event || event.status !== 'active') return 'idle'
  switch (event.type) {
    case 'think':
      return 'thinking'
    case 'write':
      return 'writing'
    case 'tool':
      return 'tool-use'
    case 'read':
      return 'reading'
    default:
      return 'idle'
  }
}

interface LiveSessionCardProps {
  sessionId: string
}

export function LiveSessionCard({ sessionId }: LiveSessionCardProps): React.JSX.Element {
  const session = useAppStore((s) => s.sessions[sessionId])
  // Narrow selector: only the last event in this session's feed — only re-renders
  // when a new event is appended (object reference changes for the new item).
  const latestActivity = useAppStore((s): ActivityEvent | null => {
    const feed = s.activityFeeds[sessionId]
    if (!feed || feed.length === 0) return null
    return feed[feed.length - 1] ?? null
  })
  // Write counter is maintained by the store; O(1) lookup, unaffected by the
  // 500-event feed cap and doesn't iterate events on every mutation.
  const filesChanged = useAppStore((s) => s.writeCountBySession[sessionId] ?? 0)
  const usage = useAppStore((s) => s.sessionUsage[sessionId])
  const projects = useAppStore((s) => s.projects)

  const elapsed = useElapsedTime(session?.startedAt)

  const project = useMemo(
    () => projects.find((p) => p.id === session?.projectId),
    [projects, session?.projectId],
  )

  const defaultAgent = project?.agents?.find((a) => a.isDefault)?.agent ?? project?.agent
  const agentId = session?.agentOverride ?? defaultAgent ?? 'claude-code'
  const meta = AGENT_META.get(agentId)
  const pulseClass = getPulseClass(latestActivity ?? undefined)

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)

  // Primary: stored snapshot (immutable, captured at spawn)
  const snapshotValue = session?.resolvedContextWindow
  const snapshotSource = session?.resolvedContextSource ?? null

  // Fallbacks — only fetched when no immutable launch snapshot is present
  const snapshotMissing = snapshotValue === undefined
  const byModel = useEffectiveContextForModel(agentId, session?.model ?? '', {
    enabled: snapshotMissing && Boolean(session?.model),
  })
  const byAgent = useEffectiveContext(agentId, { enabled: snapshotMissing })

  // Resolve display value + source with priority
  const { contextWindow, ctxSource, stale } = (() => {
    if (snapshotValue !== undefined) {
      return {
        contextWindow: snapshotValue,
        ctxSource: snapshotSource,
        stale: false,
      }
    }
    // Pre-v6.0.1 fallback tree
    if (session?.model && byModel.value !== null) {
      return {
        contextWindow: byModel.value,
        ctxSource: byModel.source,
        stale: true,
      }
    }
    if (byAgent.value !== null) {
      return {
        contextWindow: byAgent.value,
        ctxSource: byAgent.source,
        stale: true,
      }
    }
    // Truly nothing — use registry default to keep the gauge from dividing by zero
    return {
      contextWindow: meta?.contextWindow ?? DEFAULT_CONTEXT,
      ctxSource: null as ContextSource | null,
      stale: true,
    }
  })()

  const tokenPct = Math.min(100, (totalTokens / contextWindow) * 100)

  if (!session) return <div className="live-card live-card-empty" />

  return (
    <div className="live-card">
      <div className="live-card-head">
        <span className="live-card-agent-icon">{meta?.icon ?? '\u25C8'}</span>
        <span className="live-card-agent-name">{meta?.name ?? agentId}</span>
        <span className="live-card-project">{project?.name ?? 'Unknown'}</span>
        <span className="live-card-elapsed">{elapsed}</span>
      </div>

      <div className="live-card-activity">
        <div className={`live-pulse ${pulseClass}`} aria-label={`Agent is ${pulseClass}`} />
        <span className="live-card-activity-text">
          {latestActivity?.title ?? latestActivity?.detail ?? 'Idle'}
        </span>
      </div>

      <div className="live-card-gauge">
        <span className="live-card-gauge-label">Tokens</span>
        <div
          className="live-card-gauge-bar"
          role="progressbar"
          aria-valuenow={totalTokens}
          aria-valuemin={0}
          aria-valuemax={contextWindow}
        >
          <div className="live-card-gauge-fill" style={{ width: `${tokenPct}%` }} />
        </div>
        <span className="live-card-gauge-val">
          {formatTokens(totalTokens)} / {formatTokens(contextWindow)}
          {badgeLabelFor(ctxSource, session?.model ?? null) !== null && (
            <span
              className={`live-card-gauge-badge${stale ? ' is-stale' : ''}`}
              aria-label={
                stale
                  ? 'Context value is stale — session spawned before snapshot was introduced'
                  : undefined
              }
            >
              {' '}
              {badgeLabelFor(ctxSource, session?.model ?? null)}
            </span>
          )}
        </span>
      </div>

      <div className="live-card-footer">
        <span className="live-card-cost">
          Cost: <strong>${(usage?.totalCostUsd ?? 0).toFixed(2)}</strong>
        </span>
        <span className="live-card-files">
          {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed
        </span>
      </div>
    </div>
  )
}
