import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ParticleField } from './ParticleField'
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

const BADGE_ICONS: Record<StackBadge, string> = {
  Java: '\u2615',
  JS: '\u2B21',
  TS: '\u2B21',
  Python: '\uD83D\uDC0D',
  Rust: '\uD83E\uDD80',
  Go: '\u25C8',
  '.NET': '\u266F',
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
  Agent: 'card-icon-agent',
  Other: 'card-icon-other',
}

interface AgentInfo {
  name: string
  icon: string
  desc: string
}

const AGENTS: AgentInfo[] = [
  { name: 'claude-code', icon: '\u2B21', desc: 'Anthropic CLI' },
  { name: 'codex', icon: '\u25C8', desc: 'OpenAI CLI' },
  { name: 'aider', icon: '\u25B8', desc: 'Git-aware agent' },
]

interface HomeScreenProps {
  onOpenProject: (project: Project) => void
}

export function HomeScreen({ onOpenProject }: HomeScreenProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const sessions = useAppStore((s) => s.sessions)
  const openWizard = useAppStore((s) => s.openWizard)
  const [agentStatus, setAgentStatus] = useState<Record<string, boolean>>({})
  const [username, setUsername] = useState('')

  useEffect(() => {
    window.agentDeck.app
      .wslUsername()
      .then(setUsername)
      .catch(() => {})
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

  const pinned = projects.filter((p) => p.pinned)
  const recent = [...projects]
    .filter((p) => p.lastOpened)
    .sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
    .slice(0, 5)

  const activeSessions = Object.values(sessions).filter((s) => s.status === 'running').length
  const erroredSessions = Object.values(sessions).filter((s) => s.status === 'error').length

  function getProjectStatus(projectId: string): string {
    const session = Object.values(sessions).find((s) => s.projectId === projectId)
    return session ? session.status : 'idle'
  }

  function statusColorClass(status: string): string {
    if (status === 'running') return 'green'
    if (status === 'error') return 'red'
    return ''
  }

  return (
    <div className="home-main">
      <div className="home-aurora" />
      <ParticleField />
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
                          style={{
                            background:
                              status === 'running'
                                ? 'var(--green)'
                                : status === 'error'
                                  ? 'var(--red)'
                                  : 'var(--text3)',
                          }}
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
              <button className="section-action">{'See all \u2192'}</button>
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
                      style={{
                        background:
                          status === 'running'
                            ? 'var(--green)'
                            : status === 'error'
                              ? 'var(--red)'
                              : 'var(--text3)',
                      }}
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
          <button className="section-action">{'Configure \u2192'}</button>
        </div>
        <div className="agent-grid">
          {AGENTS.map((a) => (
            <div key={a.name} className={`agent-card ${agentStatus[a.name] ? 'active' : ''}`}>
              <div className="agent-card-icon">{a.icon}</div>
              <div className="agent-card-name">{a.name}</div>
              <div className="agent-card-desc">
                {a.desc}
                {agentStatus[a.name] !== undefined && (
                  <span className={agentStatus[a.name] ? 'agent-installed' : 'agent-missing'}>
                    {agentStatus[a.name] ? ' \u2713 installed' : ' \u2717 not found'}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="agent-card add-agent" onClick={openWizard}>
            <div className="agent-card-icon" style={{ color: 'var(--text3)' }}>
              +
            </div>
            <div className="agent-card-name" style={{ color: 'var(--text2)' }}>
              Add agent
            </div>
            <div className="agent-card-desc">Custom command</div>
          </div>
        </div>
      </div>
    </div>
  )
}
