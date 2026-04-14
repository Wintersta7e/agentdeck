import { useCallback, useSyncExternalStore } from 'react'

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

// Shared 1-second ticker so every mounted useElapsedTime updates in lockstep
// and we only run one setInterval for the whole UI instead of one per card.
const tickSubscribers = new Set<() => void>()
let tickTimer: ReturnType<typeof setInterval> | null = null

function startTickerIfNeeded(): void {
  if (tickTimer !== null) return
  tickTimer = setInterval(() => {
    for (const fn of tickSubscribers) fn()
  }, 1000)
}

function subscribeToTick(cb: () => void): () => void {
  tickSubscribers.add(cb)
  startTickerIfNeeded()
  return () => {
    tickSubscribers.delete(cb)
    if (tickSubscribers.size === 0 && tickTimer !== null) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }
}

/** Returns a ticking "Xm Ys" or "Xh Ym" string from a start timestamp. */
export function useElapsedTime(startedAt: number | undefined): string {
  // Stabilize the subscribe reference so parent re-renders don't cause
  // useSyncExternalStore to tear down and restart the tick subscription.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!startedAt) return (): void => {}
      return subscribeToTick(onStoreChange)
    },
    [startedAt],
  )
  const getSnapshot = useCallback(() => (startedAt ? formatElapsed(startedAt) : '0s'), [startedAt])
  return useSyncExternalStore(subscribe, getSnapshot)
}
