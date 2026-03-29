import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'

export interface NotificationsSlice {
  notifications: Array<{
    id: string
    type: 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  }>
  addNotification: (type: 'error' | 'warning' | 'info', message: string) => void
  dismissNotification: (id: string) => void
}

export const createNotificationsSlice: StateCreator<AppState, [], [], NotificationsSlice> = (
  set,
) => ({
  notifications: [],

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
      ].slice(-10),
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
})
