import { useState, useMemo } from 'react'
import type { Project } from '../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { useProjects } from '../../hooks/useProjects'
import { GeneralTab } from './GeneralTab'
import { StartupTab } from './StartupTab'
import { AgentTab } from './AgentTab'
import { TemplatesTab } from './TemplatesTab'
import { IdentityTab } from './IdentityTab'
import { AdvancedTab } from './AdvancedTab'
import './ProjectSettings.css'

const TABS = ['General', 'Startup', 'Agent', 'Templates', 'Identity', 'Advanced'] as const

export function ProjectSettings(): React.JSX.Element | null {
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const projects = useAppStore((s) => s.projects)
  const getSessionForProject = useAppStore((s) => s.getSessionForProject)
  const addSession = useAppStore((s) => s.addSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const { updateProject, deleteProject } = useProjects()

  const storedProject = useMemo(
    () => projects.find((p) => p.id === settingsProjectId) ?? null,
    [projects, settingsProjectId],
  )

  const [activeTab, setActiveTab] = useState(0)
  const [draft, setDraft] = useState<Project>(() => {
    if (storedProject) {
      return JSON.parse(JSON.stringify(storedProject)) as Project
    }
    return { id: '', name: '', path: '' }
  })

  if (!storedProject) return null

  const session = getSessionForProject(storedProject.id)
  const isRunning = session?.status === 'running'
  const isDirty = JSON.stringify(draft) !== JSON.stringify(storedProject)

  function handleChange(updates: Partial<Project>): void {
    setDraft((prev) => ({ ...prev, ...updates }))
  }

  async function handleSave(): Promise<void> {
    await updateProject(draft)
    closeSettings()
  }

  function handleCancel(): void {
    closeSettings()
  }

  async function handleRemoveProject(): Promise<void> {
    await deleteProject(draft.id)
    closeSettings()
  }

  const icon = draft.identity?.icon ?? '\u2B21'
  const accentColor = draft.identity?.accentColor ?? 'var(--amber)'

  const TAB_COMPONENTS = [
    <GeneralTab key="general" draft={draft} onChange={handleChange} />,
    <StartupTab key="startup" draft={draft} onChange={handleChange} />,
    <AgentTab key="agent" draft={draft} onChange={handleChange} />,
    <TemplatesTab key="templates" draft={draft} onChange={handleChange} />,
    <IdentityTab key="identity" draft={draft} onChange={handleChange} />,
    <AdvancedTab
      key="advanced"
      draft={draft}
      onChange={handleChange}
      onRemoveProject={() => void handleRemoveProject()}
    />,
  ]

  return (
    <div className="settings-main">
      {/* Unsaved warning strip */}
      {isDirty && (
        <div className="unsaved-warning">
          You have unsaved changes. Save or cancel before leaving.
        </div>
      )}

      {/* Project header */}
      <div className="project-header">
        <div className="project-header-top">
          <div
            className="project-icon-large"
            style={{ background: accentColor }}
            onClick={() => setActiveTab(4)}
          >
            {icon}
          </div>
          <div className="project-header-info">
            <div className="project-title-row">
              <div className="project-title">{draft.name || 'Untitled'}</div>
              <button type="button" className="project-title-edit" onClick={() => setActiveTab(0)}>
                rename
              </button>
            </div>
            <div className="project-path-row">
              <span className="project-path">{draft.path}</span>
              {isRunning && <span className="project-path-badge">Running</span>}
            </div>
          </div>
          <div className="project-header-actions">
            <button
              type="button"
              className="header-action-btn primary"
              onClick={() => {
                const existing = getSessionForProject(storedProject.id)
                if (existing) {
                  setActiveSession(existing.id)
                } else {
                  addSession(`session-${storedProject.id}`, storedProject.id)
                }
                closeSettings()
              }}
            >
              {isRunning ? 'Switch to session' : 'Open session'}
            </button>
            <button type="button" className="header-action-btn" onClick={() => setActiveTab(5)}>
              Remove project
            </button>
          </div>
        </div>

        <div className="settings-tabs">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab${i === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Settings body */}
      <div className="settings-body">
        <div className="settings-tab-panel" key={activeTab}>
          {TAB_COMPONENTS[activeTab]}
        </div>
      </div>

      {/* Footer */}
      <div className="settings-footer">
        {isDirty && (
          <div className="unsaved-indicator">
            <span className="unsaved-dot" />
            Unsaved changes
          </div>
        )}
        <div className="settings-footer-spacer" />
        <button type="button" className="footer-btn" onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className="footer-btn primary" onClick={() => void handleSave()}>
          Save
        </button>
      </div>
    </div>
  )
}
