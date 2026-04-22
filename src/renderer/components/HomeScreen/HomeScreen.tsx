import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plus, FolderOpen, Bot, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useGitStatusBatch } from '../../hooks/useGitStatus'
import { useDailyDigest } from '../../hooks/useDailyDigest'
import { ScopeViz } from '../home/ScopeViz'
import { Panel } from '../home/Panel'
import { KpiTile } from '../home/KpiTile'
import { QuickActions } from './QuickActions'
import { LiveSessionGrid } from './LiveSessionGrid'
import { ProjectCardV2 } from './ProjectCardV2'
import { SuggestionsPanel } from './SuggestionsPanel'
import { ReviewQueue } from './ReviewQueue'
import { RecentWorkflows } from './RecentWorkflows'
import { SessionTimeline } from './SessionTimeline'
import { CostDashboard } from './CostDashboard'
import { AgentStrip } from './AgentStrip'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import { getProjectAgents } from '../../../shared/agent-helpers'
import type { AgentConfig, Project } from '../../../shared/types'
import './HomeScreen.css'

const AGENT_META_MAP = new Map<string, (typeof SHARED_AGENTS)[number]>(
  SHARED_AGENTS.map((a) => [a.id, a]),
)

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDateCaption(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .toUpperCase()
}

function formatClock(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

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
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const username = useAppStore((s) => s.wslUsername)

  const runningCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const errorCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'error').length,
  )
  const totalTokens = useAppStore((s) => {
    let total = 0
    for (const usage of Object.values(s.sessionUsage)) {
      total += usage?.inputTokens ?? 0
      total += usage?.outputTokens ?? 0
    }
    return total
  })
  const alertCount = useAppStore((s) => s.notifications.length)

  const digest = useDailyDigest()
  const cleanExitPct = digest.cleanExitRate !== null ? `${Math.round(digest.cleanExitRate)}%` : '—'

  const [clock, setClock] = useState(formatClock)
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    projectId: string
  } | null>(null)
  const cardMenuRef = useRef<HTMLDivElement>(null)

  const pinned = useMemo(() => projects.filter((p) => p.pinned), [projects])
  const pinnedIds = useMemo(() => pinned.map((p) => p.id), [pinned])
  useGitStatusBatch(pinnedIds)
  const hasProjects = projects.length > 0

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

  const handleResumeLast = useCallback(() => {
    const allSessions = Object.values(useAppStore.getState().sessions)
    const running = allSessions.filter((s) => s.status === 'running')
    if (running.length === 0) return
    const newest = running.sort((a, b) => b.startedAt - a.startedAt)[0]
    if (newest) {
      setActiveSession(newest.id)
      setCurrentView('session')
    }
  }, [setActiveSession, setCurrentView])

  const greeting = getGreeting()
  const dateCaption = formatDateCaption()
  const totalSessionsMessage = useMemo(() => {
    const parts: string[] = []
    parts.push(`${runningCount} running`)
    parts.push(`${projects.length} project${projects.length === 1 ? '' : 's'}`)
    parts.push(`${templates.length} template${templates.length === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }, [runningCount, projects.length, templates.length])

  return (
    <div className="home-main home-main--redesign">
      <div className="home-greeting">
        <div className="home-greeting__left">
          <div className="home-date">{dateCaption}</div>
          <h1 className="home-headline">
            {greeting}, <span className="home-headline__accent">{username || 'operator'}</span>.
          </h1>
          <div className="home-sub">{totalSessionsMessage}</div>
          <div className="home-cta-row">
            <button
              type="button"
              className="home-cta home-cta--primary"
              onClick={() => openCommandPalette(undefined, 'all')}
            >
              ▸ NEW SESSION
            </button>
            <button
              type="button"
              className="home-cta home-cta--ghost"
              onClick={handleResumeLast}
              disabled={runningCount === 0}
            >
              RESUME LAST
            </button>
            <button
              type="button"
              className="home-cta home-cta--ghost"
              onClick={() => setCurrentView('diff')}
            >
              REVIEW DIFFS {alertCount > 0 ? `· ${alertCount}` : ''}
            </button>
          </div>
        </div>
        <div className="home-clock" aria-label="Current time">
          <div className="home-clock__caption">{dateCaption}</div>
          <div className="home-clock__digits">{clock}</div>
          <div className="home-clock__meta">
            {pinned.length} pinned project{pinned.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="home-hero-row">
        <Panel
          title="OVERVIEW"
          sub={`${runningCount} session${runningCount === 1 ? '' : 's'} · ${projects.length} project${projects.length === 1 ? '' : 's'}`}
          className="home-hero-panel"
        >
          <div className="home-hero-panel__viz">
            <ScopeViz size={280} />
          </div>
        </Panel>

        <div className="home-hero-right">
          <div className="home-kpi-row">
            <KpiTile
              label="SESSIONS"
              value={String(digest.sessionsToday)}
              sub={`${runningCount} live`}
            />
            <KpiTile
              label="COST TODAY"
              value={formatCost(digest.costToday)}
              sub="today"
              tone="purple"
            />
            <KpiTile label="TOKENS" value={formatTokens(totalTokens)} sub="total" />
            <KpiTile label="EXIT RATE" value={cleanExitPct} sub="clean" tone="green" />
            <KpiTile
              label="ALERTS"
              value={String(alertCount)}
              sub={errorCount > 0 ? `${errorCount} errored` : 'all clear'}
              tone={alertCount > 0 ? 'red' : 'green'}
            />
          </div>
          <Panel title="ACTIVITY" sub="last 60 min" className="home-activity-panel">
            <SessionTimeline />
          </Panel>
        </div>
      </div>

      <Panel
        title="LIVE SESSIONS"
        sub={`${runningCount} live · ${pinned.length} pinned`}
        className="home-live-panel"
      >
        <LiveSessionGrid />
      </Panel>

      <Panel title="AGENTS" sub="7 available" className="home-agents-panel">
        <AgentStrip />
      </Panel>

      <div className="home-projects-row">
        {hasProjects ? (
          <Panel
            title="PROJECTS"
            sub={`pinned · ${pinned.length}`}
            className="home-projects-panel"
            action={
              <button
                type="button"
                className="home-inline-btn"
                onClick={openWizard}
                title="New project"
              >
                <Plus size={12} aria-hidden="true" /> NEW
              </button>
            }
          >
            <div className="home-project-grid">
              {pinned.map((p) => (
                <ProjectCardV2
                  key={p.id}
                  project={p}
                  onOpen={() => onOpenProject(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCardMenu({ x: e.clientX, y: e.clientY, projectId: p.id })
                  }}
                />
              ))}
              <button className="home-add-card" onClick={openWizard} type="button">
                <Plus size={16} />
                <span>New project</span>
              </button>
            </div>
          </Panel>
        ) : (
          <div className="home-welcome">
            <h2 className="home-welcome-title">Get started</h2>
            <div className="home-welcome-steps">
              <div className="home-welcome-step">
                <FolderOpen size={20} className="home-welcome-icon" />
                <div className="home-welcome-step-num">1</div>
                <div className="home-welcome-step-title">Pick a folder</div>
                <div className="home-welcome-step-desc">Point AgentDeck at your project</div>
              </div>
              <div className="home-welcome-step">
                <Bot size={20} className="home-welcome-icon" />
                <div className="home-welcome-step-num">2</div>
                <div className="home-welcome-step-title">Choose an agent</div>
                <div className="home-welcome-step-desc">7 agents supported</div>
              </div>
              <div className="home-welcome-step">
                <Terminal size={20} className="home-welcome-icon" />
                <div className="home-welcome-step-num">3</div>
                <div className="home-welcome-step-title">Start coding</div>
                <div className="home-welcome-step-desc">Launch a session and go</div>
              </div>
            </div>
            <button className="home-welcome-cta" onClick={openWizard} type="button">
              Create Project <ArrowRight size={14} />
            </button>
            <div className="home-welcome-hint">or press Ctrl+N anytime</div>
          </div>
        )}

        <Panel title="COST / WK" sub="7-day" className="home-cost-panel">
          <CostDashboard />
        </Panel>
      </div>

      <div className="home-extra-row">
        <QuickActions
          onNewSession={() => openCommandPalette(undefined, 'all')}
          onRunWorkflow={() => openCommandPalette(undefined, 'workflow')}
          onFromTemplate={() => openCommandPalette(undefined, 'template')}
          onResumeLast={handleResumeLast}
          resumeDisabled={runningCount === 0}
        />
        <SuggestionsPanel />
        <ReviewQueue />
        <RecentWorkflows />
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
                const agentMeta = AGENT_META_MAP.get(ac.agent)
                return (
                  <button
                    key={ac.agent}
                    className="home-context-item"
                    onClick={() => {
                      onOpenProjectWithAgent(project, ac)
                      setCardMenu(null)
                    }}
                  >
                    <span className="home-ctx-agent-icon">{agentMeta?.icon ?? '◈'}</span>
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
