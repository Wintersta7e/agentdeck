import { useSyncExternalStore } from 'react'

function formatElapsed(startedAt: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${String(remSecs).padStart(2, '0')}s`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${String(remMins).padStart(2, '0')}m`
}

/** Returns a ticking "Xm Ys" or "Xh Ym" string from a start timestamp. */
export function useElapsedTime(startedAt: number | undefined): string {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!startedAt) return (): void => {}
      const id = setInterval(onStoreChange, 1000)
      return (): void => clearInterval(id)
    },
    () => (startedAt ? formatElapsed(startedAt) : '0s'),
  )
}
