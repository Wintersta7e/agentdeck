import { CH } from '../shared/ipc-channels'
import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import { createLogger } from './logger'
import { wslTry } from './wsl-exec'

const log = createLogger('wsl-runtime')

export async function resolveWslHome(): Promise<string | null> {
  const stdout = await wslTry('echo $HOME', { timeout: 5000, logLevelOnError: 'warn' })
  return stdout?.trim() ?? null
}

export function publishWslAvailability(mainWindow: BrowserWindow): void {
  execFile('wsl.exe', ['--status'], { timeout: 10_000 }, (err) => {
    if (err) {
      log.warn('WSL2 not detected', { err: String(err) })
      mainWindow.webContents.send(CH.wslStatus, { available: false, error: String(err) })
    } else {
      log.info('WSL2 detected')
      mainWindow.webContents.send(CH.wslStatus, { available: true })
    }
  })
}
