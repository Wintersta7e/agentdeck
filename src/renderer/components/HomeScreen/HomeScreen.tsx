import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useGitStatusBatch } from '../../hooks/useGitStatus'
import { useDailyDigest } from '../../hooks/useDailyDigest'
import { ScopeViz } from '../home/ScopeViz'
import { Panel } from '../home/Panel'
import { KpiTile } from '../home/KpiTile'
import { SessionTimelineB1 } from '../home/SessionTimelineB1'
import { AgentChipStripB1 } from '../home/AgentChipB1'
import { ProjectCardB1 } from '../home/ProjectCardB1'
import { CostReadoutB1 } from '../home/CostReadoutB1'
import { Mascot } from '../Mascot/Mascot'
import { AGENTS as SHARED_AGENTS } from '../../../shared/agents'
import { getProjectAgents } from '../../../shared/agent-helpers'
import type { AgentConfig, Project } from '../../../shared/types'
import './HomeScreen.css'

const AGENT_META_MAP = new Map<string, (typeof SHARED_AGENTS)[number]>(
  SHARED_AGENTS.map((a) => [a.id, a]),
)

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDateCaption(d: Date): string {
  return d
    .toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .toUpperCase()
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', {
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
  const setTab = useAppStore((s) => s.setTab)
  const username = useAppStore((s) => s.wslUsername)
  const mascotEnabled = useAppStore((s) => s.mascotEnabled)

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

  // Live clock — ticks every 15s, keeps "now" stable across children
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  const nowDate = useMemo(() => new Date(now), [now])
  const greeting = getGreeting(nowDate.getHours())
  const dateCaption = formatDateCaption(nowDate)
  const clock = formatClock(nowDate)

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

  const summaryLine = useMemo(() => {
    const parts: string[] = []
    parts.push(`${runningCount} running`)
    parts.push(`${projects.length} project${projects.length === 1 ? '' : 's'}`)
    parts.push(`${templates.length} template${templates.length === 1 ? '' : 's'}`)
    if (errorCount > 0) parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }, [runningCount, projects.length, templates.length, errorCount])

  return (
    <div className="home-main home-main--redesign">
      {/* ── Row 1 · Greeting ─────────────────────────────────── */}
      <section className={`home-greeting${mascotEnabled ? ' home-greeting--mascot' : ''}`}>
        {mascotEnabled && (
          <div className="home-greeting__mascot" aria-hidden="true">
            <Mascot size={130} />
          </div>
        )}
        <div className="home-greeting__left">
          <div className="home-date">{dateCaption}</div>
          <h1 className="home-headline">
            {greeting}, <span className="home-headline__accent">{username || 'operator'}</span>.
          </h1>
          <div className="home-sub">{summaryLine}</div>
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
              onClick={() => setTab('alerts')}
            >
              REVIEW ALERTS{alertCount > 0 ? ` · ${alertCount}` : ''}
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
      </section>

      {/* ── Row 2 · Hero (scope + KPI strip + timeline) ──────── */}
      <section className="home-hero-row">
        <Panel
          title="OVERVIEW"
          sub={`${runningCount} LIVE · ${projects.length} PROJECTS`}
          className="home-hero-panel"
        >
          <div className="home-hero-panel__viz">
            <ScopeViz size={300} />
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
            <KpiTile label="TOKENS" value={formatTokens(totalTokens)} sub="input+output" />
            <KpiTile label="EXIT RATE" value={cleanExitPct} sub="clean" tone="green" />
            <KpiTile
              label="ALERTS"
              value={String(alertCount)}
              sub={errorCount > 0 ? `${errorCount} errored` : 'all clear'}
              tone={alertCount > 0 ? 'red' : 'green'}
            />
          </div>
          <Panel title="ACTIVITY" sub="LAST 60 MIN" className="home-activity-panel">
            <SessionTimelineB1 now={now} />
          </Panel>
        </div>
      </section>

      {/* ── Row 3 · Agents ───────────────────────────────────── */}
      <Panel
        title="AGENTS"
        sub="7 AVAILABLE · CARDS DESIGNATE BINARY + CTX"
        className="home-agents-panel"
      >
        <AgentChipStripB1 />
      </Panel>

      {/* ── Row 4 · Projects + Cost ─────────────────────────── */}
      <section className="home-projects-row">
        {hasProjects ? (
          <Panel
            title="PROJECTS"
            sub={`${pinned.length} PINNED · ${projects.length} TOTAL`}
            className="home-projects-panel"
            action={
              <button
                type="button"
                className="home-inline-btn"
                onClick={openWizard}
                title="New project (Ctrl+N)"
              >
                + NEW
              </button>
            }
          >
            {pinned.length === 0 ? (
              <div className="home-projects-empty">
                Pin a project for quick access. Right-click any card in the Projects tab.
              </div>
            ) : (
              <div className="home-project-grid">
                {pinned.map((p) => (
                  <ProjectCardB1
                    key={p.id}
                    project={p}
                    onOpen={() => onOpenProject(p)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCardMenu({ x: e.clientX, y: e.clientY, projectId: p.id })
                    }}
                  />
                ))}
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="GET STARTED" sub="NEW TO AGENTDECK" className="home-projects-panel">
            <div className="home-welcome">
              <div className="home-welcome__step">
                <div className="home-welcome__num">01</div>
                <div>
                  <div className="home-welcome__title">Pick a folder</div>
                  <div className="home-welcome__desc">Point AgentDeck at a WSL project path</div>
                </div>
              </div>
              <div className="home-welcome__step">
                <div className="home-welcome__num">02</div>
                <div>
                  <div className="home-welcome__title">Choose an agent</div>
                  <div className="home-welcome__desc">
                    7 agents supported — install via the Agents tab
                  </div>
                </div>
              </div>
              <div className="home-welcome__step">
                <div className="home-welcome__num">03</div>
                <div>
                  <div className="home-welcome__title">Launch a session</div>
                  <div className="home-welcome__desc">Ctrl+K → New Session, or press ▸ above</div>
                </div>
              </div>
              <button
                type="button"
                className="home-cta home-cta--primary home-welcome__cta"
                onClick={openWizard}
              >
                ▸ CREATE PROJECT
              </button>
            </div>
          </Panel>
        )}

        <Panel title="COST / WK" sub="7-DAY ROLLUP" className="home-cost-panel">
          <CostReadoutB1 />
        </Panel>
      </section>

      {/* Context menu (Launch with …) */}
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
                top: Math.min(cardMenu.y, window.innerHeight - 240),
                left: Math.min(cardMenu.x, window.innerWidth - 220),
              }}
              role="menu"
            >
              <div className="home-context-header">Launch with…</div>
              {projectAgents.map((ac) => {
                const agentMeta = AGENT_META_MAP.get(ac.agent)
                return (
                  <button
                    key={ac.agent}
                    type="button"
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
