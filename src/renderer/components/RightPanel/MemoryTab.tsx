import { useEffect, useReducer, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import './MemoryTab.css'

interface MemoryState {
  claudeMd: string | null
  agentsMd: string | null
  loading: boolean
}

type MemoryAction =
  | { type: 'start' }
  | { type: 'done'; claudeMd: string | null; agentsMd: string | null }

function memoryReducer(_state: MemoryState, action: MemoryAction): MemoryState {
  switch (action.type) {
    case 'start':
      return { claudeMd: null, agentsMd: null, loading: true }
    case 'done':
      return { claudeMd: action.claudeMd, agentsMd: action.agentsMd, loading: false }
  }
}

export function MemoryTab(): React.JSX.Element {
  // Granular selector — only re-render when the derived path actually changes
  const projectPath = useAppStore((s) => {
    const sid = s.activeSessionId
    if (!sid) return null
    const session = s.sessions[sid]
    if (!session) return null
    return s.projects.find((p) => p.id === session.projectId)?.path ?? null
  })
  const project = projectPath !== null

  const [state, dispatch] = useReducer(memoryReducer, {
    claudeMd: null,
    agentsMd: null,
    loading: true,
  })
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'start' })

    async function fetchFiles(): Promise<void> {
      if (!projectPath) {
        if (!cancelled) {
          dispatch({ type: 'done', claudeMd: null, agentsMd: null })
        }
        return
      }
      const [claude, agents] = await Promise.all([
        window.agentDeck.projects.readProjectFile(projectPath, 'CLAUDE.md'),
        window.agentDeck.projects.readProjectFile(projectPath, 'AGENTS.md'),
      ])
      if (!cancelled) {
        dispatch({ type: 'done', claudeMd: claude, agentsMd: agents })
      }
    }
    void fetchFiles()

    return () => {
      cancelled = true
    }
  }, [projectPath, refreshKey])

  function handleRefresh(): void {
    dispatch({ type: 'start' })
    setRefreshKey((k) => k + 1)
  }

  if (!project) {
    return <div className="panel-placeholder">No active session</div>
  }

  if (state.loading) {
    return <div className="panel-placeholder">Loading...</div>
  }

  return (
    <>
      <button className="memory-refresh-btn" onClick={handleRefresh}>
        Refresh
      </button>

      <div className="panel-section-header">CLAUDE.md</div>
      {state.claudeMd ? (
        <pre className="memory-file-content">{state.claudeMd}</pre>
      ) : (
        <div className="panel-placeholder">File not found</div>
      )}

      <div className="panel-section-header">AGENTS.md</div>
      {state.agentsMd ? (
        <pre className="memory-file-content">{state.agentsMd}</pre>
      ) : (
        <div className="panel-placeholder">File not found</div>
      )}
    </>
  )
}
