import { useState, useEffect } from 'react'

function getMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Returns today's midnight timestamp (ms). Automatically recomputes at day rollover. */
export function useMidnight(): number {
  const [midnight, setMidnight] = useState(getMidnight)
  useEffect(() => {
    const nextMidnight = midnight + 86_400_000
    const ms = Math.max(0, nextMidnight - Date.now())
    const id = setTimeout(() => setMidnight(getMidnight()), ms)
    return () => clearTimeout(id)
  }, [midnight])
  return midnight
}
