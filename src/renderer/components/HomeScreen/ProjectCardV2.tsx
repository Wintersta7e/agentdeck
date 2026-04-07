import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { useGitStatus } from '../../hooks/useGitStatus'
import { GitStatusRow } from './GitStatusRow'
import { AGENTS } from '../../../shared/agents'
import { getProjectAgents } from '../../../shared/agent-helpers'
import type { Project, StackBadge } from '../../../shared/types'
import './ProjectCardV2.css'

const AGENT_META = new Map(AGENTS.map((a) => [a.id, a]))

const BADGE_ABBR: Record<StackBadge, string> = {
  Java: 'JV',
  JS: 'JS',
  TS: 'TS',
  Python: 'PY',
  Rust: 'RS',
  Go: 'GO',
  '.NET': '.N',
  'C/C++': 'CC',
  Ruby: 'RB',
  PHP: 'PH',
  Kotlin: 'KT',
  Swift: 'SW',
  Dart: 'DT',
  Agent: 'AG',
  Other: '??',
}

function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface ProjectCardV2Props {
  project: Project
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function ProjectCardV2({
  project,
  onOpen,
  onContextMenu,
}: ProjectCardV2Props): React.JSX.Element {
  useGitStatus(project.id)
  const gitStatus = useAppStore((s) => s.gitStatuses[project.id])
  const sessions = useAppStore((s) => s.sessions)

  const isRunning = useMemo(
    () => Object.values(sessions).some((s) => s.projectId === project.id && s.status === 'running'),
    [sessions, project.id],
  )

  const agents = useMemo(() => getProjectAgents(project), [project])

  const abbr = project.badge ? (BADGE_ABBR[project.badge] ?? '??') : '??'
  const badgeClass = project.badge
    ? `badge-${project.badge.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    : ''

  return (
    <div
      className={`project-card-v2${isRunning ? ' active' : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
    >
      <div className="pcv2-top">
        <div className={`pcv2-icon ${badgeClass}`}>{abbr}</div>
        <div className="pcv2-info">
          <div className="pcv2-name">{project.name}</div>
          <div className="pcv2-sub">{project.badge ?? 'Project'}</div>
        </div>
        {isRunning && <div className="pcv2-dot" aria-label="Running" />}
      </div>

      {gitStatus !== null && gitStatus !== undefined && <GitStatusRow status={gitStatus} />}

      {agents.length > 0 && (
        <div className="pcv2-agents">
          {agents.map((ac) => {
            const meta = AGENT_META.get(ac.agent)
            const running = Object.values(sessions).some(
              (s) =>
                s.projectId === project.id &&
                s.agentOverride === ac.agent &&
                s.status === 'running',
            )
            return (
              <span key={ac.agent} className={`pcv2-pill${running ? ' live' : ''}`}>
                {meta?.icon ?? '\u25C8'} {meta?.name ?? ac.agent}
              </span>
            )
          })}
        </div>
      )}

      <div className="pcv2-footer">
        <span className="pcv2-time">{timeAgo(project.lastOpened)}</span>
      </div>
    </div>
  )
}
