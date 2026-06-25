import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import { validateDays } from '../validation'
import type { UsageHistory } from '../usage-history'

export function registerUsageHandlers(usageHistory: UsageHistory): void {
  ipcMain.handle(CH.usageGetHistory, (_, days: number) => {
    validateDays(days)
    return usageHistory.getHistory(days)
  })
}
