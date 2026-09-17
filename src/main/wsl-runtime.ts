import { CH } from '../shared/ipc-channels'
import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import { createLogger } from './logger'
import { wslTry } from './wsl-exec'
import { hostPlatform } from './host'
import { errText } from '../shared/errors'

const log = createLogger('wsl-runtime')

export async function resolveWslHome(): Promise<string | null> {
  // First wsl.exe call after Windows boot can be slow (distro startup +
  // VM init); a single 5s shot occasionally times out. Retry a few times
  // with a small backoff so transient slowness doesn't kill worktree
  // isolation for the whole app session.
  const ATTEMPTS = 3
  const BACKOFF_MS = 2000
  for (let i = 0; i < ATTEMPTS; i++) {
    const level = i === ATTEMPTS - 1 ? 'warn' : 'debug'
    const stdout = await wslTry('echo $HOME', { timeout: 5000, logLevelOnError: level })
    const home = stdout?.trim()
    if (home) return home
    if (i < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, BACKOFF_MS))
  }
  return null
}

export function publishWslAvailability(mainWindow: BrowserWindow): void {
  // Natively the agents run on this machine, so there is no VM to probe and
  // `wsl --status` does not exist. Report available and stop.
  if (hostPlatform() === 'native') {
    log.info('Agents run locally — no WSL layer to check')
    mainWindow.webContents.send(CH.wslStatus, { available: true })
    return
  }
  execFile('wsl.exe', ['--status'], { timeout: 10_000 }, (err) => {
    if (err) {
      log.warn('WSL2 not detected', { err: errText(err) })
      mainWindow.webContents.send(CH.wslStatus, {
        available: false,
        error: errText(err),
      })
    } else {
      log.info('WSL2 detected')
      mainWindow.webContents.send(CH.wslStatus, { available: true })
    }
  })
}
