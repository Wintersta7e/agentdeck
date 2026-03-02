import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ParticleField } from './ParticleField'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import type { Project, Template, StackBadge } from '../../../shared/types'
import './HomeScreen.css'

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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Sanitize badge to a valid CSS class segment (e.g. ".NET" → "net") */
function badgeClass(badge: string): string {
  return badge.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const STATUS_DOT_STYLES: Record<string, React.CSSProperties> = {
  running: { background: 'var(--green)' },
  error: { background: 'var(--red)' },
  idle: { background: 'var(--text3)' },
}

const BADGE_ICONS: Record<StackBadge, string> = {
  Java: '\u2615',
  JS: '\u2B21',
  TS: '\u2B21',
  Python: '\uD83D\uDC0D',
  Rust: '\uD83E\uDD80',
  Go: '\u25C8',
  '.NET': '\u266F',
  'C/C++': '\u2699',
  Ruby: '\u2666',
  PHP: '\uD83D\uDC18',
  Kotlin: 'K',
  Swift: '\uD83D\uDC26',
  Dart: '\u25B8',
  Agent: '\u25C8',
  Other: '\u26A1',
}
const BADGE_ICON_CLASS: Record<StackBadge, string> = {
  Java: 'card-icon-java',
  JS: 'card-icon-js',
  TS: 'card-icon-ts',
  Python: 'card-icon-python',
  Rust: 'card-icon-rust',
  Go: 'card-icon-go',
  '.NET': 'card-icon-dotnet',
  'C/C++': 'card-icon-cc',
  Ruby: 'card-icon-ruby',
  PHP: 'card-icon-php',
  Kotlin: 'card-icon-kotlin',
  Swift: 'card-icon-swift',
  Dart: 'card-icon-dart',
  Agent: 'card-icon-agent',
  Other: 'card-icon-other',
}

const AGENTS = SHARED_AGENTS.map((a) => ({ name: a.id, icon: a.icon, desc: a.description }))

interface HomeScreenProps {
  onOpenProject: (project: Project) => void
}

export function HomeScreen({ onOpenProject }: HomeScreenProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const sessions = useAppStore((s) => s.sessions)
  const openWizard = useAppStore((s) => s.openWizard)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const visibleAgents = useAppStore((s) => s.visibleAgents)
  const [agentStatus, setAgentStatus] = useState<Record<string, boolean>>({})
  const [username, setUsername] = useState('')
  const [showAllRecent, setShowAllRecent] = useState(false)

  useEffect(() => {
    window.agentDeck.app
      .wslUsername()
      .then(setUsername)
      .catch((err: unknown) => {
        window.agentDeck.log.send('warn', 'home', 'WSL username fetch failed', {
          err: String(err),
        })
      })
    // Errors are logged to console; useProjects handles user-facing notifications
    window.agentDeck.agents
      .check()
      .then(setAgentStatus)
      .catch((err: unknown) => {
        window.agentDeck.log.send('error', 'home', 'Agent detection failed', {
          err: String(err),
        })
      })
  }, [])

  const pinned = useMemo(() => projects.filter((p) => p.pinned), [projects])
  const allRecent = useMemo(
    () =>
      [...projects]
        .filter((p) => p.lastOpened)
        .sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0)),
    [projects],
  )
  const recent = showAllRecent ? allRecent : allRecent.slice(0, 5)

  const activeSessions = useMemo(
    () => Object.values(sessions).filter((s) => s.status === 'running').length,
    [sessions],
  )
  const erroredSessions = useMemo(
    () => Object.values(sessions).filter((s) => s.status === 'error').length,
    [sessions],
  )

  const projectStatusMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of Object.values(sessions)) {
      if (s.projectId) map[s.projectId] = s.status
    }
    return map
  }, [sessions])

  function getProjectStatus(projectId: string): string {
    return projectStatusMap[projectId] ?? 'idle'
  }

  function statusColorClass(status: string): string {
    if (status === 'running') return 'green'
    if (status === 'error') return 'red'
    return ''
  }

  return (
    <div className="home-main">
      <div className="home-decor">
        <div className="home-aurora" />
        <ParticleField />
      </div>
      <div className="home-content">
        <div className="greeting">
          <div className="greeting-eyebrow">{formatDate()}</div>
          <div className="greeting-headline">
            {getGreeting()}, <span>{username || 'operator'}</span>.
          </div>
          <div className="greeting-sub">
            {activeSessions} session{activeSessions !== 1 ? 's' : ''} running
            {' \u00B7 '}
            {pinned.length} project{pinned.length !== 1 ? 's' : ''} pinned
            {' \u00B7 '}
            {templates.length} template{templates.length !== 1 ? 's' : ''} ready
          </div>
        </div>

        <div className="quick-open" onClick={openWizard}>
          <span className="quick-open-icon">{'\u2318'}</span>
          <span className="quick-open-text">Open project, run template, or jump to session...</span>
          <span className="quick-open-hint">Ctrl+N</span>
        </div>

        <div className="stats-row">
          <div className="stat-item">
            <div className={`stat-value ${activeSessions > 0 ? 'green' : ''}`}>
              {activeSessions}
            </div>
            <div className="stat-label">Active sessions</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{projects.length}</div>
            <div className="stat-label">Projects total</div>
          </div>
          <div className="stat-item">
            <div className="stat-value amber">{templates.length}</div>
            <div className="stat-label">Templates</div>
          </div>
          <div className="stat-item">
            <div className={`stat-value ${erroredSessions > 0 ? 'red' : ''}`}>
              {erroredSessions}
            </div>
            <div className="stat-label">Errored</div>
          </div>
        </div>

        {pinned.length > 0 && (
          <>
            <div className="section-header">
              <div className="section-title">Pinned Projects</div>
              <button className="section-action" onClick={openWizard}>
                {'+ New \u2192'}
              </button>
            </div>
            <div className="pinned-grid">
              {pinned.map((p, index) => {
                const status = getProjectStatus(p.id)
                const tNames = (p.attachedTemplates ?? [])
                  .map((tid) => templates.find((t) => t.id === tid))
                  .filter((t): t is Template => t !== undefined)
                return (
                  <div
                    key={p.id}
                    className={`project-card stagger-item ${status === 'running' ? 'running' : ''} ${status === 'error' ? 'error' : ''}`}
                    style={{ animationDelay: `${index * 60}ms` }}
                    onClick={() => onOpenProject(p)}
                  >
                    <div className="card-top">
                      <div
                        className={`card-icon ${(p.badge && BADGE_ICON_CLASS[p.badge]) ?? 'card-icon-agent'}`}
                      >
                        {(p.badge && BADGE_ICONS[p.badge]) ?? '\u25C8'}
                      </div>
                      <div className={`card-status ${statusColorClass(status)}`}>
                        <div
                          className={`card-status-dot ${statusColorClass(status)}`}
                          style={STATUS_DOT_STYLES[status] ?? STATUS_DOT_STYLES.idle}
                        />
                        {status}
                      </div>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-path">{p.path}</div>
                    <div className="card-meta">
                      {p.badge && (
                        <span className={`card-badge badge-${badgeClass(p.badge)}`}>{p.badge}</span>
                      )}
                      <span className="card-last">{timeAgo(p.lastOpened)}</span>
                    </div>
                    {tNames.length > 0 && (
                      <div className="card-templates">
                        {tNames.map((t) => (
                          <span key={t.id} className="card-template-chip">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {recent.length > 0 && (
          <>
            <div className="section-header">
              <div className="section-title">Recent</div>
              {allRecent.length > 5 && (
                <button className="section-action" onClick={() => setShowAllRecent((v) => !v)}>
                  {showAllRecent ? 'Show less' : `See all (${allRecent.length}) \u2192`}
                </button>
              )}
            </div>
            <div className="recent-list">
              {recent.map((p, index) => {
                const status = getProjectStatus(p.id)
                return (
                  <div
                    key={p.id}
                    className="recent-item stagger-item"
                    style={{ animationDelay: `${index * 60}ms` }}
                    onClick={() => onOpenProject(p)}
                  >
                    <div
                      className="recent-dot"
                      style={STATUS_DOT_STYLES[status] ?? STATUS_DOT_STYLES.idle}
                    />
                    <div className="recent-name">{p.name}</div>
                    <div className="recent-path">{p.path}</div>
                    {p.badge && (
                      <span className={`recent-badge badge-${badgeClass(p.badge)}`}>{p.badge}</span>
                    )}
                    <div className="recent-time">{timeAgo(p.lastOpened)}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="section-header">
          <div className="section-title">Available Agents</div>
          <button className="section-action" onClick={() => openCommandPalette('agents')}>
            {'Configure \u2192'}
          </button>
        </div>
        <div className="agent-grid">
          {AGENTS.filter((a) => !visibleAgents || visibleAgents.includes(a.name)).map((a) => (
            <div key={a.name} className={`agent-card ${agentStatus[a.name] ? 'active' : ''}`}>
              <div className="agent-card-icon">{a.icon}</div>
              <div className="agent-card-name">{a.name}</div>
              <div className="agent-card-desc">{a.desc}</div>
              {agentStatus[a.name] !== undefined && (
                <div className={agentStatus[a.name] ? 'agent-installed' : 'agent-missing'}>
                  {agentStatus[a.name] ? '\u2713 installed' : '\u2717 not found'}
                </div>
              )}
            </div>
          ))}
          <div className="agent-card add-agent" onClick={() => openCommandPalette('agents')}>
            <div className="agent-card-icon agent-add-icon">+</div>
            <div className="agent-card-name agent-add-name">Add agent</div>
            <div className="agent-card-desc">Custom command</div>
          </div>
        </div>
      </div>
    </div>
  )
}
