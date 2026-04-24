import { useAppStore } from '../../store/appStore'
import { AGENT_BY_ID } from '../../utils/agent-ui'
import type { AgentType } from '../../../shared/types'
import './ConfigTab.css'

/**
 * Session configuration snapshot: agent, project, worktree, flags.
 * Read-only — changes still happen via Project Settings / New Session.
 */
export function ConfigTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined))
  const project = useAppStore((s) =>
    session?.projectId ? s.projects.find((p) => p.id === session.projectId) : undefined,
  )
  const worktree = useAppStore((s) =>
    activeSessionId ? s.worktreePaths[activeSessionId] : undefined,
  )
  const openProjectSettings = useAppStore((s) => s.openSettings)

  if (!activeSessionId || !session) {
    return <div className="ri-tab__empty">Open a session to see its config.</div>
  }

  const agentId = (session.agentOverride ?? 'claude-code') as AgentType
  const agent = AGENT_BY_ID.get(agentId)

  const rows: Array<{ label: string; value: string; kind?: 'mono' | 'accent' }> = [
    { label: 'Session ID', value: session.id.slice(-12), kind: 'mono' },
    { label: 'Agent', value: agent?.name ?? agentId, kind: 'accent' },
    { label: 'Binary', value: agent?.binary ?? '—', kind: 'mono' },
    { label: 'Agent flags', value: session.agentFlagsOverride ?? '(defaults)', kind: 'mono' },
    { label: 'Project', value: project?.name ?? (session.projectId || 'ad-hoc') },
    { label: 'Project path', value: project?.path ?? '—', kind: 'mono' },
    {
      label: 'Worktree',
      value: worktree?.isolated ? `isolated · ${worktree.path}` : (worktree?.path ?? 'primary'),
      kind: 'mono',
    },
    {
      label: 'Branch',
      value: worktree?.branch ?? 'main',
      kind: 'accent',
    },
    {
      label: 'Started',
      value: new Date(session.startedAt).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      kind: 'mono',
    },
  ]

  return (
    <div className="ri-config">
      <dl className="ri-config__list">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd
              className={
                row.kind === 'mono'
                  ? 'ri-config__val ri-config__val--mono'
                  : row.kind === 'accent'
                    ? 'ri-config__val ri-config__val--accent'
                    : 'ri-config__val'
              }
              title={row.value}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {project && (
        <button
          type="button"
          className="ri-config__cta"
          onClick={() => openProjectSettings(project.id)}
        >
          Open project settings →
        </button>
      )}
    </div>
  )
}
