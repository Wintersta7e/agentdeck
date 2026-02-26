import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { PaneTopbar } from './PaneTopbar'
import { TerminalPane } from '../Terminal/TerminalPane'
import { InputBar } from '../InputBar/InputBar'
import type { PaneLayout } from '../../../shared/types'
import './SplitView.css'

const PANE_INDICES = [0, 1, 2] as const
const MIN_PANE_WIDTH = 200

export function SplitView(): React.JSX.Element {
  const paneLayout = useAppStore((s) => s.paneLayout)
  const focusedPane = useAppStore((s) => s.focusedPane)
  const paneSessions = useAppStore((s) => s.paneSessions)
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  const setPaneLayout = useAppStore((s) => s.setPaneLayout)
  const setFocusedPane = useAppStore((s) => s.setFocusedPane)

  const paneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const splitAreaRef = useRef<HTMLDivElement>(null)

  // Reset pane widths to flex:1 when layout changes or window resizes
  useEffect(() => {
    function resetPaneWidths(): void {
      for (const paneEl of paneRefs.current) {
        if (paneEl) {
          paneEl.style.flex = '1'
          paneEl.style.width = ''
        }
      }
    }
    resetPaneWidths()
    window.addEventListener('resize', resetPaneWidths)
    return () => window.removeEventListener('resize', resetPaneWidths)
  }, [paneLayout])

  const handleDividerMouseDown = useCallback((dividerIndex: number, e: React.MouseEvent) => {
    e.preventDefault()

    const leftIndex = dividerIndex
    const rightIndex = dividerIndex + 1
    const leftPane = paneRefs.current[leftIndex]
    const rightPane = paneRefs.current[rightIndex]

    if (!leftPane || !rightPane) return

    const startX = e.clientX
    const startLeftWidth = leftPane.getBoundingClientRect().width
    const startRightWidth = rightPane.getBoundingClientRect().width

    const savedCursor = document.body.style.cursor
    const savedUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(moveEvent: MouseEvent): void {
      const delta = moveEvent.clientX - startX
      let newLeftWidth = startLeftWidth + delta
      let newRightWidth = startRightWidth - delta

      // Clamp to minimum width
      if (newLeftWidth < MIN_PANE_WIDTH) {
        newLeftWidth = MIN_PANE_WIDTH
        newRightWidth = startLeftWidth + startRightWidth - MIN_PANE_WIDTH
      }
      if (newRightWidth < MIN_PANE_WIDTH) {
        newRightWidth = MIN_PANE_WIDTH
        newLeftWidth = startLeftWidth + startRightWidth - MIN_PANE_WIDTH
      }

      if (leftPane) {
        leftPane.style.flex = 'none'
        leftPane.style.width = `${newLeftWidth}px`
      }
      if (rightPane) {
        rightPane.style.flex = 'none'
        rightPane.style.width = `${newRightWidth}px`
      }
    }

    function onMouseUp(): void {
      document.body.style.cursor = savedCursor
      document.body.style.userSelect = savedUserSelect
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Determine which sessions are assigned to pane slots
  const paneSessionIds = PANE_INDICES.map((i) => paneSessions[i] ?? '')

  // Find all session IDs that are NOT assigned to any visible pane slot
  const visiblePaneSessionIds = new Set(
    paneSessionIds.slice(0, paneLayout).filter((id) => id !== ''),
  )
  const allSessionIds = Object.keys(sessions)
  const hiddenSessionIds = allSessionIds.filter((sid) => !visiblePaneSessionIds.has(sid))

  return (
    <div className="split-area" ref={splitAreaRef}>
      {/* Render pane slots */}
      {PANE_INDICES.map((paneIndex) => {
        const sessionId = paneSessionIds[paneIndex] ?? ''
        const session = sessionId ? sessions[sessionId] : undefined
        const project = session ? projects.find((p) => p.id === session.projectId) : undefined
        const isVisible = paneIndex < paneLayout
        const isFocused = paneIndex === focusedPane && isVisible

        return (
          <div key={`pane-group-${String(paneIndex)}`} style={{ display: 'contents' }}>
            {/* Divider before pane (except pane 0) */}
            {paneIndex > 0 && (
              <div
                className="split-divider"
                style={{ display: isVisible ? 'block' : 'none' }}
                onMouseDown={(e) => handleDividerMouseDown(paneIndex - 1, e)}
              />
            )}
            {/* Pane */}
            <div
              ref={(el) => {
                paneRefs.current[paneIndex] = el
              }}
              className={`split-pane${isFocused ? ' focused' : ''}`}
              style={{
                display: isVisible ? 'flex' : 'none',
                flex: 1,
              }}
              onClick={() => setFocusedPane(paneIndex)}
            >
              <div className="pane-focus-indicator" />
              {session ? (
                <>
                  <PaneTopbar sessionId={sessionId} focused={isFocused} />
                  <TerminalPane
                    sessionId={sessionId}
                    projectPath={project?.path}
                    startupCommands={project?.startupCommands?.map((c) => c.value)}
                    env={
                      project?.envVars && project.envVars.length > 0
                        ? Object.fromEntries(project.envVars.map((v) => [v.key, v.value]))
                        : undefined
                    }
                    agent={project?.agent ?? undefined}
                    agentFlags={project?.agentFlags ?? undefined}
                  />
                  <InputBar
                    sessionId={sessionId}
                    focused={isFocused}
                    projectId={session.projectId}
                  />
                </>
              ) : (
                <div className="split-pane-placeholder">
                  No session &mdash; open a project to start
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Render hidden sessions (not in any visible pane) to keep them alive */}
      {hiddenSessionIds.map((sid) => {
        const session = sessions[sid]
        if (!session) return null
        const project = projects.find((p) => p.id === session.projectId)
        return (
          <div key={sid} style={{ display: 'none' }}>
            <TerminalPane
              sessionId={sid}
              projectPath={project?.path}
              startupCommands={project?.startupCommands?.map((c) => c.value)}
              env={
                project?.envVars && project.envVars.length > 0
                  ? Object.fromEntries(project.envVars.map((v) => [v.key, v.value]))
                  : undefined
              }
              agent={project?.agent ?? undefined}
              agentFlags={project?.agentFlags ?? undefined}
            />
          </div>
        )
      })}

      {/* Layout controls */}
      <div className="layout-controls">
        {([1, 2, 3] as PaneLayout[]).map((n) => (
          <button
            key={n}
            className={`lc-btn${paneLayout === n ? ' active' : ''}`}
            onClick={() => setPaneLayout(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
