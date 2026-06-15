import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import type { GitStatus } from '../shared/types'
import { toWslPath } from './wsl-utils'
import { createLogger } from './logger'
import { evictOldestFromMap } from './map-utils'

const execFileAsync = promisify(execFile)
const log = createLogger('git-status')

/** Distinguish "expected" git errors (not-a-repo) from real failures. */
function isNotAGitRepo(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const stderr = (err as { stderr?: unknown }).stderr
  return typeof stderr === 'string' && /not a git repository/i.test(stderr)
}

interface ParsedPorcelain {
  branch: string
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
}

export function parseGitStatusPorcelainV2(output: string): ParsedPorcelain {
  let branch = ''
  let ahead = 0
  let behind = 0
  let staged = 0
  let unstaged = 0
  let untracked = 0

  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/)
      if (match?.[1] && match[2]) {
        ahead = parseInt(match[1], 10)
        behind = parseInt(match[2], 10)
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4)
      if (xy[0] !== '.') staged++
      if (xy[1] !== '.') unstaged++
    } else if (line.startsWith('? ')) {
      untracked++
    }
  }

  return { branch, ahead, behind, staged, unstaged, untracked }
}

export function parseGitDiffStat(output: string): { insertions: number; deletions: number } {
  const match = output.match(/(\d+) insertion[s]?\(\+\)/)
  const matchDel = output.match(/(\d+) deletion[s]?\(-\)/)
  return {
    insertions: match?.[1] ? parseInt(match[1], 10) : 0,
    deletions: matchDel?.[1] ? parseInt(matchDel[1], 10) : 0,
  }
}

const cache = new Map<string, { status: GitStatus; fetchedAt: number }>()
const inFlight = new Map<string, Promise<GitStatus | null>>()
const CACHE_TTL_MS = 30_000
const MAX_CACHE = 200

let diskCachePath: string | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Disk cache schema version. Bump when the persisted entry shape changes
 * incompatibly. Older versions are dropped on load so a stale cache
 * doesn't surface entries with possibly-mismatched fields.
 */
const CACHE_VERSION = 1

interface DiskCacheFile {
  version: number
  entries: Array<{ key: string; status: GitStatus; fetchedAt: number }>
}

/** Initialize disk cache path — call once at startup with app.getPath('userData') */
export function initGitStatusCache(userDataPath: string): void {
  diskCachePath = `${userDataPath}/git-status-cache.json`
  try {
    const raw = readFileSync(diskCachePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<DiskCacheFile> | unknown[]
    // Tolerate the legacy un-versioned bare-array shape on first load
    // after upgrade; subsequent flushes write the versioned shape.
    const entries = Array.isArray(parsed)
      ? (parsed as DiskCacheFile['entries'])
      : parsed.version === CACHE_VERSION
        ? (parsed.entries ?? [])
        : []
    for (const entry of entries) {
      if (entry.key && entry.status) {
        cache.set(entry.key, { status: entry.status, fetchedAt: entry.fetchedAt })
      }
    }
  } catch {
    // No cache file or corrupt — start fresh
  }
}

function buildCacheFile(): DiskCacheFile {
  return {
    version: CACHE_VERSION,
    entries: Array.from(cache.entries()).map(([key, val]) => ({
      key,
      status: val.status,
      fetchedAt: val.fetchedAt,
    })),
  }
}

function scheduleDiskFlush(): void {
  if (flushTimer || !diskCachePath) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!diskCachePath) return
    writeFile(diskCachePath, JSON.stringify(buildCacheFile()), 'utf8').catch((err: unknown) => {
      // Best-effort persistence — log so EACCES/ENOSPC/EROFS don't fail silently
      // (cache never persisting silently is the symptom: every restart pays full
      // git rescan cost and the user sees "Loading…" flicker on every tile).
      log.warn('Failed to persist git-status disk cache', {
        path: diskCachePath,
        err: err instanceof Error ? err.message : String(err),
      })
    })
  }, 5000)
}

/**
 * Cancel any pending debounced flush and write the cache synchronously. Called
 * from before-quit so a just-fetched status isn't lost and the pending 5s timer
 * doesn't keep the event loop alive, delaying process exit.
 */
export function flushGitStatusCache(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!diskCachePath) return
  try {
    writeFileSync(diskCachePath, JSON.stringify(buildCacheFile()), 'utf8')
  } catch (err) {
    log.warn('Failed to flush git-status disk cache on quit', {
      path: diskCachePath,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

function normalizePath(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p
}

async function refreshGitStatus(key: string, projectPath: string): Promise<GitStatus | null> {
  // In-flight dedup: coalesce concurrent requests for the same path into one promise.
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<GitStatus | null> => {
    try {
      const wslPath = toWslPath(projectPath)
      const [statusResult, diffResult] = await Promise.all([
        execFileAsync(
          'wsl.exe',
          ['--', 'env', 'LANG=C', 'git', '-C', wslPath, 'status', '--porcelain=v2', '--branch'],
          { timeout: 10000 },
        ),
        execFileAsync('wsl.exe', ['--', 'env', 'LANG=C', 'git', '-C', wslPath, 'diff', '--stat'], {
          timeout: 10000,
        }),
      ])

      const porcelain = parseGitStatusPorcelainV2(statusResult.stdout)
      const diffStat = parseGitDiffStat(diffResult.stdout)

      const status: GitStatus = {
        ...porcelain,
        insertions: diffStat.insertions,
        deletions: diffStat.deletions,
      }

      cache.set(key, { status, fetchedAt: Date.now() })
      evictOldestFromMap(cache, MAX_CACHE)
      scheduleDiskFlush()
      return status
    } catch (err) {
      // Return null preserves the existing callers' "no git info" UX, but log
      // so real failures (wsl.exe crash, timeout, permission denied) don't
      // look identical to the legitimate not-a-repo case.
      if (isNotAGitRepo(err)) {
        log.debug('Path is not a git repository', { projectPath })
      } else {
        log.warn('Failed to fetch git status', {
          projectPath,
          err: err instanceof Error ? err.message : String(err),
        })
      }
      return null
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}

export async function getGitStatus(projectPath: string): Promise<GitStatus | null> {
  const key = normalizePath(projectPath)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.status
  }
  // If stale but exists (e.g. loaded from disk on startup), return stale data
  // immediately AND refresh in the background. The caller gets instant results.
  if (cached) {
    // Fire background refresh (don't await)
    void refreshGitStatus(key, projectPath)
    return cached.status
  }

  return refreshGitStatus(key, projectPath)
}

export function invalidateGitCache(projectPath: string): void {
  cache.delete(normalizePath(projectPath))
}
