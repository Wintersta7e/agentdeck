import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

type FocusedPanel = 'sidebar' | 'terminal' | 'right-panel' | 'none'

export interface AmbientState {
  activeSessionCount: number
  focusedPanel: FocusedPanel
  isIdle: boolean
  veinSpeed: number
}

function detectFocusedPanel(): FocusedPanel {
  const active = document.activeElement
  if (!active) return 'none'
  if (active.closest('.sidebar')) return 'sidebar'
  if (active.closest('.split-pane') || active.closest('.xterm')) return 'terminal'
  if (active.closest('.right-panel')) return 'right-panel'
  return 'none'
}

export function useAmbientState(): AmbientState {
  // Narrow selector: only re-render when the running-session count changes
  const activeSessionCount = useAppStore(
    (s) => Object.values(s.sessions).filter((sess) => sess.status === 'running').length,
  )

  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>('none')

  useEffect(() => {
    const handler = (): void => setFocusedPanel(detectFocusedPanel())
    document.addEventListener('focusin', handler)
    document.addEventListener('focusout', handler)
    return () => {
      document.removeEventListener('focusin', handler)
      document.removeEventListener('focusout', handler)
    }
  }, [])

  const derived = useMemo(() => {
    let veinSpeed: number
    if (activeSessionCount === 0) veinSpeed = 0.3
    else if (activeSessionCount === 1) veinSpeed = 0.6
    else veinSpeed = 0.85

    return { activeSessionCount, veinSpeed }
  }, [activeSessionCount])

  const isIdle = derived.activeSessionCount === 0 && focusedPanel !== 'terminal'

  return { ...derived, focusedPanel, isIdle }
}
