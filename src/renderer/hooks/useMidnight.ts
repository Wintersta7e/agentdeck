import { useState, useEffect } from 'react'

function getMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Compute the next local midnight by incrementing the calendar date rather
 * than adding 86,400,000 ms. Handles DST transitions correctly — spring-
 * forward days are 23h, fall-back days are 25h.
 */
function getNextMidnight(midnight: number): number {
  const d = new Date(midnight)
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Returns today's midnight timestamp (ms). Automatically recomputes at day rollover. */
export function useMidnight(): number {
  const [midnight, setMidnight] = useState(getMidnight)
  useEffect(() => {
    const nextMidnight = getNextMidnight(midnight)
    const ms = Math.max(0, nextMidnight - Date.now())
    const id = setTimeout(() => setMidnight(getMidnight()), ms)
    return () => clearTimeout(id)
  }, [midnight])
  return midnight
}
