import { memo } from 'react'
import { Plus, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { closeSession } from '../../utils/session-close'
import type { Session, Project } from '../../../shared/types'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import './SessionTabs.css'

function shortBranch(branch?: string): string {
  if (!branch) return ''
  return branch.replace(/^(feat|fix|chore|refactor|docs|test)\//, '')
}

function statusTone(s: Session): string {
  if (s.approvalState === 'kept' || s.approvalState === 'discarded') return 'done'
  if (s.approvalState === 'review') return 'review'
  if (s.status === 'running') return 'running'
  if (s.status === 'error') return 'error'
  if (s.status === 'starting') return 'starting'
  return 'idle'
}

export const SessionTabs = memo(function SessionTabs(): React.JSX.Element {
  const openSessionIds = useAppStore((s) => s.openSessionIds)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const projects = useAppStore((s) => s.projects)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const openNewSessionComposer = useAppStore((s) => s.openNewSessionComposer)

  const projectById = new Map<string, Project>(projects.map((p) => [p.id, p]))

  return (
    <div className="session-tabs" role="tablist">
      {openSessionIds.map((id) => {
        const session = sessions[id]
        if (!session) return null
        const project = projectById.get(session.projectId)
        const agentId = session.agentOverride ?? project?.agent ?? 'claude-code'
        const agent = AGENT_BY_ID.get(agentId)
        const tone = statusTone(session)
        const isActive = activeSessionId === id
        const label = project?.name ?? 'Unknown'
        return (
          <div
            key={id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            className={`session-tab session-tab--${tone}${isActive ? ' is-active' : ''}`}
            onClick={() => setActiveSession(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveSession(id)
              }
            }}
            style={{ ['--agent-accent' as never]: `var(${agentColorVar(agentId)})` }}
          >
            <span className="session-tab__glyph" aria-hidden>
              {agent?.icon ?? '●'}
            </span>
            <span className="session-tab__name">{label}</span>
            {session.initialBranch && (
              <span className="session-tab__branch">⎇ {shortBranch(session.initialBranch)}</span>
            )}
            <span className={`session-tab__dot session-tab__dot--${tone}`} aria-hidden />
            <button
              type="button"
              className="session-tab__close"
              aria-label={`Close session ${label}`}
              onClick={(e) => {
                e.stopPropagation()
                void closeSession(id)
              }}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="session-tabs__add"
        aria-label="New session"
        onClick={() => openNewSessionComposer()}
      >
        <Plus size={12} />
      </button>
      <div className="session-tabs__spacer" />
      <div className="session-tabs__counter">{openSessionIds.length} OPEN</div>
    </div>
  )
})
