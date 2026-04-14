/** ISO date key (YYYY-MM-DD) for a given epoch timestamp. */
export function isoKeyFromTs(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Today's ISO date key. Matches the `DailyCostEntry.date` format. */
export function todayIsoKey(): string {
  return isoKeyFromTs(Date.now())
}
