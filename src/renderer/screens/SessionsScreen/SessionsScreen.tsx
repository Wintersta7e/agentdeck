import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import { AGENTS } from '../../../shared/agents'
import type { Session, SessionStatus } from '../../../shared/types'
import './SessionsScreen.css'

type FilterId = 'all' | 'active' | 'done' | 'error'

interface FilterCounts {
  all: number
  active: number
  done: number
  error: number
}

function formatAgo(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function statusTone(s: SessionStatus): string {
  switch (s) {
    case 'running':
      return 'running'
    case 'error':
      return 'error'
    case 'exited':
      return 'done'
    case 'starting':
      return 'starting'
  }
}

function statusLabel(s: SessionStatus): string {
  return s.toUpperCase()
}

const AGENT_META_MAP = new Map(AGENTS.map((a) => [a.id, a]))

function isActive(status: SessionStatus): boolean {
  return status === 'running' || status === 'starting'
}

function isDone(status: SessionStatus): boolean {
  return status === 'exited'
}

function isError(status: SessionStatus): boolean {
  return status === 'error'
}

function matchesFilter(status: SessionStatus, filter: FilterId): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'active':
      return isActive(status)
    case 'done':
      return isDone(status)
    case 'error':
      return isError(status)
  }
}

export function SessionsScreen(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  const sessionUsage = useAppStore((s) => s.sessionUsage)
  const activityFeeds = useAppStore((s) => s.activityFeeds)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setTab = useAppStore((s) => s.setTab)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)

  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const allSessions: Session[] = useMemo(() => Object.values(sessions), [sessions])

  const counts: FilterCounts = useMemo(() => {
    const c: FilterCounts = { all: 0, active: 0, done: 0, error: 0 }
    for (const s of allSessions) {
      c.all += 1
      if (isActive(s.status)) c.active += 1
      if (isDone(s.status)) c.done += 1
      if (isError(s.status)) c.error += 1
    }
    return c
  }, [allSessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allSessions
      .filter((s) => matchesFilter(s.status, filter))
      .filter((s) => {
        if (!q) return true
        const project = projectById.get(s.projectId)
        const haystack = [
          s.id,
          s.projectId,
          project?.name ?? '',
          project?.path ?? '',
          s.agentOverride ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => b.startedAt - a.startedAt)
  }, [allSessions, filter, query, projectById])

  const handleRowClick = useCallback(
    (session: Session) => {
      setActiveSession(session.id)
      // Keep currentView synchronous so SplitView/RightPanel see session immediately
      setCurrentView('sessions')
      setTab('sessions', { sessionId: session.id })
    },
    [setActiveSession, setCurrentView, setTab],
  )

  return (
    <ScreenShell
      eyebrow="All sessions"
      title="Sessions"
      sub="Live, recent, archived. Click a row to open."
      actions={
        <button
          type="button"
          className="sessions-screen__new-btn"
          onClick={() => openCommandPalette(undefined, 'all')}
          title="Launch a new session (Ctrl+K)"
        >
          ▸ NEW SESSION
        </button>
      }
      filters={
        <>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterChip>
          <FilterChip
            active={filter === 'active'}
            dotColor="green"
            onClick={() => setFilter('active')}
            count={counts.active}
          >
            Active
          </FilterChip>
          <FilterChip
            active={filter === 'done'}
            onClick={() => setFilter('done')}
            count={counts.done}
          >
            Done
          </FilterChip>
          <FilterChip
            active={filter === 'error'}
            dotColor="red"
            onClick={() => setFilter('error')}
            count={counts.error}
          >
            Error
          </FilterChip>
          <div className="sessions-screen__filter-spacer" />
          <input
            type="search"
            className="sessions-screen__search"
            placeholder="Search by project, agent, id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter sessions"
          />
        </>
      }
      className="sessions-screen"
    >
      <div className="sessions-table" role="list" aria-label="Sessions list">
        <div className="sessions-table__head" aria-hidden="true">
          <span>State</span>
          <span>Agent</span>
          <span>Project</span>
          <span>Activity</span>
          <span className="sessions-table__num">Tokens</span>
          <span className="sessions-table__num">Cost</span>
          <span className="sessions-table__num">Ago</span>
        </div>
        {filtered.length === 0 ? (
          <div className="sessions-table__empty">
            {allSessions.length === 0
              ? 'No sessions yet. Press Ctrl+K or click ▸ NEW SESSION to launch one.'
              : 'No sessions match this filter.'}
          </div>
        ) : (
          filtered.map((session) => {
            const project = projectById.get(session.projectId)
            const agentId = session.agentOverride ?? 'claude-code'
            const agent = AGENT_META_MAP.get(agentId)
            const usage = sessionUsage[session.id]
            const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)
            const cost = usage?.totalCostUsd ?? 0
            const feed = activityFeeds[session.id]
            const lastEvent = feed && feed.length > 0 ? feed[feed.length - 1] : undefined
            const activity = lastEvent
              ? `${lastEvent.title}: ${lastEvent.detail}`
              : 'Ready for instructions'
            const tone = statusTone(session.status)

            return (
              <button
                key={session.id}
                type="button"
                className={`sessions-table__row sessions-row--${tone}`}
                onClick={() => handleRowClick(session)}
                title={`Open session ${session.id}`}
              >
                <span className="sessions-row__state">
                  {session.status === 'running' && (
                    <span className="ad-pulse sessions-row__pulse" aria-hidden="true" />
                  )}
                  <span className="sessions-row__state-label">{statusLabel(session.status)}</span>
                </span>
                <span className="sessions-row__agent">
                  <span className="sessions-row__agent-glyph" aria-hidden="true">
                    {agent?.icon ?? '◈'}
                  </span>
                  <span className="sessions-row__agent-name">{agent?.name ?? agentId}</span>
                </span>
                <span className="sessions-row__project">
                  <span className="sessions-row__project-name">
                    {project?.name ?? (session.projectId || 'ad-hoc')}
                  </span>
                </span>
                <span className="sessions-row__activity">{activity}</span>
                <span className="sessions-row__num">
                  {totalTokens > 0 ? formatTokens(totalTokens) : '—'}
                </span>
                <span className="sessions-row__num sessions-row__cost">
                  {cost > 0 ? formatCost(cost) : '—'}
                </span>
                <span className="sessions-row__num sessions-row__ago">
                  {formatAgo(session.startedAt)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </ScreenShell>
  )
}
