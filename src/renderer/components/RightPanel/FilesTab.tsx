import { useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { FileTree } from './FileTree'
import './FilesTab.css'

/**
 * Filesystem tree of the active session's project (or its isolated worktree).
 * Lazy-loaded per directory; gitignore-filtered server-side; manually
 * refreshable (key-bumped to force a clean remount of the tree).
 */
export function FilesTab(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const session = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const project = useAppStore((s) =>
    session ? (s.projects.find((p) => p.id === session.projectId) ?? null) : null,
  )
  const worktree = useAppStore((s) =>
    activeSessionId ? (s.worktreePaths[activeSessionId] ?? null) : null,
  )

  const [generation, setGeneration] = useState(0)
  const refresh = useCallback(() => setGeneration((g) => g + 1), [])

  if (!activeSessionId || !session || !project) {
    return <div className="ri-tab__empty">No project — open a session to see its files.</div>
  }

  const isolated = worktree?.isolated === true
  const root = isolated && worktree ? worktree.path : project.path
  const label = isolated && worktree ? 'WORKTREE' : 'PROJECT'

  return (
    <div className="files-tab">
      <header className="files-tab__header">
        <span className="files-tab__label">{label}</span>
        <span className="files-tab__path" title={root}>
          {root}
        </span>
        <button
          type="button"
          aria-label="Refresh files"
          className="files-tab__refresh"
          onClick={refresh}
          title="Refresh"
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </header>
      <FileTree key={generation} projectPath={root} rootPath={root} />
    </div>
  )
}
