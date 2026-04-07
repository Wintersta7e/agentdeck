import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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

function normalizePath(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p
}

export async function getGitStatus(projectPath: string): Promise<GitStatus | null> {
  const key = normalizePath(projectPath)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.status
  }
  if (cached) {
    cache.delete(key) // evict stale before re-fetch
  }

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
          {
            timeout: 10000,
          },
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

export function invalidateGitCache(projectPath: string): void {
  cache.delete(normalizePath(projectPath))
}
