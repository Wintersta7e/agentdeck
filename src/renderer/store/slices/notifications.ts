import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'

export interface NotificationsSlice {
  notifications: Array<{
    id: string
    type: 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  }>
  /**
   * IDs of notifications the toast rail has already shown and auto-dismissed.
   * Alerts tab ignores this; toast rail filters by it so the same alert
   * doesn't re-surface, but the user can still read it in the Alerts tab.
   */
  silencedToastIds: string[]
  addNotification: (type: 'error' | 'warning' | 'info', message: string) => void
  dismissNotification: (id: string) => void
  silenceToast: (id: string) => void
}

const MAX_NOTIFICATIONS = 50

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (
  set,
) => ({
  notifications: [],
  silencedToastIds: [],

  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          message,
          timestamp: Date.now(),
        },
      ].slice(-MAX_NOTIFICATIONS),
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      silencedToastIds: state.silencedToastIds.filter((x) => x !== id),
    })),

  silenceToast: (id) =>
    set((state) =>
      state.silencedToastIds.includes(id)
        ? state
        : { silencedToastIds: [...state.silencedToastIds, id].slice(-MAX_NOTIFICATIONS) },
    ),
})
