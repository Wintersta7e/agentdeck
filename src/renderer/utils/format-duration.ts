/** Format a millisecond duration as "Xm" (under 1h) or "Xh Ym". */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}
