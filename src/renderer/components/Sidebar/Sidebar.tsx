import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import { PanelBox } from '../shared/PanelBox'
import { HexDot } from '../shared/HexDot'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import type { AgentConfig, Project } from '../../../shared/types'
import { getProjectAgents } from '../../../shared/agent-helpers'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import { groupTemplates } from '../../utils/templateUtils'
import { createBlankWorkflow } from '../../utils/workflowUtils'
import {
  ChevronRight,
  Plus,
  Settings,
  MoreVertical,
  ArrowLeft,
  SquareCheck,
  Square,
  ClipboardList,
  Hexagon,
} from 'lucide-react'
import './Sidebar.css'

function badgeClass(badge: string): string {
  return badge.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface SidebarProps {
  onOpenProject: (project: Project) => void
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
}

export function Sidebar({
  onOpenProject,
  onOpenProjectWithAgent,
}: SidebarProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  // Serialized session data — only re-renders when the derived string changes
  const sessionDataStr = useAppStore((s) => {
    const entries: string[] = []
    for (const sess of Object.values(s.sessions)) {
      entries.push(`${sess.id}|${sess.projectId ?? ''}|${sess.status}`)
    }
    return entries.join(',')
  })

  const openWizard = useAppStore((s) => s.openWizard)
  const openSettings = useAppStore((s) => s.openSettings)
  const openTemplateEditor = useAppStore((s) => s.openTemplateEditor)
  const workflows = useAppStore((s) => s.workflows)
  const setWorkflows = useAppStore((s) => s.setWorkflows)
  const openWorkflowIds = useAppStore((s) => s.openWorkflowIds)
  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const openWorkflow = useAppStore((s) => s.openWorkflow)
  const closeWorkflow = useAppStore((s) => s.closeWorkflow)
  const sidebarSections = useAppStore((s) => s.sidebarSections)
  const toggleSidebarSection = useAppStore((s) => s.toggleSidebarSection)
  const { updateProject, deleteProject } = useProjects()

  const pinned = useMemo(() => projects.filter((p) => p.pinned), [projects])
  const groupedTemplates = useMemo(() => groupTemplates(templates), [templates])

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    projectId?: string | undefined
    workflowId?: string | undefined
    subMenu?: 'templates' | 'agents' | undefined
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Confirmation dialog state for destructive actions
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  // Inline rename state for workflows
  const [renamingWorkflowId, setRenamingWorkflowId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    },
    [],
  )

  const closeMenu = useCallback(() => setContextMenu(null), [setContextMenu])

  // Close on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, closeMenu])

  // Load workflows on mount
  useEffect(() => {
    window.agentDeck.workflows
      .list()
      .then(setWorkflows)
      .catch((err: unknown) => {
        window.agentDeck.log.send('error', 'sidebar', 'Failed to load workflows', {
          err: String(err),
        })
      })
  }, [setWorkflows])

  const createNewWorkflow = useCallback(
    () => createBlankWorkflow(setWorkflows, openWorkflow),
    [setWorkflows, openWorkflow],
  )

  function handleContextMenu(e: React.MouseEvent, projectId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, projectId })
  }

  function handleWorkflowContextMenu(e: React.MouseEvent, workflowId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, workflowId })
  }

  function handleRemoveProject(): void {
    if (!contextMenu?.projectId) return
    const project = projects.find((p) => p.id === contextMenu.projectId)
    const projectName = project?.name ?? 'this project'
    const projectId = contextMenu.projectId
    closeMenu()
    setConfirmDialog({
      title: 'Remove Project',
      message: `Remove "${projectName}"? This cannot be undone.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        void deleteProject(projectId)
        setConfirmDialog(null)
      },
    })
  }

  function handleToggleTemplate(templateId: string): void {
    if (!contextMenu?.projectId) return
    const project = projects.find((p) => p.id === contextMenu.projectId)
    if (!project) return
    const attached = project.attachedTemplates ?? []
    const next = attached.includes(templateId)
      ? attached.filter((id) => id !== templateId)
      : [...attached, templateId]
    void updateProject({ id: project.id, attachedTemplates: next })
  }

  function handleDeleteWorkflow(): void {
    if (!contextMenu?.workflowId) return
    const wf = workflows.find((w) => w.id === contextMenu.workflowId)
    const workflowName = wf?.name ?? 'this workflow'
    const id = contextMenu.workflowId
    closeMenu()
    setConfirmDialog({
      title: 'Delete Workflow',
      message: `Delete "${workflowName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        // If we're currently editing this workflow, close the editor
        if (openWorkflowIds.includes(id)) closeWorkflow(id)
        window.agentDeck.workflows
          .delete(id)
          .then(() => {
            const current = useAppStore.getState().workflows
            setWorkflows(current.filter((w) => w.id !== id))
          })
          .catch((err: unknown) => {
            window.agentDeck.log.send('error', 'sidebar', 'Failed to delete workflow', {
              err: String(err),
            })
            useAppStore.getState().addNotification('error', 'Failed to delete workflow')
          })
        setConfirmDialog(null)
      },
    })
  }

  function handleRenameWorkflow(): void {
    if (!contextMenu?.workflowId) return
    const wf = workflows.find((w) => w.id === contextMenu.workflowId)
    if (!wf) return
    setRenamingWorkflowId(wf.id)
    setRenameValue(wf.name)
    closeMenu()
    // Focus input after render
    focusTimerRef.current = setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename(): void {
    if (!renamingWorkflowId) return
    const trimmed = renameValue.trim()
    const current = useAppStore.getState().workflows
    const wf = current.find((w) => w.id === renamingWorkflowId)
    if (!trimmed || !wf || trimmed === wf.name) {
      setRenamingWorkflowId(null)
      return
    }
    // Persist to disk
    window.agentDeck.workflows.rename(renamingWorkflowId, trimmed).catch((err: unknown) => {
      window.agentDeck.log.send('error', 'sidebar', 'Failed to rename workflow', {
        err: String(err),
      })
    })
    // Update Zustand store
    setWorkflows(current.map((w) => (w.id === renamingWorkflowId ? { ...w, name: trimmed } : w)))
    useAppStore.getState().updateWorkflowMeta(renamingWorkflowId, { name: trimmed })
    setRenamingWorkflowId(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur() // This triggers onBlur → commitRename
      return
    } else if (e.key === 'Escape') {
      setRenamingWorkflowId(null)
    }
  }

  // Parse serialized session data into structured entries
  const sessionEntries = useMemo(() => {
    if (!sessionDataStr) return []
    return sessionDataStr.split(',').map((entry) => {
      const [id, projectId, status] = entry.split('|')
      return { id: id ?? '', projectId: projectId ?? '', status: status ?? '' }
    })
  }, [sessionDataStr])

  // Memoize project status map — avoids O(n) find per project per render
  const projectStatusMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of sessionEntries) {
      if (s.projectId) map[s.projectId] = s.status
    }
    return map
  }, [sessionEntries])

  // Memoize active project ID for the current session
  const activeProjectId = useMemo(
    () =>
      activeSessionId ? sessionEntries.find((s) => s.id === activeSessionId)?.projectId : undefined,
    [sessionEntries, activeSessionId],
  )

  function getProjectStatus(projectId: string): string {
    return projectStatusMap[projectId] ?? 'idle'
  }

  function isActive(projectId: string): boolean {
    return activeProjectId === projectId
  }

  return (
    <div className="sidebar" role="navigation" aria-label="Sidebar">
      <PanelBox corners={['tl', 'br']} glow="left" className="sidebar-panel">
        <div className="sidebar-section">
          <div
            className="sidebar-label sidebar-label-clickable"
            onClick={() => toggleSidebarSection('pinned')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSidebarSection('pinned')
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={sidebarSections.pinned}
          >
            <span>
              <span className={`sidebar-chevron${sidebarSections.pinned ? ' open' : ''}`}>
                <ChevronRight size={10} />
              </span>
              Pinned
            </span>
            <button
              className="sidebar-action"
              onClick={(e) => {
                e.stopPropagation()
                openWizard()
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {sidebarSections.pinned && (
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
                  <HexDot
                    status={
                      getProjectStatus(p.id) === 'running'
                        ? 'live'
                        : getProjectStatus(p.id) === 'error'
                          ? 'error'
                          : 'idle'
                    }
                    size={8}
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

        <div className="sidebar-divider" />

        {/* Context menu portal */}
        {contextMenu && (
          <div
            ref={menuRef}
            className="sidebar-context-menu"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 200),
              left: Math.min(contextMenu.x, window.innerWidth - 160),
            }}
          >
            {contextMenu.projectId && !contextMenu.subMenu && (
              <>
                <button
                  className="sidebar-context-item"
                  onClick={() => setContextMenu({ ...contextMenu, subMenu: 'agents' })}
                >
                  <>
                    Launch with... <ChevronRight size={10} />
                  </>
                </button>
                <button
                  className="sidebar-context-item"
                  onClick={() => setContextMenu({ ...contextMenu, subMenu: 'templates' })}
                >
                  Attach Templates
                </button>
                <button
                  className="sidebar-context-item"
                  onClick={() => {
                    if (contextMenu.projectId) openSettings(contextMenu.projectId)
                    setContextMenu(null)
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
            {contextMenu.projectId && contextMenu.subMenu === 'templates' && (
              <div className="sidebar-ctx-sub-panel">
                <div className="sidebar-ctx-sub-header">
                  <button
                    className="sidebar-ctx-back"
                    onClick={() => setContextMenu({ ...contextMenu, subMenu: undefined })}
                  >
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
            {contextMenu.projectId &&
              contextMenu.subMenu === 'agents' &&
              (() => {
                const project = projects.find((p) => p.id === contextMenu.projectId)
                if (!project) return null
                const projectAgents = getProjectAgents(project)
                return (
                  <div className="sidebar-ctx-sub-panel">
                    <div className="sidebar-ctx-sub-header">
                      <button
                        className="sidebar-ctx-back"
                        onClick={() => setContextMenu({ ...contextMenu, subMenu: undefined })}
                      >
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
                            <span className="sidebar-agent-icon">
                              {agentMeta?.icon ?? '\u25C8'}
                            </span>
                            <span className="sidebar-agent-name">
                              {agentMeta?.name ?? ac.agent}
                            </span>
                            {ac.isDefault && <span className="sidebar-agent-default">DEFAULT</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            {contextMenu.workflowId && (
              <>
                <button className="sidebar-context-item" onClick={handleRenameWorkflow}>
                  Rename workflow
                </button>
                <div className="sidebar-context-divider" />
                <button className="sidebar-context-item danger" onClick={handleDeleteWorkflow}>
                  Delete workflow
                </button>
              </>
            )}
          </div>
        )}

        <div className={`sidebar-section${sidebarSections.templates ? ' flex-fill' : ''}`}>
          <div
            className="sidebar-label sidebar-label-clickable"
            onClick={() => toggleSidebarSection('templates')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSidebarSection('templates')
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={sidebarSections.templates}
          >
            <span>
              <span className={`sidebar-chevron${sidebarSections.templates ? ' open' : ''}`}>
                <ChevronRight size={10} />
              </span>
              Templates
            </span>
            <button
              className="sidebar-action"
              onClick={(e) => {
                e.stopPropagation()
                openTemplateEditor()
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {sidebarSections.templates && (
            <div role="group" aria-label="Templates">
              {groupedTemplates.length === 0 && (
                <div className="sidebar-empty-hint">Create templates from the + button</div>
              )}
              {groupedTemplates.map((group) => (
                <div key={group.category} className="sidebar-tpl-group">
                  <div className="sidebar-group-label">{group.category}</div>
                  {group.templates.map((t) => (
                    <div
                      key={t.id}
                      className="sidebar-item"
                      onClick={() => openTemplateEditor(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openTemplateEditor(t.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <ClipboardList size={12} />
                      <div className="sidebar-item-info">
                        <div className="sidebar-item-name">{t.name}</div>
                        <div className="sidebar-item-sub">{t.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <div
            className="sidebar-label sidebar-label-clickable"
            onClick={() => toggleSidebarSection('workflows')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSidebarSection('workflows')
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={sidebarSections.workflows}
          >
            <span>
              <span className={`sidebar-chevron${sidebarSections.workflows ? ' open' : ''}`}>
                <ChevronRight size={10} />
              </span>
              Workflows
            </span>
            <button
              className="sidebar-action"
              onClick={(e) => {
                e.stopPropagation()
                createNewWorkflow()
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {sidebarSections.workflows && (
            <div role="group" aria-label="Workflows">
              {workflows.length === 0 && (
                <div className="sidebar-empty-hint">Create workflows from the + button</div>
              )}
              {workflows.map((w) => (
                <div
                  key={w.id}
                  className={`sidebar-item${activeWorkflowId === w.id ? ' sidebar-item-wf-active' : ''}`}
                  onClick={() => openWorkflow(w.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openWorkflow(w.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onContextMenu={(e) => handleWorkflowContextMenu(e, w.id)}
                >
                  <div className="sidebar-dot sidebar-dot-wf" />
                  <div className="sidebar-item-info">
                    {renamingWorkflowId === w.id ? (
                      <input
                        ref={renameInputRef}
                        className="sidebar-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={60}
                      />
                    ) : (
                      <div
                        className="sidebar-item-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setRenamingWorkflowId(w.id)
                          setRenameValue(w.name)
                          focusTimerRef.current = setTimeout(
                            () => renameInputRef.current?.select(),
                            0,
                          )
                        }}
                      >
                        {w.name}
                      </div>
                    )}
                    <div className="sidebar-item-sub">{w.nodeCount} nodes</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-bottom">
          <button className="new-project-btn" onClick={openWizard}>
            <Plus size={14} /> New Project
          </button>
          <button className="sidebar-new-wf" onClick={createNewWorkflow}>
            <>
              <Hexagon size={12} /> New Workflow
            </>
          </button>
        </div>

        {sessionEntries.length > 0 && (
          <div className="sidebar-summary">
            {sessionEntries.map((s) => (
              <HexDot
                key={s.id}
                status={s.status === 'running' ? 'live' : s.status === 'error' ? 'error' : 'idle'}
                size={5}
              />
            ))}
            <span className="sidebar-summary-label">
              {sessionEntries.length} {sessionEntries.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        )}
      </PanelBox>

      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  )
}
