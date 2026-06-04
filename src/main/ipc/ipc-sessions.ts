import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import type { SessionHistory } from '../session-history'

export function registerSessionHistoryHandlers(history: SessionHistory): void {
  ipcMain.handle(CH.sessionsGetHistory, (_, days: number) => {
    if (typeof days !== 'number' || days < 1 || days > 365)
      throw new Error('Invalid days parameter')
    return history.getHistory(days)
  })
}
