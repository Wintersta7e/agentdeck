/** Today's ISO date key (YYYY-MM-DD). Matches the `DailyCostEntry.date` format. */
export function todayIsoKey(): string {
  return new Date().toISOString().slice(0, 10)
}
