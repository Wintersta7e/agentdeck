import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useAppStore } from '../../store/appStore'
import { getDefaultAgent } from '../../../shared/agent-helpers'
import { PaneTopbar } from './PaneTopbar'
import { TerminalPane } from '../Terminal/TerminalPane'
import type { PaneLayout } from '../../../shared/types'
import './SplitView.css'

const PANE_INDICES = [0, 1, 2] as const
const MIN_PANE_WIDTH = 200

/** Static style object hoisted to module scope to avoid allocating on every render */
const STYLE_DISPLAY_CONTENTS: React.CSSProperties = { display: 'contents' }

export function SplitView(): React.JSX.Element {
  const paneLayout = useAppStore((s) => s.paneLayout)
  const focusedPane = useAppStore((s) => s.focusedPane)
  const paneSessions = useAppStore((s) => s.paneSessions)
  // Narrow selector: only re-render when session IDs, projectIds, status, or agent overrides change
  const sessions = useStoreWithEqualityFn(
    useAppStore,
    (s) => {
      const result: Record<
        string,
        {
          id: string
          projectId: string
          status: string
          agentOverride?: string | undefined
          agentFlagsOverride?: string | undefined
        }
      > = {}
      for (const [id, session] of Object.entries(s.sessions)) {
        result[id] = {
          id: session.id,
          projectId: session.projectId,
          status: session.status,
          agentOverride: session.agentOverride,
          agentFlagsOverride: session.agentFlagsOverride,
        }
      }
      return result
    },
    (a, b) => {
      const aKeys = Object.keys(a)
      const bKeys = Object.keys(b)
      if (aKeys.length !== bKeys.length) return false
      for (const key of aKeys) {
        if (a[key]?.projectId !== b[key]?.projectId) return false
        if (a[key]?.status !== b[key]?.status) return false
        if (a[key]?.agentOverride !== b[key]?.agentOverride) return false
        if (a[key]?.agentFlagsOverride !== b[key]?.agentFlagsOverride) return false
      }
      return true
    },
  )
  const projects = useAppStore((s) => s.projects)
  const projectMap = useMemo(() => {
    const m = new Map<string, (typeof projects)[number]>()
    for (const p of projects) m.set(p.id, p)
    return m
  }, [projects])
  const setPaneLayout = useAppStore((s) => s.setPaneLayout)
  const setFocusedPane = useAppStore((s) => s.setFocusedPane)

  const [draggingDivider, setDraggingDivider] = useState<number | null>(null)

  const paneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const splitAreaRef = useRef<HTMLDivElement>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  // Clean up drag listeners if component unmounts mid-drag
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

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

    setDraggingDivider(dividerIndex)
    const startX = e.clientX
    const startLeftWidth = leftPane.getBoundingClientRect().width
    const startRightWidth = rightPane.getBoundingClientRect().width

    const savedCursor = document.body.style.cursor
    const savedUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let rafId = 0
    let latestDelta = 0

    function applyResize(): void {
      rafId = 0
      let newLeftWidth = startLeftWidth + latestDelta
      let newRightWidth = startRightWidth - latestDelta

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

    function onMouseMove(moveEvent: MouseEvent): void {
      latestDelta = moveEvent.clientX - startX
      if (!rafId) {
        rafId = requestAnimationFrame(applyResize)
      }
    }

    function onMouseUp(): void {
      if (rafId) cancelAnimationFrame(rafId)
      setDraggingDivider(null)
      dragCleanupRef.current = null
      document.body.style.cursor = savedCursor
      document.body.style.userSelect = savedUserSelect
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)

      // Trigger fit on all visible panes after drag ends
      window.dispatchEvent(new CustomEvent('agentdeck:pane-resize-end'))
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    dragCleanupRef.current = () => {
      if (rafId) cancelAnimationFrame(rafId)
      document.body.style.cursor = savedCursor
      document.body.style.userSelect = savedUserSelect
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Memoize per-project env and startupCommands so inline objects are stable across renders
  const envMap = useMemo(() => {
    const map: Record<string, Record<string, string> | undefined> = {}
    for (const p of projects) {
      map[p.id] =
        p.envVars && p.envVars.length > 0
          ? Object.fromEntries(p.envVars.map((v) => [v.key, v.value]))
          : undefined
    }
    return map
  }, [projects])

  const startupCommandsMap = useMemo(() => {
    const map: Record<string, string[] | undefined> = {}
    for (const p of projects) {
      map[p.id] = p.startupCommands?.map((c) => c.value)
    }
    return map
  }, [projects])

  // Determine which sessions are assigned to pane slots
  const paneSessionIds = PANE_INDICES.map((i) => paneSessions[i] ?? '')

  // Find all session IDs that are NOT assigned to any visible pane slot
  // Exclude exited sessions that were closed (preserved for cost/timeline only)
  const visiblePaneSessionIds = new Set(
    paneSessionIds.slice(0, paneLayout).filter((id) => id !== ''),
  )
  const paneSet = new Set(paneSessions.filter(Boolean))
  const allSessionIds = Object.keys(sessions).filter((sid) => {
    const s = sessions[sid]
    // Keep running/starting sessions, and exited sessions only if still in a pane
    return s && (s.status !== 'exited' || paneSet.has(sid))
  })
  const hiddenSessionIds = allSessionIds.filter((sid) => !visiblePaneSessionIds.has(sid))

  return (
    <div className="split-area" ref={splitAreaRef}>
      {/* Render pane slots */}
      {PANE_INDICES.map((paneIndex) => {
        const sessionId = paneSessionIds[paneIndex] ?? ''
        const session = sessionId ? sessions[sessionId] : undefined
        const project = session ? projectMap.get(session.projectId) : undefined
        const defaultAgent = project ? getDefaultAgent(project) : undefined
        const isVisible = paneIndex < paneLayout
        const isFocused = paneIndex === focusedPane && isVisible

        return (
          <div key={`pane-group-${String(paneIndex)}`} style={STYLE_DISPLAY_CONTENTS}>
            {/* Divider before pane (except pane 0) */}
            {paneIndex > 0 && (
              <div
                className={`split-divider${isVisible ? '' : ' split-pane--hidden'}${draggingDivider === paneIndex - 1 ? ' split-divider--active' : ''}`}
                onMouseDown={(e) => handleDividerMouseDown(paneIndex - 1, e)}
              />
            )}
            {/* Pane */}
            <div
              ref={(el) => {
                paneRefs.current[paneIndex] = el
              }}
              className={`split-pane ${isVisible ? 'split-pane--visible' : 'split-pane--hidden'}${isFocused ? ' focused' : ''}`}
              onClick={() => setFocusedPane(paneIndex)}
            >
              <div className="split-pane-inner">
                {session ? (
                  <>
                    <PaneTopbar sessionId={sessionId} focused={isFocused} />
                    <TerminalPane
                      key={sessionId}
                      sessionId={sessionId}
                      focused={isFocused}
                      visible={isVisible}
                      projectPath={project?.path}
                      startupCommands={project ? startupCommandsMap[project.id] : undefined}
                      env={project ? envMap[project.id] : undefined}
                      agent={session.agentOverride ?? defaultAgent?.agent}
                      agentFlags={session.agentFlagsOverride ?? defaultAgent?.agentFlags}
                      scrollback={project?.scrollbackLines}
                    />
                  </>
                ) : (
                  <div className="split-pane-placeholder">
                    No session &mdash; open a project to start
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Render hidden sessions (not in any visible pane) to keep them alive */}
      {hiddenSessionIds.map((sid) => {
        const session = sessions[sid]
        if (!session) return null
        const project = projectMap.get(session.projectId)
        const defaultAgent = project ? getDefaultAgent(project) : undefined
        return (
          <div key={sid} className="split-pane--hidden">
            <TerminalPane
              sessionId={sid}
              focused={false}
              visible={false}
              projectPath={project?.path}
              startupCommands={project ? startupCommandsMap[project.id] : undefined}
              env={project ? envMap[project.id] : undefined}
              agent={session.agentOverride ?? defaultAgent?.agent}
              agentFlags={session.agentFlagsOverride ?? defaultAgent?.agentFlags}
              scrollback={project?.scrollbackLines}
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
