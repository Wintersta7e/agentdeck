import { useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { ScreenShell } from '../../components/shared/ScreenShell'
import { KbdHint } from '../../components/shared/KbdHint'
import { WorkflowStarters } from './WorkflowStarters'
import { createBlankWorkflow } from '../../utils/workflowUtils'
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
  const setWorkflows = useAppStore((s) => s.setWorkflows)

  const handleOpen = useCallback(
    (wf: WorkflowMeta) => {
      openWorkflow(wf.id)
      setCurrentView('workflow')
    },
    [openWorkflow, setCurrentView],
  )

  const handleNew = useCallback(() => {
    void createBlankWorkflow(setWorkflows, openWorkflow)
  }, [setWorkflows, openWorkflow])

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
      actions={
        <button
          type="button"
          className="workflows-screen__new-btn"
          onClick={handleNew}
          title="Create a new blank workflow"
        >
          <Plus size={14} aria-hidden="true" /> NEW WORKFLOW
        </button>
      }
    >
      {sorted.length === 0 ? (
        <div className="workflows-screen__empty" role="status">
          <div className="workflows-screen__empty-icon" aria-hidden="true">
            ⌬
          </div>
          <div className="workflows-screen__empty-title">No workflows yet</div>
          <div className="workflows-screen__empty-sub">
            Pick a starter to spin up a workflow, or use the command palette (
            <KbdHint keys="Ctrl+K" />) and type &ldquo;workflow&rdquo; for more options.
          </div>
          <WorkflowStarters />
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
