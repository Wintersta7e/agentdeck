import { GitBranch } from 'lucide-react'
import type { GitStatus } from '../../../shared/types'

interface GitStatusRowProps {
  status: GitStatus
}

export function GitStatusRow({ status }: GitStatusRowProps): React.JSX.Element {
  const uncommitted = status.staged + status.unstaged + status.untracked
  return (
    <div className="git-status-row">
      <span className="git-branch">
        <GitBranch size={10} />
        {status.branch}
      </span>
      {(status.insertions > 0 || status.deletions > 0) && (
        <span className="git-diff-stats">
          {status.insertions > 0 && <span className="git-plus">+{status.insertions}</span>}
          {status.deletions > 0 && <span className="git-minus">-{status.deletions}</span>}
        </span>
      )}
      {uncommitted > 0 && <span className="git-uncommitted">{uncommitted} uncommitted</span>}
      {uncommitted === 0 && status.insertions === 0 && status.deletions === 0 && (
        <span className="git-clean">clean</span>
      )}
    </div>
  )
}
