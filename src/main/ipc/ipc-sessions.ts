import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import { validateDays } from '../validation'
import type { SessionHistory } from '../session-history'

export function registerSessionHistoryHandlers(history: SessionHistory): void {
  ipcMain.handle(CH.sessionsGetHistory, (_, days: number) => {
    validateDays(days)
    return history.getHistory(days)
  })
}
