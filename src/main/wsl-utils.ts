import { execFileSync, execFile } from 'child_process'
import { createLogger } from './logger'

const log = createLogger('wsl-utils')

const FALLBACK_DISTRO = 'Ubuntu-24.04'

/** Convert a Windows path to WSL: C:\foo → /mnt/c/foo, \\wsl$\D\x → /x */
export function toWslPath(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  const driveMatch = normalized.match(/^([A-Za-z]):\/?(.*)$/)
  if (driveMatch && driveMatch[1]) {
    const rest = driveMatch[2] ?? ''
    return rest
      ? `/mnt/${driveMatch[1].toLowerCase()}/${rest}`
      : `/mnt/${driveMatch[1].toLowerCase()}`
  }
  // UNC WSL path: //wsl$/Distro/home/user/... or //wsl.localhost/Distro/...
  const uncMatch = normalized.match(/^\/\/(?:wsl\$|wsl\.localhost)\/[^/]+\/?(.*)$/)
  if (uncMatch) {
    return `/${uncMatch[1] ?? ''}`
  }
  return normalized
}

/**
 * Prefix sourced before every WSL command in bash -lc (non-interactive).
 * Login shells don't source .bashrc, so nvm/fnm/volta aren't on PATH.
 * This explicitly initialises the most common node version managers.
 */
export const NODE_INIT =
  [
    '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null',
    'type fnm &>/dev/null && eval "$(fnm env --shell bash)" 2>/dev/null',
    'true',
  ].join('; ') + '; '

export function wslPathToWindows(wslPath: string, distro = FALLBACK_DISTRO): string {
  // /mnt/X/... paths map directly to Windows drives — no UNC needed
  const mntMatch = wslPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/)
  if (mntMatch && mntMatch[1] && mntMatch[2] !== undefined) {
    const drive = mntMatch[1].toUpperCase()
    const rest = mntMatch[2].replace(/\//g, '\\')
    return `${drive}:\\${rest}`
  }
  // Other WSL paths (e.g. /home/...) → \\wsl.localhost\distro\path
  if (!/^[A-Za-z0-9_. -]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`)
  }
  return `\\\\wsl.localhost\\${distro}${wslPath.replace(/\//g, '\\')}`
}

/** Cached distro name — populated by either sync or async detection */
let cachedDistro: string | null = null

/** Sync version — used by call sites that can't be async (e.g. IPC handlers returning sync) */
export function getDefaultDistro(): string {
  if (cachedDistro) return cachedDistro
  try {
    const output = execFileSync('wsl.exe', ['-l', '--quiet'], { encoding: 'utf16le' })
    const cleaned = output.replace(/\0/g, '').replace(/\ufeff/g, '')
    const first = cleaned
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0]
    if (!first) {
      log.warn('wsl.exe returned no distros, falling back to ' + FALLBACK_DISTRO)
    } else {
      log.debug(`Resolved WSL distro: ${first}`, { raw: cleaned })
    }
    cachedDistro = first ?? FALLBACK_DISTRO
    return cachedDistro
  } catch (err) {
    log.error('Failed to detect WSL distro, falling back to ' + FALLBACK_DISTRO, {
      err: String(err),
    })
    cachedDistro = FALLBACK_DISTRO
    return cachedDistro
  }
}

/** Async version — preferred at app startup to avoid blocking the main thread */
export function getDefaultDistroAsync(): Promise<string> {
  if (cachedDistro) return Promise.resolve(cachedDistro)
  return new Promise<string>((resolve) => {
    execFile(
      'wsl.exe',
      ['-l', '--quiet'],
      { encoding: 'utf16le', timeout: 10000 },
      (err, stdout) => {
        if (err) {
          log.error('Async distro detection failed, falling back to ' + FALLBACK_DISTRO, {
            err: String(err),
          })
          cachedDistro = FALLBACK_DISTRO
          resolve(cachedDistro)
          return
        }
        const cleaned = stdout.replace(/\0/g, '').replace(/\ufeff/g, '')
        const first = cleaned
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)[0]
        cachedDistro = first ?? FALLBACK_DISTRO
        log.debug(`Async resolved WSL distro: ${cachedDistro}`)
        resolve(cachedDistro)
      },
    )
  })
}
