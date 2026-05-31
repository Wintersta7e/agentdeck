import { execFile } from 'child_process'
import { createLogger } from './logger'

const log = createLogger('wsl-utils')

// Generic fallback when wsl.exe detection fails. 'Ubuntu' (without version suffix)
// is the most common default WSL distro name and works for Ubuntu 20.04, 22.04, 24.04.
// Users on Debian, Arch, Fedora etc. will see a warning in the log.
const FALLBACK_DISTRO = 'Ubuntu'

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
    // wsl.exe inherits HOME from the launching Windows process (Electron is
    // started with HOME=%USERPROFILE%), so $HOME points at the Windows profile
    // (/mnt/c/Users/...) instead of the Linux home. Reset it to the user's real
    // passwd home FIRST so ~/.nvm, ~/.local/bin, and agent configs (~/.codex,
    // ~/.claude) all resolve correctly — otherwise nvm-installed CLIs like codex
    // are never found (exit 127) and agents read the wrong config.
    '{ [ -n "$LOGNAME" ] && [ -d "/home/$LOGNAME" ] && export HOME="/home/$LOGNAME"; } || { for __h in /home/*; do [ -d "$__h/.nvm" ] && { export HOME="$__h"; break; }; done; }',
    // NVM_DIR is also inherited from the Windows HOME, so reset it before sourcing
    // nvm.sh; nvm.sh then activates the default node and puts its bin (node, and
    // npm-global CLIs like codex) on PATH. Keep this simple — NO globs / case / $():
    // complex inline shell gets mangled by the Windows -> wsl.exe transport (the
    // agent prompt hit the same wall, which is why it now goes over stdin).
    'export NVM_DIR="$HOME/.nvm"',
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null',
    'command -v nvm >/dev/null 2>&1 && nvm use default --silent >/dev/null 2>&1',
    '[ -d "$HOME/.npm-global/bin" ] && export PATH="$HOME/.npm-global/bin:$PATH"',
    'command -v fnm >/dev/null 2>&1 && eval "$(fnm env --shell bash)" 2>/dev/null',
    '[ -d "$HOME/.volta/bin" ] && export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" 2>/dev/null',
    // Native CLI installers (e.g. Claude Code) live in ~/.local/bin. Prepend it
    // LAST so a native agent wins over a stale npm-global copy that a node
    // version manager may have shadowed onto PATH — otherwise version checks and
    // agent runs resolve the wrong (older) binary.
    '[ -d "$HOME/.local/bin" ] && export PATH="$HOME/.local/bin:$PATH"',
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

/**
 * Try a filesystem operation with UNC path fallback.
 * `\\wsl.localhost\` (Win11 22H2+) is tried first; on failure, retries
 * with `\\wsl$\` (Win10/older). Consolidates the fallback pattern that
 * was previously duplicated across detect-stack.ts and ipc-projects.ts.
 */
export async function withUncFallback<T>(
  windowsPath: string,
  operation: (path: string) => Promise<T>,
): Promise<T> {
  try {
    return await operation(windowsPath)
  } catch (err) {
    if (windowsPath.startsWith('\\\\wsl.localhost\\')) {
      const fallback = windowsPath.replace('\\\\wsl.localhost\\', '\\\\wsl$\\')
      return operation(fallback)
    }
    throw err
  }
}

/** Cached distro name — populated by async detection */
let cachedDistro: string | null = null

/** Async distro detection — never blocks the main thread */
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
        if (!first) {
          log.warn('Could not detect WSL distro, falling back to ' + FALLBACK_DISTRO)
        }
        cachedDistro = first ?? FALLBACK_DISTRO
        log.debug(`Async resolved WSL distro: ${cachedDistro}`)
        resolve(cachedDistro)
      },
    )
  })
}
