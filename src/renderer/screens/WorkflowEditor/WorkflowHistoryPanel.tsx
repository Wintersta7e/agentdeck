import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Trash2, ChevronRight } from 'lucide-react'
import type { WorkflowRun, WorkflowNodeRun } from '../../../shared/types'
import './WorkflowHistoryPanel.css'

interface WorkflowHistoryPanelProps {
  workflowId: string
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return '\u2014'
  if (ms < 1000) return '< 1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function statusClass(status: string): string {
  switch (status) {
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'stopped':
      return 'stopped'
    case 'skipped':
      return 'skipped'
    default:
      return 'idle'
  }
}

// ── Node detail row ─────────────────────────────────────────────────────────

function NodeRow({ node }: { node: WorkflowNodeRun }): React.JSX.Element {
  return (
    <div className="wf-history-node">
      <div className={`wf-history-node-dot ${statusClass(node.status)}`} />
      <span className="wf-history-node-name">{node.nodeName}</span>

      {node.branchTaken !== undefined && (
        <span className="wf-history-node-badge branch">
          {'\u2192'} {node.branchTaken}
        </span>
      )}

      {node.retryAttempts !== undefined && node.retryAttempts > 0 && (
        <span className="wf-history-node-badge retry">
          {node.retryAttempts} {node.retryAttempts === 1 ? 'retry' : 'retries'}
        </span>
      )}

      {node.loopIterations !== undefined && node.loopIterations > 0 && (
        <span className="wf-history-node-badge loop">
          {'\u00D7'}
          {node.loopIterations}
        </span>
      )}

      <span className="wf-history-node-duration">{formatDuration(node.durationMs)}</span>
    </div>
  )
}

// ── Single run card ─────────────────────────────────────────────────────────

function RunCard({
  run,
  expanded,
  onToggle,
  onDelete,
}: {
  run: WorkflowRun
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}): React.JSX.Element {
  const varCount = Object.keys(run.variables).length

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete()
    },
    [onDelete],
  )

  return (
    <div className="wf-history-run">
      <div className="wf-history-run-header" onClick={onToggle}>
        <div className={`wf-history-status-dot ${statusClass(run.status)}`} />
        <span className="wf-history-run-time">{formatTime(run.startedAt)}</span>
        <span className="wf-history-run-duration">{formatDuration(run.durationMs)}</span>
        {varCount > 0 && (
          <span className="wf-history-run-vars">
            {varCount} var{varCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="wf-history-run-spacer" />
        <span className={`wf-history-run-chevron${expanded ? ' expanded' : ''}`}>
          <ChevronRight />
        </span>
        <button
          className="wf-history-delete-btn"
          onClick={handleDelete}
          type="button"
          title="Delete run"
        >
          <Trash2 />
        </button>
      </div>

      {expanded && run.nodes.length > 0 && (
        <div className="wf-history-nodes">
          {run.nodes.map((node, idx) => (
            <div key={`${node.nodeId}-${idx}`}>
              <NodeRow node={node} />
              {node.status === 'error' &&
                node.errorTail !== undefined &&
                node.errorTail.length > 0 && (
                  <div className="wf-history-error-tail">{node.errorTail.join('\n')}</div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main panel component ────────────────────────────────────────────────────

export default function WorkflowHistoryPanel({
  workflowId,
}: WorkflowHistoryPanelProps): React.JSX.Element {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch runs from IPC — shared between initial load and refresh button
  const fetchRuns = useCallback(() => {
    setLoading(true)
    window.agentDeck.workflows
      .listRuns(workflowId)
      .then((result) => {
        setRuns(result)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('error', 'workflow-history', 'Failed to load runs', {
          err: String(err),
          workflowId,
        })
      })
      .finally(() => {
        setLoading(false)
      })
  }, [workflowId])

  // Initial load + reload when workflowId changes.
  // setState calls happen only inside async IPC callbacks (not synchronously in the effect body).
  useEffect(() => {
    let cancelled = false
    window.agentDeck.workflows
      .listRuns(workflowId)
      .then((result) => {
        if (!cancelled) setRuns(result)
      })
      .catch((err: unknown) => {
        window.agentDeck.log.send('error', 'workflow-history', 'Failed to load runs', {
          err: String(err),
          workflowId,
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workflowId])

  const handleToggle = useCallback((runId: string) => {
    setExpandedId((prev) => (prev === runId ? null : runId))
  }, [])

  const handleDelete = useCallback(
    (runId: string) => {
      window.agentDeck.workflows
        .deleteRun(runId)
        .then(() => {
          setRuns((prev) => prev.filter((r) => r.id !== runId))
          if (expandedId === runId) setExpandedId(null)
        })
        .catch((err: unknown) => {
          window.agentDeck.log.send('error', 'workflow-history', 'Failed to delete run', {
            err: String(err),
            runId,
          })
        })
    },
    [expandedId],
  )

  return (
    <div className="wf-history-panel">
      <div className="wf-history-toolbar">
        <span className="wf-history-toolbar-title">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </span>
        <button
          className="wf-history-refresh-btn"
          onClick={fetchRuns}
          type="button"
          title="Refresh run history"
        >
          <RefreshCw /> Refresh
        </button>
      </div>

      {!loading && runs.length === 0 && (
        <div className="wf-history-empty">
          <div className="wf-history-empty-title">No runs yet</div>
          <div className="wf-history-empty-desc">
            Run this workflow to see execution history here.
          </div>
        </div>
      )}

      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          expanded={expandedId === run.id}
          onToggle={() => handleToggle(run.id)}
          onDelete={() => handleDelete(run.id)}
        />
      ))}
    </div>
  )
}
