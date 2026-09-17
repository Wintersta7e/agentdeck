import { execFile } from 'child_process'
import { createLogger } from './logger'
import { errText } from '../shared/errors'
import { bashCommand, directCommand, hostPlatform, type HostCommand } from './host'

const log = createLogger('wsl-utils')

// Generic fallback when wsl.exe detection fails. 'Ubuntu' (without version suffix)
// is the most common default WSL distro name and works for Ubuntu 20.04, 22.04, 24.04.
// Users on Debian, Arch, Fedora etc. will see a warning in the log.
const FALLBACK_DISTRO = 'Ubuntu'

/**
 * Convert a Windows path to the path agents see: C:\foo → /mnt/c/foo,
 * \\wsl$\D\x → /x. Identity when agents run natively, where the path is
 * already correct and a backslash is a legal filename character.
 */
export function toWslPath(p: string): string {
  if (hostPlatform() === 'native') return p
  const normalized = p.replace(/\\/g, '/')
  const driveMatch = /^([A-Za-z]):\/?(.*)$/.exec(normalized)
  if (driveMatch?.[1]) {
    const rest = driveMatch[2] ?? ''
    return rest
      ? `/mnt/${driveMatch[1].toLowerCase()}/${rest}`
      : `/mnt/${driveMatch[1].toLowerCase()}`
  }
  // UNC WSL path: //wsl$/Distro/home/user/... or //wsl.localhost/Distro/...
  const uncMatch = /^\/\/(?:wsl\$|wsl\.localhost)\/[^/]+\/?(.*)$/.exec(normalized)
  if (uncMatch) {
    return `/${uncMatch[1] ?? ''}`
  }
  return normalized
}

/**
 * Resolve the WSL default user's name. Races three detection commands in
 * parallel — on a cold WSL boot, sequential attempts can stall ~45s total.
 * Returns '' when none succeed.
 */
export async function resolveWslUsername(): Promise<string> {
  const tryCmd = ({ file, args }: HostCommand): Promise<string> =>
    new Promise((resolve) => {
      execFile(file, args, { timeout: 10000 }, (err, stdout) => {
        const out = stdout.trim()
        resolve(err || !out ? '' : out)
      })
    })

  // Race all approaches — first non-empty result wins.
  const results = await Promise.all([
    tryCmd(bashCommand('whoami')),
    tryCmd(directCommand('whoami', [])),
    tryCmd(bashCommand('echo $USER')),
  ])
  const result = results.find((r) => r !== '') ?? ''
  if (!result) log.warn('Failed to detect WSL username')
  return result
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
  const mntMatch = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(wslPath)
  if (mntMatch?.[1] && mntMatch[2] !== undefined) {
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
 * Resolve a project path (WSL or Windows) to a Windows-accessible path. Windows
 * drive-letter paths (e.g. `C:\…`) are already usable and returned as-is; WSL
 * paths are converted via `wslPathToWindows`. Pass `distro` when it's already
 * resolved to skip the async detection.
 */
export async function resolveToWindowsPath(projectPath: string, distro?: string): Promise<string> {
  if (/^[A-Za-z]:/.test(projectPath)) return projectPath
  const d = distro ?? (await getDefaultDistroAsync())
  return wslPathToWindows(projectPath, d)
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
            err: errText(err),
          })
          cachedDistro = FALLBACK_DISTRO
          resolve(cachedDistro)
          return
        }
        const cleaned = stdout.replace(/\0/g, '').replace(/\ufeff/g, '')
        const first = cleaned
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l !== '')
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

/**
 * Extract the gateway IP from `ip route show default` output, e.g.
 * "default via 172.21.240.1 dev eth0 proto kernel". Returns null if absent.
 */
export function parseDefaultGateway(routeOutput: string): string | null {
  for (const line of routeOutput.split('\n')) {
    const m = /^\s*default\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(line)
    if (m?.[1]) return m[1]
  }
  return null
}

/** Token replaced at spawn with the Windows host IP in custom-agent env / args / startup. */
export const WINDOWS_HOST_TOKEN = '{{WINDOWS_HOST}}'

/** Replace every {{WINDOWS_HOST}} occurrence in `text` with `hostIp`. */
export function substituteWindowsHost(text: string, hostIp: string): string {
  return text.split(WINDOWS_HOST_TOKEN).join(hostIp)
}

/**
 * The Windows host as seen from inside WSL is the WSL default gateway — in NAT
 * networking a Windows-side service is reached at this IP, not at localhost.
 * Resolved via `wsl.exe -- ip route show default` and cached. Returns null on failure.
 *
 * The gateway IP can change across a WSL restart; the cache refreshes only on app
 * restart, which is the dominant case (app + WSL boot together).
 */
let cachedWindowsHostIp: string | null = null
export function getWindowsHostIp(): Promise<string | null> {
  if (cachedWindowsHostIp) return Promise.resolve(cachedWindowsHostIp)
  return new Promise<string | null>((resolve) => {
    execFile(
      'wsl.exe',
      ['--', 'ip', 'route', 'show', 'default'],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          log.warn('Failed to resolve Windows host IP (WSL default gateway)', {
            err: errText(err),
          })
          resolve(null)
          return
        }
        const ip = parseDefaultGateway(typeof stdout === 'string' ? stdout : '')
        if (!ip) {
          log.warn('Could not parse WSL default gateway from `ip route` output')
          resolve(null)
          return
        }
        cachedWindowsHostIp = ip
        resolve(ip)
      },
    )
  })
}

/**
 * Synchronous accessor for the last-resolved Windows host IP (null until warmed).
 * The spawn path is synchronous, so it reads this; warm the cache at startup with
 * `getWindowsHostIp()`.
 */
export function peekWindowsHostIp(): string | null {
  return cachedWindowsHostIp
}
