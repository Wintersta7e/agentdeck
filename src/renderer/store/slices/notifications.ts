import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'

export interface ConfirmOption {
  id: string
  label: string
  tone?: 'primary' | 'danger' | 'neutral'
}

export interface BasicNotification {
  id: string
  kind: 'basic'
  type: 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

export interface ConfirmNotification {
  id: string
  kind: 'confirm'
  title: string
  options: ConfirmOption[]
  resolve: (value: string) => void
}

export type Notification = BasicNotification | ConfirmNotification

export interface NotificationsSlice {
  notifications: Notification[]
  /**
   * IDs of notifications the toast rail has already shown and auto-dismissed.
   * Alerts tab ignores this; toast rail filters by it so the same alert
   * doesn't re-surface, but the user can still read it in the Alerts tab.
   */
  silencedToastIds: string[]
  addNotification: (type: 'error' | 'warning' | 'info', message: string) => void
  addConfirmNotification: (payload: { title: string; options: ConfirmOption[] }) => Promise<string>
  dismissNotification: (id: string) => void
  silenceToast: (id: string) => void
}

const MAX_NOTIFICATIONS = 50

/**
 * Hard ceiling on how long a confirm prompt may wait for resolution before
 * auto-cancelling. Confirm-kind notifications are not currently rendered by
 * any UI; without this timeout, awaiting callers (e.g. closeSession via
 * promptDirtyWorktree) would block their inFlight guard forever.
 */
const CONFIRM_TIMEOUT_MS = 60_000

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (
  set,
) => ({
  notifications: [],
  silencedToastIds: [],

  addNotification: (type, message) =>
    set((state) => {
      const next: BasicNotification = {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'basic',
        type,
        message,
        timestamp: Date.now(),
      }
      return {
        notifications: [...state.notifications, next].slice(-MAX_NOTIFICATIONS),
      }
    }),

  addConfirmNotification: (payload) => {
    return new Promise((resolve) => {
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      let settled = false
      const settle = (value: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutHandle)
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
        resolve(value)
      }
      // Safety net: if no UI ever resolves this prompt (e.g. no renderer
      // mounts a confirm-dialog consumer), auto-resolve as 'cancel' after
      // CONFIRM_TIMEOUT_MS so callers like closeSession can't deadlock and
      // leak their inFlight guard forever.
      const timeoutHandle = setTimeout(() => {
        if (settled) return
        void window.agentDeck.log.send(
          'warn',
          'notifications',
          `confirm "${payload.title}" timed out after ${CONFIRM_TIMEOUT_MS}ms — resolving as cancel`,
        )
        settle('cancel')
      }, CONFIRM_TIMEOUT_MS)
      const notification: ConfirmNotification = {
        id,
        kind: 'confirm',
        title: payload.title,
        options: payload.options,
        resolve: settle,
      }
      set((s) => ({ notifications: [...s.notifications, notification].slice(-MAX_NOTIFICATIONS) }))
    })
  },

  dismissNotification: (id) =>
    set((state) => {
      const inNotifications = state.notifications.some((n) => n.id === id)
      const inSilenced = state.silencedToastIds.includes(id)
      if (!inNotifications && !inSilenced) return state
      return {
        notifications: inNotifications
          ? state.notifications.filter((n) => n.id !== id)
          : state.notifications,
        silencedToastIds: inSilenced
          ? state.silencedToastIds.filter((x) => x !== id)
          : state.silencedToastIds,
      }
    }),

  silenceToast: (id) =>
    set((state) =>
      state.silencedToastIds.includes(id)
        ? state
        : { silencedToastIds: [...state.silencedToastIds, id].slice(-MAX_NOTIFICATIONS) },
    ),
})
