/** Local clock as "HH:MM" (24-hour). */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Three-letter uppercase weekday, e.g. "MON". */
export function formatWeekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase().slice(0, 3)
}
