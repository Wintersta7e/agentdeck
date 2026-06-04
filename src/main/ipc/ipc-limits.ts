import { ipcMain } from 'electron'
import { CH } from '../../shared/ipc-channels'
import { readCodexLimits } from '../codex-limits'

export function registerLimitsHandlers(): void {
  ipcMain.handle(CH.limitsGetCodex, () => readCodexLimits())
}
