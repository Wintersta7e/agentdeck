import { memo } from 'react'
import { useAppStore } from '../../store/appStore'
import { AGENT_BY_ID, agentColorVar } from '../../utils/agent-ui'
import { getActionButtons } from '../../selectors/session-actions'
import { rerunSession } from '../../utils/rerun-session'
import type { Session } from '../../../shared/types'
import './SessionHeader.css'

function statusWord(s: Session): string {
  if (s.approvalState === 'kept') return 'KEPT'
  if (s.approvalState === 'discarded') return 'DISCARDED'
  if (s.approvalState === 'review') return 'REVIEW'
  if (s.status === 'running') return 'LIVE'
  if (s.status === 'starting') return 'STARTING'
  if (s.status === 'error') return 'ERROR'
  return 'IDLE'
}

export const SessionHeader = memo(function SessionHeader(): React.JSX.Element | null {
  const session = useAppStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  )
  const project = useAppStore((s) =>
    session ? s.projects.find((p) => p.id === session.projectId) : undefined,
  )
  const gitStatus = useAppStore((s) => (session ? s.gitStatuses[session.projectId] : undefined))
  const setApprovalState = useAppStore((s) => s.setApprovalState)

  if (!session || !project) return null

  const agentId = session.agentOverride ?? project.agent ?? 'claude-code'
  const agent = AGENT_BY_ID.get(agentId)
  const buttons = getActionButtons(session)
  const dirtyCount = gitStatus
    ? gitStatus.staged + gitStatus.unstaged + gitStatus.untracked
    : undefined

  const handle = (id: 'keep' | 'discard' | 'rerun'): void => {
    if (id === 'keep') setApprovalState(session.id, 'kept')
    else if (id === 'discard') setApprovalState(session.id, 'discarded')
    else if (id === 'rerun') rerunSession(session)
  }

  return (
    <div
      className="session-header"
      style={{ ['--agent-accent' as never]: `var(${agentColorVar(agentId)})` }}
    >
      <span className="session-header__glyph" aria-hidden>
        {agent?.icon ?? '●'}
      </span>
      <span className="session-header__agent">{agent?.name ?? 'agent'}</span>
      <span className="session-header__divider" aria-hidden />
      <span className="session-header__project">{project.name}</span>
      <span className="session-header__path">{project.path}</span>
      {gitStatus?.branch ? (
        <span className="session-header__branch">
          ⎇ {gitStatus.branch}
          {dirtyCount !== undefined && dirtyCount > 0 && (
            <span className="session-header__dirty"> · {dirtyCount}</span>
          )}
        </span>
      ) : session.initialBranch ? (
        <span className="session-header__branch">
          ⎇ {session.initialBranch}
          <span className="session-header__dirty"> · …</span>
        </span>
      ) : null}
      <span className="session-header__spacer" />
      <span className={`session-header__dot session-header__dot--${session.status}`} aria-hidden />
      <span className="session-header__state">{statusWord(session)}</span>
      <div className="session-header__actions">
        {buttons.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`session-header__btn session-header__btn--${b.tone}`}
            onClick={() => handle(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
})
