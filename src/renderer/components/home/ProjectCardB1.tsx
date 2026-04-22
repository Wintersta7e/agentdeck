import { useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { getProjectAgents } from '../../../shared/agent-helpers'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import type { Project } from '../../../shared/types'
import './ProjectCardB1.css'

interface ProjectCardB1Props {
  project: Project
  onOpen: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

const BADGE_TONE: Record<string, string> = {
  Rust: 'var(--badge-rust)',
  TS: 'var(--badge-ts)',
  JS: 'var(--badge-js)',
  Python: 'var(--badge-python)',
  Go: 'var(--badge-go)',
  Java: 'var(--badge-java)',
  Ruby: 'var(--badge-ruby)',
  Kotlin: 'var(--badge-kotlin)',
  Swift: 'var(--badge-swift)',
  Dart: 'var(--badge-dart)',
  PHP: 'var(--badge-php)',
  'C/C++': 'var(--badge-cc)',
  '.NET': 'var(--badge-dotnet)',
  Agent: 'var(--badge-agent)',
  Other: 'var(--badge-other)',
}

function badgeColor(badge: string | undefined): string {
  if (!badge) return 'var(--badge-other)'
  return BADGE_TONE[badge] ?? 'var(--badge-other)'
}

/**
 * B1 project card — name + stack badge on top, path subline, agent
 * glyphs row with branch + dirty indicator on the bottom. Click to open,
 * right-click for "Launch with…" menu.
 */
export function ProjectCardB1({
  project,
  onOpen,
  onContextMenu,
}: ProjectCardB1Props): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const gitStatuses = useAppStore((s) => s.gitStatuses)

  const runningCount = useMemo(
    () =>
      Object.values(sessions).filter(
        (sess) => sess.projectId === project.id && sess.status === 'running',
      ).length,
    [sessions, project.id],
  )

  const dirtyCount = useMemo(() => {
    const s = gitStatuses[project.id]
    if (!s) return 0
    return s.staged + s.unstaged + s.untracked
  }, [gitStatuses, project.id])

  const agents = useMemo(() => {
    const configs = getProjectAgents(project)
    return configs
      .map((c) => ({ agent: AGENT_BY_ID.get(c.agent), id: c.agent }))
      .filter((a) => a.agent)
      .slice(0, 4)
  }, [project])

  const badge = project.badge ?? undefined

  return (
    <button
      type="button"
      className="pc-b1"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      title={`Open ${project.name}`}
    >
      <div className="pc-b1__row pc-b1__row--head">
        <span className="pc-b1__name">{project.name}</span>
        {badge && (
          <span
            className="pc-b1__badge"
            style={{ ['--badge-color' as 'color']: badgeColor(badge) }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="pc-b1__path" title={project.path}>
        {project.path}
      </div>

      <div className="pc-b1__row pc-b1__row--agents">
        <div className="pc-b1__agent-row">
          {agents.map(({ agent, id }) => (
            <span
              key={id}
              className="pc-b1__agent-glyph"
              style={{ ['--glyph-color' as 'color']: `var(${agentColorVar(id)})` }}
              aria-hidden="true"
            >
              {agent?.icon ?? '◈'}
            </span>
          ))}
        </div>
        {runningCount > 0 && (
          <span className="pc-b1__running">
            <span className="ad-pulse pc-b1__running-dot" aria-hidden="true" />
            {runningCount}
          </span>
        )}
      </div>

      <div className="pc-b1__row pc-b1__row--foot">
        <span className="pc-b1__branch">⎇ main</span>
        {dirtyCount > 0 && <span className="pc-b1__dirty">●{dirtyCount}</span>}
      </div>
    </button>
  )
}
