import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { useEffectiveContext, badgeLabelFor } from '../../hooks/useEffectiveContext'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import './AgentsScreen.css'

type AgentRecord = (typeof AGENTS)[number]
type FilterId = 'all' | 'installed' | 'update' | 'missing'

interface VersionInfo {
  current: string | null
  latest: string | null
  updateAvailable: boolean
  checking: boolean
  updating: boolean
}

function formatContextWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

interface AgentTileProps {
  agent: AgentRecord
  installed: boolean
  version: VersionInfo | undefined
  updating: boolean
  onUpdate: (agentId: string) => void
}

function AgentTile({
  agent,
  installed,
  version,
  updating,
  onUpdate,
}: AgentTileProps): React.JSX.Element {
  const ctx = useEffectiveContext(agent.id)
  const displayValue = ctx.value ?? agent.contextWindow
  const badge = badgeLabelFor(ctx.source, ctx.modelId)

  const current = version?.current ?? null
  const latest = version?.latest ?? null
  const updateAvailable = Boolean(version?.updateAvailable)

  const status: { label: string; tone: 'installed' | 'update' | 'missing' | 'updating' } = updating
    ? { label: 'Updating…', tone: 'updating' }
    : !installed
      ? { label: 'Not installed', tone: 'missing' }
      : updateAvailable
        ? { label: 'Update available', tone: 'update' }
        : { label: 'Up to date', tone: 'installed' }

  const canUpdate = installed && Boolean(agent.updateCmd) && !updating

  return (
    <article
      className={`agent-tile agent-tile--${status.tone}`}
      aria-label={`${agent.name} ${status.label}`}
    >
      <div className="agent-tile__head">
        <span className="agent-tile__glyph" aria-hidden="true">
          {agent.icon}
        </span>
        <div className="agent-tile__title">
          <div className="agent-tile__name">{agent.name}</div>
          <div className="agent-tile__binary">{agent.binary}</div>
        </div>
        <span className={`agent-tile__status agent-tile__status--${status.tone}`}>
          {status.label}
        </span>
      </div>
      <p className="agent-tile__desc">{agent.description}</p>
      <dl className="agent-tile__meta">
        <div>
          <dt>Context</dt>
          <dd>
            {formatContextWindow(displayValue)}
            {badge !== null && <span className="agent-tile__ctx-badge">{badge}</span>}
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{current ?? '—'}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{latest ?? '—'}</dd>
        </div>
      </dl>
      <div className="agent-tile__actions">
        <button
          type="button"
          className="agent-tile__update-btn"
          disabled={!canUpdate || !updateAvailable}
          onClick={() => onUpdate(agent.id)}
          title={
            !installed
              ? `Install: ${agent.updateCmd}`
              : updateAvailable
                ? `Run: ${agent.updateCmd}`
                : 'Already up to date'
          }
        >
          {updating ? 'Updating…' : updateAvailable ? 'Update' : 'Up to date'}
        </button>
      </div>
    </article>
  )
}

export function AgentsScreen(): React.JSX.Element {
  const agentStatus = useAppStore((s) => s.agentStatus)
  const agentVersions = useAppStore((s) => s.agentVersions)
  const setAgentUpdating = useAppStore((s) => s.setAgentUpdating)
  const setAgentVersion = useAppStore((s) => s.setAgentVersion)
  const addNotification = useAppStore((s) => s.addNotification)

  const [filter, setFilter] = useState<FilterId>('all')

  const counts = useMemo(() => {
    const c = { all: 0, installed: 0, update: 0, missing: 0 }
    for (const agent of AGENTS) {
      c.all += 1
      const installed = Boolean(agentStatus[agent.id])
      const version = agentVersions[agent.id]
      if (!installed) c.missing += 1
      else if (version?.updateAvailable) c.update += 1
      else c.installed += 1
    }
    return c
  }, [agentStatus, agentVersions])

  const filtered = useMemo(() => {
    return AGENTS.filter((agent) => {
      const installed = Boolean(agentStatus[agent.id])
      const version = agentVersions[agent.id]
      switch (filter) {
        case 'all':
          return true
        case 'installed':
          return installed && !version?.updateAvailable
        case 'update':
          return installed && Boolean(version?.updateAvailable)
        case 'missing':
          return !installed
      }
    })
  }, [filter, agentStatus, agentVersions])

  const handleUpdate = useCallback(
    (agentId: string) => {
      setAgentUpdating(agentId, true)
      window.agentDeck.agents
        .update(agentId)
        .then((result) => {
          if (result.success) {
            addNotification(
              'info',
              `${agentId} updated${result.newVersion ? ` → ${result.newVersion}` : ''}`,
            )
            // Reflect the post-update state in the UI. Without this, the
            // version stays stale and the Update button remains active
            // because agentVersions still holds the pre-update numbers.
            if (result.newVersion) {
              setAgentVersion(agentId, {
                current: result.newVersion,
                latest: result.newVersion,
                updateAvailable: false,
              })
            }
          } else {
            addNotification('error', `${agentId} update failed: ${result.message}`)
          }
        })
        .catch((err: unknown) => {
          addNotification('error', `${agentId} update failed: ${String(err)}`)
        })
        .finally(() => {
          setAgentUpdating(agentId, false)
        })
    },
    [setAgentUpdating, setAgentVersion, addNotification],
  )

  return (
    <ScreenShell
      eyebrow="Agent registry"
      title="Agents"
      sub="All 7 AgentDeck agents. Install once, launch anywhere."
      filters={
        <>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterChip>
          <FilterChip
            active={filter === 'installed'}
            dotColor="green"
            onClick={() => setFilter('installed')}
            count={counts.installed}
          >
            Installed
          </FilterChip>
          <FilterChip
            active={filter === 'update'}
            dotColor="accent"
            onClick={() => setFilter('update')}
            count={counts.update}
          >
            Update available
          </FilterChip>
          <FilterChip
            active={filter === 'missing'}
            dotColor="text3"
            onClick={() => setFilter('missing')}
            count={counts.missing}
          >
            Not installed
          </FilterChip>
        </>
      }
      className="agents-screen"
    >
      <div className="agents-grid">
        {filtered.map((agent) => (
          <AgentTile
            key={agent.id}
            agent={agent}
            installed={Boolean(agentStatus[agent.id])}
            version={agentVersions[agent.id]}
            updating={Boolean(agentVersions[agent.id]?.updating)}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
    </ScreenShell>
  )
}
