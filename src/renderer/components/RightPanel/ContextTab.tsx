import { useCallback, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import type { Template } from '../../../shared/types'
import { File, ClipboardList } from 'lucide-react'
import './ContextTab.css'

export function ContextTab(): React.JSX.Element {
  // Single atomic selector — avoids stale closure between chained selectors
  const project = useAppStore((s) => {
    const sid = s.activeSessionId
    if (!sid) return null
    const session = s.sessions[sid]
    if (!session?.projectId) return null
    return s.projects.find((p) => p.id === session.projectId) ?? null
  })
  const templates = useAppStore((s) => s.templates)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab)

  const handleTemplateClick = useCallback(
    (template: Template) => {
      if (!activeSessionId || !template.content) return
      void window.agentDeck.pty.write(activeSessionId, template.content + '\n')
    },
    [activeSessionId],
  )

  const attachedTemplates = useMemo(
    () =>
      project
        ? (project.attachedTemplates ?? [])
            .map((tid) => templates.find((t) => t.id === tid))
            .filter((t): t is Template => t !== undefined)
        : [],
    [project, templates],
  )

  if (!project) {
    return <div className="panel-placeholder">No active session</div>
  }

  const contextFiles: Array<{ name: string; path: string; tag?: string }> = []
  if (project.path) {
    contextFiles.push(
      { name: 'CLAUDE.md', path: `${project.path}/CLAUDE.md`, tag: 'auto' },
      { name: 'AGENTS.md', path: `${project.path}/AGENTS.md`, tag: 'auto' },
    )
  }

  return (
    <>
      <div className="panel-section-header">Project files</div>
      {contextFiles.map((file) => (
        <div key={file.name} className="context-item" onClick={() => setRightPanelTab('memory')}>
          <div className="context-item-header">
            <span className="context-icon">
              <File size={14} />
            </span>
            <span className="context-name">{file.name}</span>
            {file.tag && <span className="context-tag">{file.tag}</span>}
          </div>
          <div className="context-path">{file.path}</div>
        </div>
      ))}

      <div className="panel-section-header">
        Attached templates
        {attachedTemplates.length > 0 ? ` (${String(attachedTemplates.length)})` : ''}
      </div>
      {attachedTemplates.length > 0 ? (
        attachedTemplates.map((t) => (
          <div
            key={t.id}
            className="context-item context-item--template"
            onClick={() => handleTemplateClick(t)}
            title="Click to send to agent"
          >
            <div className="context-item-header">
              <span className="context-icon">
                <ClipboardList size={14} />
              </span>
              <span className="context-name context-name--template">{t.name}</span>
              {t.category && <span className="context-tag">{t.category}</span>}
            </div>
            <div className="context-path">{t.description}</div>
          </div>
        ))
      ) : (
        <div className="panel-placeholder">No templates attached</div>
      )}

      <div className="panel-section-header">Project notes</div>
      {project.notes ? (
        <div className="context-path context-notes">{project.notes}</div>
      ) : (
        <div className="panel-placeholder">No notes</div>
      )}
    </>
  )
}
