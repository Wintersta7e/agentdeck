import { useRecentWorkflowRuns } from '../../hooks/useRecentWorkflowRuns'
import './RecentWorkflows.css'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function RecentWorkflows(): React.JSX.Element {
  const runs = useRecentWorkflowRuns(3)

  return (
    <div className="recent-workflows-panel">
      <div className="panel-header">{'\u25B6'} Recent Workflows</div>
      {runs.length === 0 ? (
        <div className="panel-empty">No workflow runs yet</div>
      ) : (
        runs.map((r) => (
          <div key={r.id} className="wf-run-item">
            <div className="wf-run-dot" />
            <span className="wf-run-name">{r.workflowName}</span>
            <span
              className={`wf-run-badge ${r.status === 'done' ? 'pass' : r.status === 'error' ? 'fail' : 'other'}`}
            >
              {r.status === 'done' ? '\u2713' : r.status === 'error' ? '\u2717' : '\u23F8'}
            </span>
            <span className="wf-run-time">{timeAgo(r.startedAt)}</span>
          </div>
        ))
      )}
    </div>
  )
}
