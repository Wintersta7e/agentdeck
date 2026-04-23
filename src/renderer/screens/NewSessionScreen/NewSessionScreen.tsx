import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENTS } from '../../../shared/agents'
import { ScreenShell } from '../../components/shared/ScreenShell'
import { AGENT_BY_ID, agentColorVar, agentShort } from '../../utils/agent-ui'
import { useEffectiveContext, badgeLabelFor } from '../../hooks/useEffectiveContext'
import type { AgentType, SessionLaunchConfig, Template } from '../../../shared/types'
import './NewSessionScreen.css'

type Mode = 'watch' | 'auto' | 'plan-first'
type ApproveKey = 'reads' | 'writes' | 'commands' | 'commits'

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface ComposerSectionProps {
  eyebrow: string
  title: string
  sub?: string
  children: React.ReactNode
}

function Section({ eyebrow, title, sub, children }: ComposerSectionProps): React.JSX.Element {
  return (
    <section className="ns-section">
      <header className="ns-section__head">
        <span className="ns-section__eyebrow">{eyebrow}</span>
        <span className="ns-section__title">{title}</span>
        {sub && <span className="ns-section__sub">{sub}</span>}
      </header>
      <div className="ns-section__body">{children}</div>
    </section>
  )
}

export function NewSessionScreen(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const templates = useAppStore((s) => s.templates)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const addSession = useAppStore((s) => s.addSession)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const openWizard = useAppStore((s) => s.openWizard)

  // Seed state from the most-recent project + its default agent (if any).
  const defaultProjectId = useMemo(() => {
    const sorted = [...projects].sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0))
    return sorted[0]?.id ?? ''
  }, [projects])

  const [projectId, setProjectId] = useState(defaultProjectId)
  const [agentId, setAgentId] = useState<AgentType>('claude-code')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [branch, setBranch] = useState('main')
  const [branchMode, setBranchMode] = useState<'existing' | 'new' | 'worktree'>('existing')
  const [costCap, setCostCap] = useState(4)
  const [mode, setMode] = useState<Mode>('watch')
  const [approve, setApprove] = useState<Record<ApproveKey, boolean>>({
    reads: true,
    writes: true,
    commands: false,
    commits: false,
  })
  const [contextFiles, setContextFiles] = useState<string[]>([])

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? projects[0],
    [projects, projectId],
  )
  const agent = AGENT_BY_ID.get(agentId)
  const colorVar = agentColorVar(agentId)
  const ctxResolved = useEffectiveContext(agentId)

  const approvedCount = Object.values(approve).filter(Boolean).length
  const tokenEstimate = useMemo(
    () => Math.max(0, Math.ceil(prompt.length / 4)) + contextFiles.length * 1200,
    [prompt.length, contextFiles.length],
  )
  const perStepCost = Math.max(0.01, (tokenEstimate / 1000) * 0.01)

  const handlePickTemplate = useCallback(
    (t: Template) => {
      const next = templateId === t.id ? null : t.id
      setTemplateId(next)
      if (next) setPrompt(t.content || t.description || '')
    },
    [templateId],
  )

  const handleLaunch = useCallback(() => {
    if (!project) return
    const trimmedPrompt = prompt.trim()
    const trimmedBranch = branch.trim()
    const overrides: SessionLaunchConfig = {
      agentOverride: agentId,
      initialPrompt: trimmedPrompt.length > 0 ? trimmedPrompt : undefined,
      branchMode,
      initialBranch: trimmedBranch.length > 0 ? trimmedBranch : undefined,
      costCap: costCap > 0 ? costCap : undefined,
      runMode: mode,
      approve,
    }
    const sessionId = `session-${project.id}-${Date.now()}`
    addSession(sessionId, project.id, overrides)
    setActiveSession(sessionId)
    setCurrentView('session')
  }, [
    project,
    agentId,
    prompt,
    branch,
    branchMode,
    costCap,
    mode,
    approve,
    addSession,
    setActiveSession,
    setCurrentView,
  ])

  return (
    <ScreenShell
      eyebrow="Compose"
      title="New session"
      sub="Pick an agent, point it at a project, give it a task. Interject anytime while it runs."
      className="new-session-screen"
    >
      <div className="ns-grid">
        <div className="ns-composer">
          <Section
            eyebrow="01"
            title="Template"
            sub={`${templates.length} available · optional starting point`}
          >
            {templates.length === 0 ? (
              <div className="ns-empty">
                No templates yet. Save prompts from any session to reuse them here.
              </div>
            ) : (
              <div className="ns-template-grid">
                {templates.slice(0, 8).map((t) => {
                  const active = t.id === templateId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`ns-template${active ? ' is-active' : ''}`}
                      onClick={() => handlePickTemplate(t)}
                    >
                      <div className="ns-template__cat">{t.category ?? 'TEMPLATE'}</div>
                      <div className="ns-template__name">{t.name}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </Section>

          <Section eyebrow="02" title="Prompt" sub="what should the agent do?">
            <div className="ns-prompt">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Add jittered exponential backoff to the WebSocket reconnect path. Start from src/ws/reconnect.rs. Run the failing test and iterate until it passes."
                className="ns-prompt__input"
                rows={8}
              />
              <div className="ns-prompt__meta">
                <span>
                  {prompt.length} chars · ~{Math.ceil(prompt.length / 4)} tokens
                </span>
                <span className="ns-prompt__chips">
                  <button type="button" className="ns-chip">
                    @ file
                  </button>
                  <button type="button" className="ns-chip">
                    # symbol
                  </button>
                  <button type="button" className="ns-chip">
                    ~ output
                  </button>
                </span>
              </div>
            </div>
          </Section>

          <Section
            eyebrow="03"
            title="Context"
            sub={`${contextFiles.length} attached · ~${formatTokens(contextFiles.length * 1200)} tokens`}
          >
            <div className="ns-context">
              {contextFiles.length === 0 ? (
                <div className="ns-context__empty">
                  Attach files, folders, symbols, git diffs, or command output to ground the agent.
                  Skip to use the full project tree by default.
                </div>
              ) : (
                <ul className="ns-context__list">
                  {contextFiles.map((f) => (
                    <li key={f} className="ns-context__item">
                      <span className="ns-context__glyph">◆</span>
                      <span className="ns-context__name">{f}</span>
                      <span className="ns-context__size">~1.2k tok</span>
                      <button
                        type="button"
                        className="ns-context__remove"
                        onClick={() => setContextFiles((prev) => prev.filter((x) => x !== f))}
                        aria-label={`Remove ${f}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="ns-context__add">
                <button type="button" className="ns-chip">
                  + FILE
                </button>
                <button type="button" className="ns-chip">
                  + FOLDER
                </button>
                <button type="button" className="ns-chip">
                  + SYMBOL
                </button>
                <button type="button" className="ns-chip">
                  + GIT DIFF
                </button>
                <button type="button" className="ns-chip">
                  + COMMAND OUTPUT
                </button>
                <button type="button" className="ns-chip">
                  + URL
                </button>
              </div>
            </div>
          </Section>

          <Section eyebrow="04" title="Advanced" sub="optional controls">
            <div className="ns-advanced">
              <div className="ns-field">
                <div className="ns-field__label">COST CAP</div>
                <div className="ns-field__row">
                  <input
                    type="range"
                    min={0.5}
                    max={15}
                    step={0.5}
                    value={costCap}
                    onChange={(e) => setCostCap(Number(e.target.value))}
                    className="ns-slider"
                    aria-label="Cost cap"
                  />
                  <span className="ns-field__value">{formatCost(costCap)}</span>
                </div>
              </div>
              <div className="ns-field">
                <div className="ns-field__label">AUTO-APPROVE · {approvedCount}/4</div>
                <div className="ns-field__buttons">
                  {(['reads', 'writes', 'commands', 'commits'] as ApproveKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`ns-toggle${approve[k] ? ' is-on' : ''}`}
                      onClick={() => setApprove((prev) => ({ ...prev, [k]: !prev[k] }))}
                      aria-pressed={approve[k]}
                    >
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ns-field">
                <div className="ns-field__label">MODE</div>
                <div className="ns-field__buttons">
                  {(['watch', 'auto', 'plan-first'] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`ns-toggle${mode === m ? ' is-on' : ''}`}
                      onClick={() => setMode(m)}
                      aria-pressed={mode === m}
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>

        <aside className="ns-target">
          <header className="ns-target__head">LAUNCH TARGET</header>

          <section className="ns-target__block">
            <div className="ns-target__label">AGENT</div>
            {agent ? (
              <div
                className="ns-target__agent"
                style={{ ['--sel-color' as 'color']: `var(${colorVar})` }}
              >
                <span className="ns-target__agent-glyph" aria-hidden="true">
                  {agent.icon}
                </span>
                <div className="ns-target__agent-meta">
                  <div className="ns-target__agent-name">{agent.name}</div>
                  <div className="ns-target__agent-ctx">
                    ctx {formatTokens(ctxResolved.value ?? agent.contextWindow)}
                    {badgeLabelFor(ctxResolved.source, ctxResolved.modelId) !== null && (
                      <span className="ns-target__agent-ctx-badge">
                        {' '}
                        {badgeLabelFor(ctxResolved.source, ctxResolved.modelId)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="ns-target__agent-list">
              {AGENTS.map((a) => {
                const active = agentId === (a.id as AgentType)
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`ns-agent-pill${active ? ' is-active' : ''}`}
                    onClick={() => setAgentId(a.id as AgentType)}
                    style={{
                      ['--sel-color' as 'color']: `var(${agentColorVar(a.id)})`,
                    }}
                  >
                    <span className="ns-agent-pill__glyph" aria-hidden="true">
                      {a.icon}
                    </span>
                    <span className="ns-agent-pill__short">{agentShort(a.id)}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="ns-target__block">
            <div className="ns-target__label">PROJECT</div>
            {projects.length === 0 ? (
              <div className="ns-target__empty">
                No projects yet.{' '}
                <button type="button" className="ns-link" onClick={openWizard}>
                  Create one →
                </button>
              </div>
            ) : (
              <>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="ns-select"
                  aria-label="Project"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {project && <div className="ns-target__path">{project.path}</div>}
              </>
            )}
          </section>

          <section className="ns-target__block">
            <div className="ns-target__label">BRANCH</div>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="ns-input"
              aria-label="Branch"
            />
            <div className="ns-target__pills">
              <button
                type="button"
                className={`ns-chip${branchMode === 'existing' ? ' is-on' : ''}`}
                onClick={() => setBranchMode('existing')}
              >
                EXISTING
              </button>
              <button
                type="button"
                className={`ns-chip${branchMode === 'new' ? ' is-on' : ''}`}
                onClick={() => setBranchMode('new')}
              >
                NEW FROM MAIN
              </button>
              <button
                type="button"
                className={`ns-chip${branchMode === 'worktree' ? ' is-on' : ''}`}
                onClick={() => setBranchMode('worktree')}
              >
                WORKTREE
              </button>
            </div>
          </section>

          <section className="ns-target__block ns-target__estimate">
            <div className="ns-target__label">ESTIMATE</div>
            <div className="ns-estimate">
              <div>
                <div className="ns-estimate__caption">tokens in</div>
                <div className="ns-estimate__value">{formatTokens(tokenEstimate)}</div>
              </div>
              <div>
                <div className="ns-estimate__caption">cost / step</div>
                <div className="ns-estimate__value ns-estimate__value--cost">
                  {formatCost(perStepCost)}
                </div>
              </div>
            </div>
          </section>

          <footer className="ns-target__footer">
            <button
              type="button"
              className="ns-launch"
              disabled={!project || prompt.trim().length === 0}
              onClick={handleLaunch}
              style={{ ['--sel-color' as 'color']: `var(${colorVar})` }}
            >
              ▸ LAUNCH SESSION
            </button>
            <button type="button" className="ns-save" disabled>
              SAVE AS TEMPLATE
            </button>
            <div className="ns-target__hint">⏎ LAUNCH · ESC CANCEL</div>
          </footer>
        </aside>
      </div>
    </ScreenShell>
  )
}
