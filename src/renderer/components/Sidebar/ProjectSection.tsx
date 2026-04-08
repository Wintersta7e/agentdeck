import { useCallback, useMemo, useState } from 'react'
import type { AgentConfig, Project } from '../../../shared/types'
import type { TemplateGroup } from '../../utils/templateUtils'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import {
  ArrowLeft,
  ChevronRight,
  MoreVertical,
  Plus,
  Settings,
  Square,
  SquareCheck,
} from 'lucide-react'
import { getProjectAgents } from '../../../shared/agent-helpers'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'

function badgeClass(badge: string): string {
  return badge.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---------- Context-menu type ----------
export interface ProjectContextMenu {
  x: number
  y: number
  projectId: string
  subMenu?: 'templates' | 'agents' | undefined
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

// ---------- Props ----------
export interface ProjectSectionProps {
  expanded: boolean
  onToggle: () => void
  onAddProject: () => void
  onOpenProject: (project: Project) => void
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
  onOpenSettings: (projectId: string) => void
  groupedTemplates: TemplateGroup[]
  requestConfirm: (req: ConfirmRequest) => void
}

export function ProjectSection({
  expanded,
  onToggle,
  onAddProject,
  onOpenProject,
  onOpenProjectWithAgent,
  onOpenSettings,
  groupedTemplates,
  requestConfirm,
}: ProjectSectionProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  // Serialized session data — only re-renders when the derived string changes
  const sessionDataStr = useAppStore((s) => {
    const entries: string[] = []
    for (const sess of Object.values(s.sessions)) {
      entries.push(`${sess.id}|${sess.projectId ?? ''}|${sess.status}`)
    }
    return entries.join(',')
  })

  const { updateProject, deleteProject } = useProjects()

  const pinned = useMemo(() => projects.filter((p) => p.pinned), [projects])

  // ---------- Session/project status ----------
  const sessionEntries = useMemo(() => {
    if (!sessionDataStr) return []
    return sessionDataStr.split(',').map((entry) => {
      const [id, projectId, status] = entry.split('|')
      return { id: id ?? '', projectId: projectId ?? '', status: status ?? '' }
    })
  }, [sessionDataStr])

  const projectStatusMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of sessionEntries) {
      if (s.projectId) map[s.projectId] = s.status
    }
    return map
  }, [sessionEntries])

  const activeProjectId = useMemo(
    () =>
      activeSessionId ? sessionEntries.find((s) => s.id === activeSessionId)?.projectId : undefined,
    [sessionEntries, activeSessionId],
  )

  const getProjectStatus = useCallback(
    (projectId: string): string => projectStatusMap[projectId] ?? 'idle',
    [projectStatusMap],
  )

  const isActive = useCallback(
    (projectId: string): boolean => activeProjectId === projectId,
    [activeProjectId],
  )

  // ---------- Context menu ----------
  const [contextMenu, setContextMenu] = useState<ProjectContextMenu | null>(null)

  function handleContextMenu(e: React.MouseEvent, projectId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  const closeMenu = useCallback(() => setContextMenu(null), [])

  // Close on outside click or Escape
  // NOTE: uses capture-phase mousedown so the menu ref check is reliable
  // (this is scoped to project menu only; workflow menu has its own listener)

  function handleRemoveProject(): void {
    if (!contextMenu) return
    const project = projects.find((p) => p.id === contextMenu.projectId)
    const projectName = project?.name ?? 'this project'
    const projectId = contextMenu.projectId
    closeMenu()
    // BUG-4: Check for active sessions before deletion to prevent orphaned worktrees
    const activeSessions = Object.values(useAppStore.getState().sessions).filter(
      (s) => s.projectId === projectId,
    )
    const warningMsg =
      activeSessions.length > 0
        ? `Remove "${projectName}"? ${String(activeSessions.length)} active session(s) will be closed. This cannot be undone.`
        : `Remove "${projectName}"? This cannot be undone.`
    requestConfirm({
      title: 'Remove Project',
      message: warningMsg,
      confirmLabel: 'Remove',
      onConfirm: () => {
        for (const s of activeSessions) {
          window.agentDeck.pty.kill(s.id).catch(() => {})
        }
        void deleteProject(projectId)
      },
    })
  }

  function handleToggleTemplate(templateId: string): void {
    if (!contextMenu) return
    const project = projects.find((p) => p.id === contextMenu.projectId)
    if (!project) return
    const attached = project.attachedTemplates ?? []
    const next = attached.includes(templateId)
      ? attached.filter((id) => id !== templateId)
      : [...attached, templateId]
    void updateProject({ id: project.id, attachedTemplates: next })
  }

  function setSubMenu(subMenu: 'templates' | 'agents' | undefined): void {
    if (!contextMenu) return
    setContextMenu({ ...contextMenu, subMenu })
  }

  return (
    <>
      <div className="sidebar-section">
        <div
          className="sidebar-label sidebar-label-clickable"
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle()
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
        >
          <span>
            <span className={`sidebar-chevron${expanded ? ' open' : ''}`}>
              <ChevronRight size={10} />
            </span>
            Pinned
          </span>
          <button
            className="sidebar-action"
            aria-label="Add project"
            onClick={(e) => {
              e.stopPropagation()
              onAddProject()
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        {expanded && (
          <div role="group" aria-label="Pinned projects">
            {pinned.length === 0 && projects.length > 0 && (
              <div className="sidebar-empty-hint">Right-click a project to pin it</div>
            )}
            {pinned.map((p) => (
              <div
                key={p.id}
                className={`sidebar-item ${isActive(p.id) ? 'active' : ''}`}
                onClick={() => onOpenProject(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenProject(p)
                  }
                }}
                role="button"
                tabIndex={0}
                onContextMenu={(e) => handleContextMenu(e, p.id)}
              >
                <div
                  className={`sidebar-dot ${
                    getProjectStatus(p.id) === 'running'
                      ? 'dot-running'
                      : getProjectStatus(p.id) === 'error'
                        ? 'dot-error'
                        : 'dot-idle'
                  }`}
                />
                <div className="sidebar-item-info">
                  <div className="sidebar-item-name">{p.name}</div>
                  <div className="sidebar-item-sub" title={p.path}>
                    {p.path}
                  </div>
                </div>
                {p.badge && (
                  <span className={`sidebar-badge badge-${badgeClass(p.badge)}`}>{p.badge}</span>
                )}
                <button
                  className="sidebar-item-gear"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleContextMenu(e, p.id)
                  }}
                  aria-label="Project options"
                  title="Project options"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project context menu */}
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 160),
          }}
        >
          {!contextMenu.subMenu && (
            <>
              <button className="sidebar-context-item" onClick={() => setSubMenu('agents')}>
                <>
                  Launch with... <ChevronRight size={10} />
                </>
              </button>
              <button className="sidebar-context-item" onClick={() => setSubMenu('templates')}>
                Attach Templates
              </button>
              <button
                className="sidebar-context-item"
                onClick={() => {
                  onOpenSettings(contextMenu.projectId)
                  closeMenu()
                }}
              >
                <Settings size={12} /> Settings
              </button>
              <div className="sidebar-context-divider" />
              <button className="sidebar-context-item danger" onClick={handleRemoveProject}>
                Remove project
              </button>
            </>
          )}
          {contextMenu.subMenu === 'templates' && (
            <div className="sidebar-ctx-sub-panel">
              <div className="sidebar-ctx-sub-header">
                <button className="sidebar-ctx-back" onClick={() => setSubMenu(undefined)}>
                  <ArrowLeft size={12} />
                </button>
                <span>Attach Templates</span>
              </div>
              <div className="sidebar-ctx-sub-body">
                {groupedTemplates.map((group) => {
                  const project = projects.find((p) => p.id === contextMenu.projectId)
                  const attached = project?.attachedTemplates ?? []
                  return (
                    <div key={group.category}>
                      <div className="sidebar-ctx-sub-cat">{group.category}</div>
                      {group.templates.map((t) => {
                        const checked = attached.includes(t.id)
                        return (
                          <button
                            key={t.id}
                            className={`sidebar-ctx-sub-item${checked ? ' checked' : ''}`}
                            onClick={() => handleToggleTemplate(t.id)}
                          >
                            <span className={`sidebar-ctx-sub-check${checked ? ' on' : ''}`}>
                              {checked ? <SquareCheck size={14} /> : <Square size={14} />}
                            </span>
                            <span className="sidebar-ctx-sub-name">{t.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {contextMenu.subMenu === 'agents' &&
            (() => {
              const project = projects.find((p) => p.id === contextMenu.projectId)
              if (!project) return null
              const projectAgents = getProjectAgents(project)
              return (
                <div className="sidebar-ctx-sub-panel">
                  <div className="sidebar-ctx-sub-header">
                    <button className="sidebar-ctx-back" onClick={() => setSubMenu(undefined)}>
                      <ArrowLeft size={12} />
                    </button>
                    <span>Launch with...</span>
                  </div>
                  <div className="sidebar-ctx-sub-body">
                    {projectAgents.map((ac) => {
                      const agentMeta = SHARED_AGENTS.find((a) => a.id === ac.agent)
                      return (
                        <button
                          key={ac.agent}
                          className="sidebar-context-item sidebar-agent-item"
                          onClick={() => {
                            onOpenProjectWithAgent(project, ac)
                            closeMenu()
                          }}
                        >
                          <span className="sidebar-agent-icon">{agentMeta?.icon ?? '\u25C8'}</span>
                          <span className="sidebar-agent-name">{agentMeta?.name ?? ac.agent}</span>
                          {ac.isDefault && <span className="sidebar-agent-default">DEFAULT</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
        </div>
      )}
    </>
  )
}
