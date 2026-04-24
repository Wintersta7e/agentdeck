import { useCallback, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { ScreenShell } from '../../components/shared/ScreenShell'
import type { WorkflowMeta, WorkflowStatus } from '../../../shared/types'
import './WorkflowsScreen.css'

function statusTone(status: WorkflowStatus | undefined): string {
  if (!status || status === 'idle') return 'idle'
  if (status === 'running') return 'running'
  if (status === 'done') return 'done'
  if (status === 'error') return 'error'
  if (status === 'stopped') return 'stopped'
  return 'idle'
}

function statusLabel(status: WorkflowStatus | undefined): string {
  return (status ?? 'idle').toUpperCase()
}

function formatAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function WorkflowsScreen(): React.JSX.Element {
  const workflows = useAppStore((s) => s.workflows)
  const workflowStatuses = useAppStore((s) => s.workflowStatuses)
  const openWorkflow = useAppStore((s) => s.openWorkflow)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const handleOpen = useCallback(
    (wf: WorkflowMeta) => {
      openWorkflow(wf.id)
      setCurrentView('workflow')
    },
    [openWorkflow, setCurrentView],
  )

  const sorted: WorkflowMeta[] = useMemo(
    () => [...workflows].sort((a, b) => b.updatedAt - a.updatedAt),
    [workflows],
  )

  return (
    <ScreenShell
      eyebrow="Automations"
      title="Workflows"
      sub="Multi-step agent + shell pipelines. Click a card to open the editor."
      className="workflows-screen"
    >
      {sorted.length === 0 ? (
        <div className="workflows-screen__empty" role="status">
          <div className="workflows-screen__empty-icon" aria-hidden="true">
            ⌬
          </div>
          <div className="workflows-screen__empty-title">No workflows yet</div>
          <div className="workflows-screen__empty-sub">
            Seed templates ship with AgentDeck. Open the command palette (Ctrl+K) and type
            &ldquo;workflow&rdquo; to get started.
          </div>
        </div>
      ) : (
        <div className="workflows-grid">
          {sorted.map((wf) => {
            const status = workflowStatuses[wf.id]
            const tone = statusTone(status)
            return (
              <button
                key={wf.id}
                type="button"
                className={`workflow-card workflow-card--${tone}`}
                onClick={() => handleOpen(wf)}
                title={`Open ${wf.name}`}
              >
                <div className="workflow-card__head">
                  <span className="workflow-card__name">{wf.name}</span>
                  <span className={`workflow-card__status workflow-card__status--${tone}`}>
                    {statusLabel(status)}
                  </span>
                </div>
                {wf.description && <p className="workflow-card__desc">{wf.description}</p>}
                <div className="workflow-card__meta">
                  <span className="workflow-card__nodes">{wf.nodeCount} nodes</span>
                  <span className="workflow-card__updated">Updated {formatAgo(wf.updatedAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </ScreenShell>
  )
}
