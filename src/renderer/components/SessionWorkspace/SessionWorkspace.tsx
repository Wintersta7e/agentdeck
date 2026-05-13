import { useMemo, useRef } from 'react'
import { SessionHero } from '../SessionHero/SessionHero'
import { SplitView } from '../SplitView/SplitView'
import { RightPanel } from '../RightPanel/RightPanel'
import { PanelDivider } from '../shared/PanelDivider'
import { useAppStore } from '../../store/appStore'

export function SessionWorkspace(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth)
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  const rightPanelStyle = useMemo<React.CSSProperties>(
    () => ({ width: rightPanelWidth, flexShrink: 0 }),
    [rightPanelWidth],
  )

  const isVisible = currentView === 'sessions' && Boolean(activeSessionId)

  return (
    <div className={`view-panel ${isVisible ? 'view-panel--visible' : 'view-panel--hidden'}`}>
      <SessionHero>
        <SplitView />
        {rightPanelOpen && (
          <>
            <PanelDivider
              side="right"
              panelRef={rightPanelRef}
              minWidth={180}
              maxWidth={500}
              onResizeEnd={setRightPanelWidth}
            />
            <div ref={rightPanelRef} style={rightPanelStyle}>
              <RightPanel />
            </div>
          </>
        )}
      </SessionHero>
    </div>
  )
}
