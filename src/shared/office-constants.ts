/** Idle thresholds shared between office registry and aggregator. */
export const IDLE_COFFEE_MS = 2 * 60 * 1000 // 2 min → idle-coffee
export const IDLE_WINDOW_MS = 5 * 60 * 1000 // 5 min → idle-window

/** Max label lengths for snapshot IPC payloads (SEC-04). */
export const MAX_PROJECT_NAME_LEN = 120
export const MAX_SESSION_LABEL_LEN = 160
