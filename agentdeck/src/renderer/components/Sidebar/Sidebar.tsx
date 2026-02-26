import { useAppStore } from '../../store/appStore'
import type { Project } from '../../../shared/types'
import './Sidebar.css'

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

  const pinned = projects.filter((p) => p.pinned)
  const recent = [...projects]
    .filter((p) => !p.pinned && p.lastOpened)
    .sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
    .slice(0, 5)

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
        <div className="sidebar-label">
          Pinned
          <button className="sidebar-action" onClick={openWizard}>
            +
          </button>
        </div>
        {pinned.map((p) => (
          <div
            key={p.id}
            className={`sidebar-item ${isActive(p.id) ? 'active' : ''}`}
            onClick={() => onOpenProject(p)}
          >
            <div className={`sidebar-dot ${dotClass(getProjectStatus(p.id))}`} />
            <div className="sidebar-item-info">
              <div className="sidebar-item-name">{p.name}</div>
              <div className="sidebar-item-sub">{p.path}</div>
            </div>
            {p.badge && (
              <span className={`sidebar-badge badge-${p.badge.toLowerCase()}`}>{p.badge}</span>
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

      <div className="sidebar-section">
        <div className="sidebar-label">Recent</div>
        {recent.map((p) => (
          <div
            key={p.id}
            className={`sidebar-item ${isActive(p.id) ? 'active' : ''}`}
            onClick={() => onOpenProject(p)}
          >
            <div className={`sidebar-dot ${dotClass(getProjectStatus(p.id))}`} />
            <div className="sidebar-item-info">
              <div className="sidebar-item-name">{p.name}</div>
              <div className="sidebar-item-sub">{timeAgo(p.lastOpened)}</div>
            </div>
            {p.badge && (
              <span className={`sidebar-badge badge-${p.badge.toLowerCase()}`}>{p.badge}</span>
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

      <div className="sidebar-section flex-fill">
        <div className="sidebar-label">
          Templates
          <button className="sidebar-action" onClick={() => openTemplateEditor()}>
            +
          </button>
        </div>
        {templates.map((t) => (
          <div key={t.id} className="sidebar-item" onClick={() => openTemplateEditor(t.id)}>
            <span style={{ fontSize: '11px' }}>{'\u{1F4CB}'}</span>
            <div className="sidebar-item-info">
              <div className="sidebar-item-name">{t.name}</div>
              <div className="sidebar-item-sub">{t.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-bottom">
        <button className="new-project-btn" onClick={openWizard}>
          <span>+</span> New Project
        </button>
      </div>
    </div>
  )
}
