/**
 * Local-time ISO date key (YYYY-MM-DD) for a given epoch timestamp.
 * Matches how `useMidnight` computes the day boundary, so cost history
 * entries align with the user's perception of "today" rather than UTC.
 */
export function isoKeyFromTs(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's local-time ISO date key. Matches the `DailyCostEntry.date` format. */
export function todayIsoKey(): string {
  return isoKeyFromTs(Date.now())
}
