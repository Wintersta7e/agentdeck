import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import type { GitStatus } from '../shared/types'
import { toWslPath } from './wsl-utils'

const execFileAsync = promisify(execFile)

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

/** Initialize disk cache path — call once at startup with app.getPath('userData') */
export function initGitStatusCache(userDataPath: string): void {
  diskCachePath = `${userDataPath}/git-status-cache.json`
  try {
    const raw = readFileSync(diskCachePath, 'utf8')
    const entries = JSON.parse(raw) as Array<{ key: string; status: GitStatus; fetchedAt: number }>
    for (const entry of entries) {
      if (entry.key && entry.status) {
        cache.set(entry.key, { status: entry.status, fetchedAt: entry.fetchedAt })
      }
    }
  } catch {
    // No cache file or corrupt — start fresh
  }
}

function scheduleDiskFlush(): void {
  if (flushTimer || !diskCachePath) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!diskCachePath) return
    try {
      const entries = Array.from(cache.entries()).map(([key, val]) => ({
        key,
        status: val.status,
        fetchedAt: val.fetchedAt,
      }))
      writeFileSync(diskCachePath, JSON.stringify(entries), 'utf8')
    } catch {
      // Best-effort persistence
    }
  }, 5000)
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
          ['--', 'git', '-C', wslPath, 'status', '--porcelain=v2', '--branch'],
          { timeout: 10000 },
        ),
        execFileAsync('wsl.exe', ['--', 'git', '-C', wslPath, 'diff', '--stat'], {
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
      if (cache.size > MAX_CACHE) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      scheduleDiskFlush()
      return status
    } catch {
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
