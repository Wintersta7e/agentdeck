import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { getDefaultDistroAsync, wslPathToWindows, withUncFallback } from './wsl-utils'
import { createLogger } from './logger'

const log = createLogger('wsl-paths')

const WSL_TIMEOUT_MS = 10_000

const homeCache = new Map<string, string>()
const claudeCfgCache = new Map<string, string>()
const codexHomeCache = new Map<string, string>()

function wslExec(cmd: string, distro: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['-d', distro, '--', 'bash', '-lc', cmd],
      { timeout: WSL_TIMEOUT_MS, encoding: 'utf-8' },
      (err, stdout) => {
        if (err) {
          log.debug('wslExec failed', { cmd: cmd.slice(0, 80), err: String(err) })
          resolve(null)
          return
        }
        resolve(stdout)
      },
    )
  })
}

export async function getWslHome(): Promise<string | null> {
  const distro = await getDefaultDistroAsync()
  const cached = homeCache.get(distro)
  if (cached) return cached
  const out = await wslExec('echo $HOME', distro)
  const trimmed = out?.trim()
  if (!trimmed) return null
  homeCache.set(distro, trimmed)
  return trimmed
}

export async function getClaudeConfigDir(): Promise<string | null> {
  const distro = await getDefaultDistroAsync()
  const cached = claudeCfgCache.get(distro)
  if (cached) return cached
  // eslint-disable-next-line no-template-curly-in-string -- bash variable expansion, not JS
  const explicit = await wslExec('echo "${CLAUDE_CONFIG_DIR:-}"', distro)
  const explicitTrim = explicit?.trim()
  if (explicitTrim) {
    claudeCfgCache.set(distro, explicitTrim)
    return explicitTrim
  }
  const home = await getWslHome()
  if (!home) return null
  const fallback = `${home}/.claude`
  claudeCfgCache.set(distro, fallback)
  return fallback
}

export async function getCodexHome(): Promise<string | null> {
  const distro = await getDefaultDistroAsync()
  const cached = codexHomeCache.get(distro)
  if (cached) return cached
  // eslint-disable-next-line no-template-curly-in-string -- bash variable expansion, not JS
  const explicit = await wslExec('echo "${CODEX_HOME:-}"', distro)
  const explicitTrim = explicit?.trim()
  if (explicitTrim) {
    codexHomeCache.set(distro, explicitTrim)
    return explicitTrim
  }
  const home = await getWslHome()
  if (!home) return null
  const fallback = `${home}/.codex`
  codexHomeCache.set(distro, fallback)
  return fallback
}

export async function readWslFileSafe(absolutePath: string): Promise<string | null> {
  if (!absolutePath.startsWith('/')) return null
  const distro = await getDefaultDistroAsync()
  const winPath = wslPathToWindows(absolutePath, distro)
  try {
    return await withUncFallback(winPath, (p) => readFile(p, 'utf-8'))
  } catch (err) {
    log.debug('readWslFileSafe miss', { absolutePath, err: String(err) })
    return null
  }
}

export function invalidateWslPathsCache(): void {
  homeCache.clear()
  claudeCfgCache.clear()
  codexHomeCache.clear()
}
