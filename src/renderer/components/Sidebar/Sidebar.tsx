import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import type { AgentConfig, Project } from '../../../shared/types'
import { groupTemplates } from '../../utils/templateUtils'
import { createBlankWorkflow } from '../../utils/workflowUtils'
import { ChevronRight, ClipboardList, Hexagon, Plus } from 'lucide-react'
import { ProjectSection } from './ProjectSection'
import type { ConfirmRequest } from './ProjectSection'
import { WorkflowSection } from './WorkflowSection'
import './Sidebar.css'

interface SidebarProps {
  onOpenProject: (project: Project) => void
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
}

export function Sidebar({
  onOpenProject,
  onOpenProjectWithAgent,
}: SidebarProps): React.JSX.Element {
  const templates = useAppStore((s) => s.templates)
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

  const groupedTemplates = useMemo(() => groupTemplates(templates), [templates])

  // Confirmation dialog shared between sections
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  const requestConfirm = useCallback((req: ConfirmRequest) => setConfirmDialog(req), [])

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

  return (
    <div className="sidebar" role="navigation" aria-label="Sidebar">
      <div className="sidebar-panel">
        <ProjectSection
          expanded={sidebarSections.pinned}
          onToggle={() => toggleSidebarSection('pinned')}
          onAddProject={openWizard}
          onOpenProject={onOpenProject}
          onOpenProjectWithAgent={onOpenProjectWithAgent}
          onOpenSettings={openSettings}
          groupedTemplates={groupedTemplates}
          requestConfirm={requestConfirm}
        />

        <div className="sidebar-divider" />

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
              aria-label="New template"
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

        <WorkflowSection
          workflows={workflows}
          expanded={sidebarSections.workflows}
          activeWorkflowId={activeWorkflowId}
          onToggle={() => toggleSidebarSection('workflows')}
          onCreateWorkflow={createNewWorkflow}
          onOpenWorkflow={openWorkflow}
          setWorkflows={setWorkflows}
          openWorkflowIds={openWorkflowIds}
          closeWorkflow={closeWorkflow}
          requestConfirm={requestConfirm}
        />

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
      </div>

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
