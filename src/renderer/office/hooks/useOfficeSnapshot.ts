import { useEffect } from 'react'
import { useOfficeStore } from '../store/officeStore'

export function useOfficeSnapshot(): void {
  useEffect(() => {
    const api = window.agentDeckOffice
    if (!api) return

    api.subscribe({
      onSnapshot: (snap) => useOfficeStore.getState().setSnapshot(snap),
      onTheme: (name) => useOfficeStore.getState().setTheme(name),
      onDisplayMetricsChanged: () => {
        // Canvas will re-measure on next frame
      },
    })

    return () => api.unsubscribe()
  }, [])
}
