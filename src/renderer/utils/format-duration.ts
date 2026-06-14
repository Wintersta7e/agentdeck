/** Format a millisecond duration as "Xm" (under 1h) or "Xh Ym". */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

/** Format a millisecond duration as "Xh YYm" — hours always shown, minutes zero-padded. */
export function formatDurationHm(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Seconds-resolution duration: "—" (null), "< 1s", "Xs", or "Xm Ys". */
export function formatDurationShort(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return '< 1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
