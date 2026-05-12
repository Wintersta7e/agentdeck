import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import { createLogger } from './logger'

const log = createLogger('wsl-runtime')

export async function resolveWslHome(): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        'wsl.exe',
        ['--', 'bash', '-lc', 'echo $HOME'],
        { timeout: 5000, encoding: 'utf-8' },
        (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout.trim())
        },
      )
    })
  } catch (err) {
    log.warn('Could not resolve WSL $HOME - worktree isolation disabled', {
      err: String(err),
    })
    return null
  }
}

export function publishWslAvailability(mainWindow: BrowserWindow): void {
  execFile('wsl.exe', ['--status'], { timeout: 10_000 }, (err) => {
    if (err) {
      log.warn('WSL2 not detected', { err: String(err) })
      mainWindow.webContents.send('wsl:status', { available: false, error: String(err) })
    } else {
      log.info('WSL2 detected')
      mainWindow.webContents.send('wsl:status', { available: true })
    }
  })
}
