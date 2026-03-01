import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import type { Project } from '../../../shared/types'
import { groupTemplates } from '../../utils/templateUtils'
import { createBlankWorkflow } from '../../utils/workflowUtils'
import './Sidebar.css'

function badgeClass(badge: string): string {
  return badge.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface SidebarProps {
  onOpenProject: (project: Project) => void
}

export function Sidebar({ onOpenProject }: SidebarProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const openWizard = useAppStore((s) => s.openWizard)
  const openSettings = useAppStore((s) => s.openSettings)
  const openTemplateEditor = useAppStore((s) => s.openTemplateEditor)
  const workflows = useAppStore((s) => s.workflows)
  const setWorkflows = useAppStore((s) => s.setWorkflows)
  const editingWorkflowId = useAppStore((s) => s.editingWorkflowId)
  const openWorkflow = useAppStore((s) => s.openWorkflow)
  const closeWorkflow = useAppStore((s) => s.closeWorkflow)
  const sidebarSections = useAppStore((s) => s.sidebarSections)
  const toggleSidebarSection = useAppStore((s) => s.toggleSidebarSection)
  const { deleteProject } = useProjects()

  const pinned = projects.filter((p) => p.pinned)

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    projectId?: string | undefined
    workflowId?: string | undefined
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setContextMenu(null), [])

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
    window.agentDeck.workflows.list().then(setWorkflows)
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
    void deleteProject(contextMenu.projectId)
    closeMenu()
  }

  function handleDeleteWorkflow(): void {
    if (!contextMenu?.workflowId) return
    const id = contextMenu.workflowId
    // If we're currently editing this workflow, close the editor
    if (editingWorkflowId === id) closeWorkflow()
    window.agentDeck.workflows.delete(id).then(() => {
      setWorkflows(workflows.filter((w) => w.id !== id))
    })
    closeMenu()
  }

  function getProjectStatus(projectId: string): string {
    const session = Object.values(sessions).find((s) => s.projectId === projectId)
    return session ? session.status : 'idle'
  }

  function isActive(projectId: string): boolean {
    if (!activeSessionId) return false
    const session = sessions[activeSessionId]
    return session !== undefined && session.projectId === projectId
  }

  function dotClass(status: string): string {
    if (status === 'running') return 'dot-running'
    if (status === 'error') return 'dot-error'
    return 'dot-idle'
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div
          className="sidebar-label sidebar-label-clickable"
          onClick={() => toggleSidebarSection('pinned')}
        >
          <span>
            <span className={`sidebar-chevron${sidebarSections.pinned ? ' open' : ''}`}>
              {'\u25B6'}
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
            +
          </button>
        </div>
        {sidebarSections.pinned &&
          pinned.map((p) => (
            <div
              key={p.id}
              className={`sidebar-item ${isActive(p.id) ? 'active' : ''}`}
              onClick={() => onOpenProject(p)}
              onContextMenu={(e) => handleContextMenu(e, p.id)}
            >
              <div className={`sidebar-dot ${dotClass(getProjectStatus(p.id))}`} />
              <div className="sidebar-item-info">
                <div className="sidebar-item-name">{p.name}</div>
                <div className="sidebar-item-sub">{p.path}</div>
              </div>
              {p.badge && (
                <span className={`sidebar-badge badge-${badgeClass(p.badge)}`}>{p.badge}</span>
              )}
              <button
                className="sidebar-item-gear"
                onClick={(e) => {
                  e.stopPropagation()
                  openSettings(p.id)
                }}
                title="Project settings"
              >
                {'\u2699'}
              </button>
            </div>
          ))}
      </div>

      <div className="sidebar-divider" />

      {/* Context menu portal */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="sidebar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.projectId && (
            <button className="sidebar-context-item danger" onClick={handleRemoveProject}>
              Remove project
            </button>
          )}
          {contextMenu.workflowId && (
            <button className="sidebar-context-item danger" onClick={handleDeleteWorkflow}>
              Delete workflow
            </button>
          )}
        </div>
      )}

      <div className={`sidebar-section${sidebarSections.templates ? ' flex-fill' : ''}`}>
        <div
          className="sidebar-label sidebar-label-clickable"
          onClick={() => toggleSidebarSection('templates')}
        >
          <span>
            <span className={`sidebar-chevron${sidebarSections.templates ? ' open' : ''}`}>
              {'\u25B6'}
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
            +
          </button>
        </div>
        {sidebarSections.templates &&
          groupTemplates(templates).map((group) => (
            <div key={group.category} className="sidebar-tpl-group">
              <div className="sidebar-group-label">{group.category}</div>
              {group.templates.map((t) => (
                <div key={t.id} className="sidebar-item" onClick={() => openTemplateEditor(t.id)}>
                  <span style={{ fontSize: '11px' }}>{'\u{1F4CB}'}</span>
                  <div className="sidebar-item-info">
                    <div className="sidebar-item-name">{t.name}</div>
                    <div className="sidebar-item-sub">{t.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section">
        <div
          className="sidebar-label sidebar-label-clickable"
          onClick={() => toggleSidebarSection('workflows')}
        >
          <span>
            <span className={`sidebar-chevron${sidebarSections.workflows ? ' open' : ''}`}>
              {'\u25B6'}
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
            +
          </button>
        </div>
        {sidebarSections.workflows &&
          workflows.map((w) => (
            <div
              key={w.id}
              className={`sidebar-item${editingWorkflowId === w.id ? ' sidebar-item-wf-active' : ''}`}
              onClick={() => openWorkflow(w.id)}
              onContextMenu={(e) => handleWorkflowContextMenu(e, w.id)}
            >
              <div className="sidebar-dot sidebar-dot-wf" />
              <div className="sidebar-item-info">
                <div className="sidebar-item-name">{w.name}</div>
                <div className="sidebar-item-sub">{w.nodeCount} nodes</div>
              </div>
            </div>
          ))}
      </div>

      <div className="sidebar-bottom">
        <button className="new-project-btn" onClick={openWizard}>
          <span>+</span> New Project
        </button>
        <button className="sidebar-new-wf" onClick={createNewWorkflow}>
          {'\u2B21'} New Workflow
        </button>
      </div>
    </div>
  )
}
