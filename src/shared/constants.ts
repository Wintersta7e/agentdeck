/** Maximum number of terminal panes in the split view */
export const MAX_PANE_COUNT = 3

/** Maximum activity events stored per session feed */
export const ACTIVITY_FEED_CAP = 500

/** Hidden terminal buffer: flush when exceeding this size */
export const HIDDEN_BUFFER_HIGH_WATER = 5000

/** Hidden terminal buffer: trim to this size on flush */
export const HIDDEN_BUFFER_TRIM_TARGET = 4000

/** Assumed duration of a single activity event for timeline rendering (ms) */
export const TIMELINE_EVENT_DURATION_MS = 30_000

/** Minimum session span for timeline segment width computation (ms) */
export const TIMELINE_MIN_SPAN_MS = 60_000

/** Cost history refresh interval while the home screen is visible (ms) */
export const COST_REFRESH_INTERVAL_MS = 30_000

/** Default terminal font size (px) */
export const TERMINAL_DEFAULT_FONT_SIZE = 12

/** Terminal font family — must be a string literal for xterm.js API */
export const TERMINAL_FONT_FAMILY = "'JetBrains Mono', monospace"

/** Milliseconds per minute — for timeout conversions */
export const MS_PER_MINUTE = 60_000

/** Cap on how many exited sessions we retain for home-screen history. */
export const MAX_EXITED_SESSIONS = 20

/** Agent-env snapshot cache TTL (ms) */
export const SNAPSHOT_CACHE_TTL_MS = 30_000
