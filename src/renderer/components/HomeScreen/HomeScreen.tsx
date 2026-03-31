import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  ArrowRight,
  RefreshCw,
  Check,
  X,
  Star,
  Plus,
  FolderOpen,
  Bot,
  Terminal,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { PanelBox } from '../shared/PanelBox'
import { ParticleField } from './ParticleField'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import type { AgentConfig, Project, Template, StackBadge } from '../../../shared/types'
import { getProjectAgents } from '../../../shared/agent-helpers'
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
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
}

export function HomeScreen({
  onOpenProject,
  onOpenProjectWithAgent,
}: HomeScreenProps): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const openWizard = useAppStore((s) => s.openWizard)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const visibleAgents = useAppStore((s) => s.visibleAgents)

  // Granular session-derived selectors — return primitives so HomeScreen
  // doesn't re-render unless the actual count changes.
  const activeSessions = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const erroredSessions = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'error').length,
  )
  // Serialized project→status map — returns a stable string so Zustand
  // only triggers re-renders when the mapping actually changes.
  const projectStatusStr = useAppStore((s) => {
    const entries: string[] = []
    for (const sess of Object.values(s.sessions)) {
      if (sess.projectId) entries.push(`${sess.projectId}:${sess.status}`)
    }
    return entries.sort().join(',')
  })
  const projectStatusMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const entry of projectStatusStr.split(',')) {
      if (!entry) continue
      const [pid, status] = entry.split(':')
      if (pid && status) map[pid] = status
    }
    return map
  }, [projectStatusStr])

  const agentStatus = useAppStore((s) => s.agentStatus)
  const agentVersions = useAppStore((s) => s.agentVersions)
  const setAgentUpdating = useAppStore((s) => s.setAgentUpdating)
  const setAgentVersion = useAppStore((s) => s.setAgentVersion)
  const addNotification = useAppStore((s) => s.addNotification)
  const username = useAppStore((s) => s.wslUsername)
  const refreshAgentStatus = useAppStore((s) => s.refreshAgentStatus)
  const agentRefreshing = useAppStore((s) => s.agentRefreshing)

  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    projectId: string
  } | null>(null)
  const cardMenuRef = useRef<HTMLDivElement>(null)

  const dateStr = formatDate()
  const greeting = getGreeting()

  const pinned = useMemo(() => projects.filter((p) => p.pinned), [projects])

  // O(1) template lookup map — avoids O(n) find() per pinned card
  const templateMap = useMemo(() => {
    const map = new Map<string, Template>()
    for (const t of templates) map.set(t.id, t)
    return map
  }, [templates])

  useEffect(() => {
    if (!cardMenu) return
    function handleClick(e: MouseEvent): void {
      if (cardMenuRef.current && !cardMenuRef.current.contains(e.target as Node)) {
        setCardMenu(null)
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setCardMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [cardMenu])

  const setProjects = useAppStore((s) => s.setProjects)

  const handleRefreshMeta = useCallback(
    async (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation()
      if (refreshingId) return // one at a time
      setRefreshingId(projectId)
      try {
        const meta = await window.agentDeck.projects.refreshMeta(projectId)

        // SK-4: Refresh Zustand store so badge + meta appear immediately.
        // The main process may have updated both `meta` and `badge`, so re-fetch
        // the full project list from the persistent store.
        const freshProjects = await window.agentDeck.store.getProjects()
        setProjects(freshProjects)

        const parts: string[] = []
        if (meta.contextFiles.length > 0) parts.push(meta.contextFiles.join(', '))
        if (meta.skills.length > 0) {
          parts.push(`${String(meta.skills.length)} skill${meta.skills.length !== 1 ? 's' : ''}`)
        }
        if (meta.scanStatus === 'partial') {
          addNotification(
            'info',
            `Project metadata updated (${String(meta.skippedSkills ?? 0)} skills skipped)`,
          )
        } else if (meta.scanStatus === 'failed') {
          addNotification('error', `Scan failed: ${meta.scanError ?? 'unknown error'}`)
        } else if (parts.length > 0) {
          addNotification('info', `Project metadata updated \u2014 found ${parts.join(', ')}`)
        } else {
          addNotification('info', 'Project metadata is up to date')
        }
      } catch (err) {
        addNotification('error', `Failed to scan project metadata: ${String(err)}`)
      } finally {
        setRefreshingId(null)
      }
    },
    [refreshingId, addNotification, setProjects],
  )

  const handleAgentUpdate = useCallback(
    async (agentId: string) => {
      setAgentUpdating(agentId, true)
      try {
        const result = await window.agentDeck.agents.update(agentId)
        const displayName = SHARED_AGENTS.find((a) => a.id === agentId)?.name ?? agentId
        if (result.success) {
          addNotification('info', `${displayName} updated to ${result.newVersion ?? 'latest'}`)
          setAgentVersion(agentId, {
            current: result.newVersion,
            latest: result.newVersion,
            updateAvailable: false,
          })
        } else {
          addNotification('error', `Failed to update ${displayName}: ${result.message}`)
        }
      } catch (err: unknown) {
        addNotification('error', `Update error: ${String(err)}`)
      } finally {
        setAgentUpdating(agentId, false)
        // Always re-detect agent availability after update to reflect real state.
        // An update can remove a binary (npm package rename, failed install, etc.)
        void refreshAgentStatus()
      }
    },
    [setAgentUpdating, setAgentVersion, addNotification, refreshAgentStatus],
  )

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
      {/* Global HexGrid in App.tsx provides background — no duplicate needed */}
      <div className="home-decor">
        <div className="home-aurora" />
        <ParticleField />
      </div>
      <div className="home-content">
        <div className="greeting">
          <div className="greeting-eyebrow">{dateStr}</div>
          <div className="greeting-headline">
            {greeting}, <span>{username || 'operator'}</span>.
          </div>
          <div className="greeting-sub">
            {activeSessions} session{activeSessions !== 1 ? 's' : ''} running
            {' \u00B7 '}
            {pinned.length} project{pinned.length !== 1 ? 's' : ''} pinned
            {' \u00B7 '}
            {templates.length} template{templates.length !== 1 ? 's' : ''} ready
          </div>
        </div>

        <PanelBox corners="all" glow="none" className="home-quick-open">
          <div
            className="quick-open"
            onClick={() => openCommandPalette()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openCommandPalette()
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="quick-open-icon">
              <Search size={14} />
            </span>
            <span className="quick-open-text">
              Open project, run template, or jump to session...
            </span>
            <span className="quick-open-hint">Ctrl+K</span>
          </div>
        </PanelBox>

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

        {pinned.length === 0 && projects.length === 0 && (
          <PanelBox corners="all" glow="none" className="home-card welcome-card">
            <div className="welcome-inner">
              <div className="welcome-headline">Get started</div>
              <div className="welcome-steps">
                <div className="welcome-step">
                  <div className="welcome-step-icon">
                    <FolderOpen size={20} />
                  </div>
                  <div className="welcome-step-num">1</div>
                  <div className="welcome-step-title">Pick a folder</div>
                  <div className="welcome-step-desc">Point AgentDeck at your project</div>
                </div>
                <div className="welcome-step">
                  <div className="welcome-step-icon">
                    <Bot size={20} />
                  </div>
                  <div className="welcome-step-num">2</div>
                  <div className="welcome-step-title">Choose an agent</div>
                  <div className="welcome-step-desc">7 agents supported, from Claude to Codex</div>
                </div>
                <div className="welcome-step">
                  <div className="welcome-step-icon">
                    <Terminal size={20} />
                  </div>
                  <div className="welcome-step-num">3</div>
                  <div className="welcome-step-title">Start coding</div>
                  <div className="welcome-step-desc">Launch a session and go</div>
                </div>
              </div>
              <button className="welcome-cta" onClick={openWizard} type="button">
                Create Project <ArrowRight size={14} />
              </button>
              <div className="welcome-hint">or press Ctrl+N anytime</div>
            </div>
          </PanelBox>
        )}

        {pinned.length > 0 && (
          <>
            <div className="section-header">
              <div className="section-title">Projects</div>
              <button className="section-action" onClick={openWizard}>
                <>
                  <Plus size={12} /> New <ArrowRight size={12} />
                </>
              </button>
            </div>
            <div className="projects-grid">
              {pinned.map((p, index) => {
                const status = getProjectStatus(p.id)
                const tNames = (p.attachedTemplates ?? [])
                  .map((tid) => templateMap.get(tid))
                  .filter((t): t is Template => t !== undefined)
                return (
                  <PanelBox key={p.id} corners={['tl', 'br']} glow="none" className="home-card">
                    <div
                      className={`project-card stagger-item ${status === 'running' ? 'running' : ''} ${status === 'error' ? 'error' : ''}`}
                      style={{ animationDelay: `${index * 60}ms` }}
                      onClick={() => onOpenProject(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenProject(p)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setCardMenu({ x: e.clientX, y: e.clientY, projectId: p.id })
                      }}
                    >
                      <div className="card-top">
                        <div
                          className={`card-icon ${(p.badge && BADGE_ICON_CLASS[p.badge]) ?? 'card-icon-agent'}`}
                        >
                          {(p.badge && BADGE_ICONS[p.badge]) ?? '\u25C8'}
                        </div>
                        <button
                          className={`card-refresh${refreshingId === p.id ? ' spinning' : ''}`}
                          onClick={(e) => void handleRefreshMeta(e, p.id)}
                          title="Refresh project metadata"
                          type="button"
                        >
                          <RefreshCw size={14} />
                        </button>
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
                          <span className={`card-badge badge-${badgeClass(p.badge)}`}>
                            {p.badge}
                          </span>
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
                      <div className="card-agents">
                        {getProjectAgents(p).map((ac) => {
                          const meta = SHARED_AGENTS.find((a) => a.id === ac.agent)
                          return (
                            <span
                              key={ac.agent}
                              className={`card-agent-chip${ac.isDefault ? ' default' : ''}`}
                              title={meta?.name ?? ac.agent}
                            >
                              {meta?.icon ?? '\u25C8'}
                              {ac.isDefault && (
                                <span className="card-agent-star">
                                  <Star size={10} fill="currentColor" />
                                </span>
                              )}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </PanelBox>
                )
              })}
            </div>
          </>
        )}

        <div className="section-header">
          <div className="section-title">Available Agents</div>
          <div className="section-actions">
            <button
              className={`section-action${agentRefreshing ? ' refreshing' : ''}`}
              onClick={() => void refreshAgentStatus()}
              disabled={agentRefreshing}
            >
              {agentRefreshing ? (
                <>
                  Refreshing… <RefreshCw size={12} className="spin" />
                </>
              ) : (
                <>
                  Refresh <RefreshCw size={12} />
                </>
              )}
            </button>
            <button className="section-action" onClick={() => openCommandPalette('agents')}>
              <>
                Configure <ArrowRight size={12} />
              </>
            </button>
          </div>
        </div>
        <div className="agent-grid">
          {Object.keys(agentStatus).length === 0 &&
            Array.from({ length: 4 }, (_, i) => (
              <PanelBox
                key={`skel-${String(i)}`}
                corners={['tl', 'br']}
                glow="none"
                className="home-card"
              >
                <div className="agent-card agent-card-skeleton">
                  <div className="skeleton-line skeleton-icon" />
                  <div className="skeleton-line skeleton-name" />
                  <div className="skeleton-line skeleton-desc" />
                </div>
              </PanelBox>
            ))}
          {AGENTS.filter((a) => !visibleAgents || visibleAgents.includes(a.name)).map((a) => {
            const vInfo = agentVersions[a.name]
            const installed = agentStatus[a.name]
            return (
              <PanelBox key={a.name} corners={['tl', 'br']} glow="none" className="home-card">
                <div className={`agent-card ${installed ? 'active' : ''}`}>
                  <div className="agent-card-icon">{a.icon}</div>
                  <div className="agent-card-name">{a.name}</div>
                  {vInfo?.current && <div className="agent-card-version">v{vInfo.current}</div>}
                  <div className="agent-card-desc">{a.desc}</div>
                  {agentStatus[a.name] !== undefined && (
                    <div
                      className={installed ? 'agent-installed' : 'agent-missing'}
                      title={
                        installed
                          ? undefined
                          : `Install: ${SHARED_AGENTS.find((sa) => sa.id === a.name)?.updateCmd ?? 'See agent docs'}`
                      }
                    >
                      {installed ? (
                        <>
                          <Check size={12} /> installed
                        </>
                      ) : (
                        <>
                          <X size={12} /> not found
                        </>
                      )}
                    </div>
                  )}
                  {installed && vInfo && (
                    <>
                      <button
                        className={`agent-update-btn${vInfo.updateAvailable ? ' has-update' : ''}${vInfo.updating ? ' updating' : ''}`}
                        disabled={vInfo.updating || !vInfo.updateAvailable}
                        onClick={() => void handleAgentUpdate(a.name)}
                        type="button"
                      >
                        {vInfo.updating ? (
                          'Updating\u2026'
                        ) : vInfo.updateAvailable ? (
                          <>
                            Update <ArrowRight size={12} /> {vInfo.latest}
                          </>
                        ) : (
                          <>
                            <Check size={12} /> Up to date
                          </>
                        )}
                      </button>
                      {vInfo.updating && <div className="agent-update-progress" />}
                    </>
                  )}
                </div>
              </PanelBox>
            )
          })}
          <div
            className="agent-card add-agent"
            onClick={() => openCommandPalette('agents')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openCommandPalette('agents')
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="agent-card-icon agent-add-icon">
              <Plus size={20} />
            </div>
            <div className="agent-card-name agent-add-name">Add agent</div>
            <div className="agent-card-desc">Custom command</div>
          </div>
        </div>
      </div>

      {cardMenu &&
        (() => {
          const project = projects.find((pp) => pp.id === cardMenu.projectId)
          if (!project) return null
          const projectAgents = getProjectAgents(project)
          return (
            <div
              ref={cardMenuRef}
              className="home-context-menu"
              style={{
                top: Math.min(cardMenu.y, window.innerHeight - 200),
                left: Math.min(cardMenu.x, window.innerWidth - 180),
              }}
            >
              <div className="home-context-header">Launch with...</div>
              {projectAgents.map((ac) => {
                const agentMeta = SHARED_AGENTS.find((a) => a.id === ac.agent)
                return (
                  <button
                    key={ac.agent}
                    className="home-context-item"
                    onClick={() => {
                      onOpenProjectWithAgent(project, ac)
                      setCardMenu(null)
                    }}
                  >
                    <span className="home-ctx-agent-icon">{agentMeta?.icon ?? '\u25C8'}</span>
                    <span className="home-ctx-agent-name">{agentMeta?.name ?? ac.agent}</span>
                    {ac.isDefault && <span className="home-ctx-agent-badge">DEFAULT</span>}
                  </button>
                )
              })}
            </div>
          )
        })()}
    </div>
  )
}
