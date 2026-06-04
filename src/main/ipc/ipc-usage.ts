import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import type { UsageHistory } from '../usage-history'

export function registerUsageHandlers(usageHistory: UsageHistory): void {
  ipcMain.handle(CH.usageGetHistory, (_, days: number) => {
    if (typeof days !== 'number' || days < 1 || days > 365)
      throw new Error('Invalid days parameter')
    return usageHistory.getHistory(days)
  })
}
