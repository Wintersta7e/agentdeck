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
      const notification: ConfirmNotification = {
        id,
        kind: 'confirm',
        title: payload.title,
        options: payload.options,
        resolve: (value) => {
          set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
          resolve(value)
        },
      }
      set((s) => ({ notifications: [...s.notifications, notification] }))
    })
  },

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
