import { useEffect } from 'react'

/**
 * Run `load` once on mount and then every `intervalMs`. `load` receives an
 * `isActive()` token that returns false once the effect is torn down, so a
 * stale or in-flight poll can skip its state update. `load` must be stable
 * (wrap it in useCallback) — it is an effect dependency.
 */
export function usePollEffect(
  load: (isActive: () => boolean) => void | Promise<void>,
  intervalMs: number,
): void {
  useEffect(() => {
    let cancelled = false
    const isActive = (): boolean => !cancelled
    void load(isActive)
    const id = setInterval(() => void load(isActive), intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [load, intervalMs])
}
