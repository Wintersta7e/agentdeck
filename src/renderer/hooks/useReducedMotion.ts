import { useState, useEffect } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      setReduced(e.matches)
    }
    mql.addEventListener('change', handler as EventListener)
    return () => mql.removeEventListener('change', handler as EventListener)
  }, [])

  return reduced
}
