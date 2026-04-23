import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import { useGitStatusBatch } from '../../hooks/useGitStatus'
import { ProjectCardV2 } from '../../components/HomeScreen/ProjectCardV2'
import { ScreenShell, FilterChip } from '../../components/shared/ScreenShell'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import { getProjectAgents } from '../../../shared/agent-helpers'
import type { AgentConfig, Project } from '../../../shared/types'
import './ProjectsScreen.css'

type FilterId = 'all' | 'pinned' | 'dirty'

const AGENT_META_MAP = new Map(SHARED_AGENTS.map((a) => [a.id, a]))

interface ProjectsScreenProps {
  onOpenProject: (project: Project) => void
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
}

export function ProjectsScreen({
  onOpenProject,
  onOpenProjectWithAgent,
}: ProjectsScreenProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const gitStatusesByProject = useAppStore((s) => s.gitStatuses)
  const openWizard = useAppStore((s) => s.openWizard)

  const { updateProject } = useProjects()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    projectId: string
  } | null>(null)

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  useGitStatusBatch(projectIds)

  const dirtyIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of projects) {
      const status = gitStatusesByProject[p.id]
      if (status && status.staged + status.unstaged + status.untracked > 0) {
        set.add(p.id)
      }
    }
    return set
  }, [projects, gitStatusesByProject])

  const counts = useMemo(() => {
    const c = { all: projects.length, pinned: 0, dirty: dirtyIds.size }
    for (const p of projects) {
      if (p.pinned) c.pinned += 1
    }
    return c
  }, [projects, dirtyIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects
      .filter((p) => {
        switch (filter) {
          case 'all':
            return true
          case 'pinned':
            return p.pinned
          case 'dirty':
            return dirtyIds.has(p.id)
        }
      })
      .filter((p) => {
        if (!q) return true
        const haystack = `${p.name} ${p.path}`.toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => {
        const aLast = a.lastOpened ?? 0
        const bLast = b.lastOpened ?? 0
        return bLast - aLast
      })
  }, [projects, filter, query, dirtyIds])

  // Pin toggling currently lives in the Home screen + ProjectSettings. Kept
  // here as a private helper in case we surface it via context menu later.
  void updateProject

  return (
    <ScreenShell
      eyebrow="Workspace"
      title="Projects"
      sub="Every project AgentDeck knows about. Pin the ones you care about; hide the rest."
      actions={
        <button
          type="button"
          className="projects-screen__new-btn"
          onClick={openWizard}
          title="Add a project (Ctrl+N)"
        >
          <Plus size={14} aria-hidden="true" /> NEW PROJECT
        </button>
      }
      filters={
        <>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            All
          </FilterChip>
          <FilterChip
            active={filter === 'pinned'}
            dotColor="accent"
            onClick={() => setFilter('pinned')}
            count={counts.pinned}
          >
            Pinned
          </FilterChip>
          <FilterChip
            active={filter === 'dirty'}
            dotColor="red"
            onClick={() => setFilter('dirty')}
            count={counts.dirty}
          >
            Dirty
          </FilterChip>
          <div className="projects-screen__filter-spacer" />
          <input
            type="search"
            className="projects-screen__search"
            placeholder="Search by name or path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter projects"
          />
        </>
      }
      className="projects-screen"
    >
      {filtered.length === 0 ? (
        <div className="projects-screen__empty" role="status">
          {projects.length === 0 ? (
            <>
              <div className="projects-screen__empty-title">No projects yet</div>
              <div className="projects-screen__empty-sub">
                Add your first project to start launching agent sessions against it.
              </div>
              <button type="button" className="projects-screen__new-btn" onClick={openWizard}>
                <Plus size={14} aria-hidden="true" /> CREATE PROJECT
              </button>
            </>
          ) : (
            <div className="projects-screen__empty-sub">No projects match this filter.</div>
          )}
        </div>
      ) : (
        <div className="projects-screen__grid">
          {filtered.map((project) => (
            <ProjectCardV2
              key={project.id}
              project={project}
              onOpen={() => onOpenProject(project)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCardMenu({ x: e.clientX, y: e.clientY, projectId: project.id })
              }}
            />
          ))}
        </div>
      )}

      {cardMenu &&
        (() => {
          const project = projects.find((pp) => pp.id === cardMenu.projectId)
          if (!project) return null
          const projectAgents = getProjectAgents(project)
          return (
            <div
              className="projects-screen__menu"
              style={{
                top: Math.min(cardMenu.y, window.innerHeight - 240),
                left: Math.min(cardMenu.x, window.innerWidth - 200),
              }}
              role="menu"
              onMouseLeave={() => setCardMenu(null)}
            >
              <div className="projects-screen__menu-head">Launch with…</div>
              {projectAgents.map((ac) => {
                const agentMeta = AGENT_META_MAP.get(ac.agent)
                return (
                  <button
                    key={ac.agent}
                    type="button"
                    className="projects-screen__menu-item"
                    onClick={() => {
                      onOpenProjectWithAgent(project, ac)
                      setCardMenu(null)
                    }}
                  >
                    <span className="projects-screen__menu-icon">{agentMeta?.icon ?? '◈'}</span>
                    <span>{agentMeta?.name ?? ac.agent}</span>
                    {ac.isDefault && <span className="projects-screen__menu-badge">DEFAULT</span>}
                  </button>
                )
              })}
            </div>
          )
        })()}
    </ScreenShell>
  )
}
