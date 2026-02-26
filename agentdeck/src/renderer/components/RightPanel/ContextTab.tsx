import { useAppStore } from '../../store/appStore'

export function ContextTab(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab)

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined
  const project = activeSession ? projects.find((p) => p.id === activeSession.projectId) : undefined

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

  const attachedTemplates = (project.attachedTemplates ?? [])
    .map((tid) => templates.find((t) => t.id === tid))
    .filter(Boolean)

  const activeTemplate = attachedTemplates[0]

  return (
    <>
      <div className="panel-section-header">Project files</div>
      {contextFiles.map((file) => (
        <div key={file.name} className="context-item" onClick={() => setRightPanelTab('memory')}>
          <div className="context-item-header">
            <span className="context-icon">{'\uD83D\uDCC4'}</span>
            <span className="context-name">{file.name}</span>
            {file.tag && <span className="context-tag">{file.tag}</span>}
          </div>
          <div className="context-path">{file.path}</div>
        </div>
      ))}

      <div className="panel-section-header">Active template</div>
      {activeTemplate ? (
        <div className="context-item" style={{ borderColor: 'var(--amber-border)' }}>
          <div className="context-item-header">
            <span className="context-icon">{'\uD83D\uDCCB'}</span>
            <span className="context-name" style={{ color: 'var(--amber)' }}>
              {activeTemplate.name}
            </span>
          </div>
          <div className="context-path">{activeTemplate.description}</div>
        </div>
      ) : (
        <div className="panel-placeholder">No template attached</div>
      )}

      <div className="panel-section-header">Project notes</div>
      {project.notes ? (
        <div className="context-path" style={{ padding: '4px 0' }}>
          {project.notes}
        </div>
      ) : (
        <div className="panel-placeholder">No notes</div>
      )}
    </>
  )
}
