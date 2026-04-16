import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plus, FolderOpen, Bot, Terminal } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useGitStatusBatch } from '../../hooks/useGitStatus'
import { DailyDigest } from './DailyDigest'
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

// PERF-16: O(1) agent metadata lookup (replaces O(n) SHARED_AGENTS.find() in render)
const AGENT_META_MAP = new Map<string, (typeof SHARED_AGENTS)[number]>(
  SHARED_AGENTS.map((a) => [a.id, a]),
)

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

  // Granular session-derived selectors — return primitives so HomeScreen
  // doesn't re-render unless the actual count changes.
  const runningCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )
  const errorCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'error').length,
  )

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

  // Ambient glow class based on session health
  const glowClass =
    errorCount > 0
      ? 'home-glow-error'
      : runningCount > 0
        ? 'home-glow-healthy'
        : 'home-glow-neutral'

  // Click-outside handler for context menu
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

  // Read sessions on-invoke via getState() — no reactive subscription needed.
  // HomeScreen only needs sessions to resume the last one; subscribing to the
  // full sessions object would cause a full re-render on every session change.
  const handleResumeLast = useCallback(() => {
    const allSessions = Object.values(useAppStore.getState().sessions)
    // H13: Only resume running sessions — skip exited/errored ones
    const running = allSessions.filter((s) => s.status === 'running')
    if (running.length === 0) return
    const newest = running.sort((a, b) => b.startedAt - a.startedAt)[0]
    if (newest) {
      setActiveSession(newest.id)
      setCurrentView('session')
    }
  }, [setActiveSession, setCurrentView])

  return (
    <div className={`home-main ${glowClass}`}>
      {/* TIER 1 — Critical, always visible */}
      <div className="home-tier1">
        <div className="home-greeting-row">
          <div className="home-greeting-left">
            <div className="home-date">{formatDate()}</div>
            <h1 className="home-headline">
              {getGreeting()}, <span>{username || 'operator'}</span>.
            </h1>
            <div className="home-sub">
              {runningCount} running &middot; {projects.length} projects &middot; {templates.length}{' '}
              templates
            </div>
          </div>
          <DailyDigest />
        </div>

        <QuickActions
          onNewSession={() => openCommandPalette(undefined, 'all')}
          onRunWorkflow={() => openCommandPalette(undefined, 'workflow')}
          onFromTemplate={() => openCommandPalette(undefined, 'template')}
          onResumeLast={handleResumeLast}
          resumeDisabled={runningCount === 0}
        />

        <LiveSessionGrid />
      </div>

      {/* TIER 2 — Operational */}
      {hasProjects && (
        <div className="home-tier2">
          <div className="home-tier2-left">
            <div className="home-sec-head">
              <span className="home-sec-title">Projects</span>
              <button className="home-sec-action" onClick={openWizard} type="button">
                <Plus size={12} /> New
              </button>
            </div>
            <div className="home-project-scroll">
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
            </div>
          </div>
          <div className="home-tier2-right">
            <SuggestionsPanel />
            <ReviewQueue />
            <RecentWorkflows />
          </div>
        </div>
      )}

      {/* WELCOME STATE */}
      {!hasProjects && (
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

      {/* TIER 3 — Collapsible detail */}
      <SessionTimeline />
      <CostDashboard />
      <AgentStrip />

      {/* CONTEXT MENU */}
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
