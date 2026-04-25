import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'node:crypto'
import type { GitPort } from './git-port'
import { makeBranchName } from './git-port'
import { createLogger } from './logger'

const log = createLogger('worktree-manager')

const MAX_BRANCH_RETRIES = 3
const MAX_WORKTREES = 20
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

const VALID_OID_RE = /^[0-9a-f]{40}$/
function isValidOid(oid: string): boolean {
  return VALID_OID_RE.test(oid)
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface WorktreeResult {
  path: string
  isolated: boolean
  branch?: string | undefined
}

export interface WorktreeInspection {
  hasChanges: boolean
  hasUnmerged: boolean
  branch: string
}

export interface WorktreeEntry {
  projectId: string
  sessionId: string
  path: string
  branch: string
  repoRoot: string
  baseOid: string
  createdAt: number
  lastUsed: number
  kept: boolean
  pendingCleanup: boolean
}

export interface WorktreeManager {
  acquire(projectId: string, sessionId: string): Promise<WorktreeResult>
  inspect(sessionId: string): Promise<WorktreeInspection>
  discard(sessionId: string): Promise<void>
  keep(sessionId: string): Promise<void>
  releasePrimary(projectId: string, sessionId: string): void
  pruneOrphans(): Promise<number>
}

// ─── Registry persistence ────────────────────────────────────────────────────

interface RegistryData {
  entries: WorktreeEntry[]
}

function registryPath(registryDir: string): string {
  return path.join(registryDir, 'registry.json')
}

// PERF-13: Async registry I/O to avoid blocking the main process event loop
async function loadRegistry(registryDir: string): Promise<WorktreeEntry[]> {
  const file = registryPath(registryDir)
  try {
    const raw = await fs.promises.readFile(file, 'utf-8')
    const data = JSON.parse(raw) as RegistryData
    if (!Array.isArray(data.entries)) {
      log.warn('Registry file malformed — resetting', { file })
      return []
    }
    const valid = data.entries.filter((e) => isValidOid(e.baseOid))
    if (valid.length < data.entries.length) {
      log.warn('Filtered registry entries with invalid baseOid', {
        file,
        removed: data.entries.length - valid.length,
      })
    }
    return valid
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      log.warn('Failed to read registry — resetting', { file, err: String(err) })
    }
    return []
  }
}

async function saveRegistry(registryDir: string, entries: WorktreeEntry[]): Promise<void> {
  const file = registryPath(registryDir)
  const dir = path.dirname(file)
  await fs.promises.mkdir(dir, { recursive: true })

  const data: RegistryData = { entries }
  const json = JSON.stringify(data, null, 2)
  const tmpFile = `${file}.${randomBytes(6).toString('hex')}.tmp`
  await fs.promises.writeFile(tmpFile, json, 'utf-8')
  await fs.promises.rename(tmpFile, file)
}

// ─── Per-key mutex (promise-based, same pattern as project-store) ────────────

function createMutexMap(): {
  serialized: <T>(key: string, fn: () => Promise<T>) => Promise<T>
} {
  const locks = new Map<string, Promise<unknown>>()

  function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve()
    const p = prev.then(
      () => fn(),
      () => fn(),
    )
    locks.set(key, p)
    return p.finally(() => {
      if (locks.get(key) === p) locks.delete(key)
    })
  }

  return { serialized }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export async function createWorktreeManager(
  git: GitPort,
  lookupProjectPath: (projectId: string) => string | undefined,
  registryDir: string,
  wslWorktreeDir?: string | undefined,
): Promise<WorktreeManager> {
  const worktreeBaseDir = wslWorktreeDir ?? registryDir
  // PERF-13: Await async registry load
  let entries: WorktreeEntry[] = await loadRegistry(registryDir)

  // Primary tracking: projectId -> sessionId. NOT persisted.
  // Reconstructed: sessions in the registry are worktree sessions, not primaries.
  const primaries = new Map<string, string>()

  const { serialized } = createMutexMap()

  async function persistEntries(): Promise<void> {
    await saveRegistry(registryDir, entries)
  }

  function findEntry(sessionId: string): WorktreeEntry | undefined {
    return entries.find((e) => e.sessionId === sessionId)
  }

  function removeEntry(sessionId: string): void {
    entries = entries.filter((e) => e.sessionId !== sessionId)
    void persistEntries()
  }

  function updateEntry(sessionId: string, update: Partial<WorktreeEntry>): void {
    const entry = findEntry(sessionId)
    if (entry) {
      Object.assign(entry, update)
      void persistEntries()
    }
  }

  // ── acquire ──────────────────────────────────────────────────

  async function acquire(projectId: string, sessionId: string): Promise<WorktreeResult> {
    const projectPath = lookupProjectPath(projectId)
    if (projectPath === undefined) {
      throw new Error(`Cannot resolve project path for projectId: ${projectId}`)
    }

    return serialized(projectId, async () => {
      // Idempotency: already in registry means this is a worktree session
      const existing = findEntry(sessionId)
      if (existing) {
        existing.lastUsed = Date.now()
        persistEntries()
        return { path: existing.path, isolated: true, branch: existing.branch }
      }

      // Already primary for this project
      if (primaries.get(projectId) === sessionId) {
        return { path: projectPath, isolated: false }
      }

      // Not a git repo — return original path, no isolation
      const isRepo = await git.isGitRepo(projectPath)
      if (!isRepo) {
        return { path: projectPath, isolated: false }
      }

      // No primary yet — claim primary
      if (!primaries.has(projectId)) {
        primaries.set(projectId, sessionId)
        return { path: projectPath, isolated: false }
      }

      // Non-primary: need worktree — enforce cap first
      if (entries.length >= MAX_WORKTREES) {
        throw new Error(`Worktree limit reached (${MAX_WORKTREES}). Close existing sessions first.`)
      }

      // Check git version
      const ver = await git.gitVersion()
      if (ver.major < 2 || (ver.major === 2 && ver.minor < 17)) {
        throw new Error('Git 2.17+ required for worktree isolation')
      }

      const repoRoot = await git.getRepoRoot(projectPath)
      const baseOid = await git.currentOid(projectPath)
      const worktreePath = path.posix.join(worktreeBaseDir, projectId, sessionId)
      if (!worktreePath.startsWith(worktreeBaseDir + '/')) {
        throw new Error('Worktree path escapes base directory')
      }

      // Try creating worktree, retry with suffix on branch collision
      let branch = ''
      let created = false
      for (let attempt = 0; attempt < MAX_BRANCH_RETRIES; attempt++) {
        branch = makeBranchName(projectId, sessionId, attempt === 0 ? undefined : attempt)
        try {
          await git.addWorktree(repoRoot, worktreePath, branch)
          created = true
          break
        } catch (err) {
          if (attempt === MAX_BRANCH_RETRIES - 1) {
            throw new Error(
              `Failed to create worktree after ${MAX_BRANCH_RETRIES} attempts: ${String(err)}`,
            )
          }
          log.warn('Worktree add failed, retrying with suffix', {
            attempt,
            branch,
            err: String(err),
          })
        }
      }

      if (!created) {
        throw new Error('Failed to create worktree — all retry attempts exhausted')
      }

      const now = Date.now()
      const entry: WorktreeEntry = {
        projectId,
        sessionId,
        path: worktreePath,
        branch,
        repoRoot,
        baseOid,
        createdAt: now,
        lastUsed: now,
        kept: false,
        pendingCleanup: false,
      }
      entries.push(entry)
      persistEntries()

      log.info('Worktree acquired', { projectId, sessionId, branch, worktreePath })
      return { path: worktreePath, isolated: true, branch }
    })
  }

  // ── inspect ──────────────────────────────────────────────────

  async function inspect(sessionId: string): Promise<WorktreeInspection> {
    const entry = findEntry(sessionId)
    if (!entry) {
      throw new Error(`No worktree entry found for sessionId: ${sessionId}`)
    }

    const statusResult = await git.status(entry.path)

    if (!isValidOid(entry.baseOid)) {
      // Can't reliably check ahead count — treat as dirty
      return { hasChanges: statusResult.hasChanges, hasUnmerged: true, branch: entry.branch }
    }

    const ahead = await git.aheadCount(entry.path, entry.baseOid)

    return {
      hasChanges: statusResult.hasChanges,
      hasUnmerged: ahead > 0,
      branch: entry.branch,
    }
  }

  // ── discard ──────────────────────────────────────────────────

  async function discard(sessionId: string): Promise<void> {
    const entry = findEntry(sessionId)
    if (!entry) {
      log.warn('Discard called for unknown session', { sessionId })
      return
    }

    try {
      await git.removeWorktree(entry.repoRoot, entry.path)
    } catch (err) {
      log.error('Failed to remove worktree — marking pendingCleanup', {
        sessionId,
        err: String(err),
      })
      updateEntry(sessionId, { pendingCleanup: true })
      return
    }

    // Prune git's internal worktree list so the branch is no longer locked
    try {
      await git.pruneWorktrees(entry.repoRoot)
    } catch {
      // Best-effort — branch delete below may still succeed
    }

    try {
      await git.deleteBranch(entry.repoRoot, entry.branch)
    } catch (err) {
      log.warn('Failed to delete branch after worktree removal', {
        sessionId,
        branch: entry.branch,
        err: String(err),
      })
    }

    removeEntry(sessionId)

    // Release primary slot if this project has no more active sessions
    if (primaries.get(entry.projectId) === sessionId) {
      primaries.delete(entry.projectId)
    }

    log.info('Worktree discarded', { sessionId, branch: entry.branch })
  }

  // ── keep ─────────────────────────────────────────────────────

  async function keep(sessionId: string): Promise<void> {
    const entry = findEntry(sessionId)
    if (!entry) {
      throw new Error(`No worktree entry found for sessionId: ${sessionId}`)
    }

    // Remove worktree directory to free disk space. The branch persists in the
    // repo's refs regardless of whether the worktree directory exists.
    try {
      await git.removeWorktree(entry.repoRoot, entry.path)
    } catch (err) {
      log.warn('Failed to remove worktree dir on keep', {
        sessionId,
        path: entry.path,
        err: String(err),
      })
    }

    updateEntry(sessionId, { kept: true, lastUsed: Date.now() })
    log.info('Worktree kept', { sessionId, branch: entry.branch })
  }

  // ── pruneOrphans ─────────────────────────────────────────────

  async function pruneOrphans(): Promise<number> {
    const now = Date.now()
    let pruned = 0

    // Work on a snapshot to avoid mutation issues during iteration
    const snapshot = [...entries]

    for (const entry of snapshot) {
      // Retry entries marked pendingCleanup
      if (entry.pendingCleanup) {
        try {
          await git.removeWorktree(entry.repoRoot, entry.path)
          await git.deleteBranch(entry.repoRoot, entry.branch).catch(() => {
            // Best-effort branch delete
          })
          removeEntry(entry.sessionId)
          pruned++
          log.info('Pruned pendingCleanup worktree', { sessionId: entry.sessionId })
          continue
        } catch {
          log.warn('PendingCleanup retry failed, will try again later', {
            sessionId: entry.sessionId,
          })
          continue
        }
      }

      // Skip kept entries
      if (entry.kept) continue

      // Skip entries not old enough
      if (now - entry.lastUsed < ORPHAN_AGE_MS) continue

      // Check if branch has unpushed commits — skip dirty branches
      if (!isValidOid(entry.baseOid)) {
        // Can't reliably check ahead count — treat as dirty, skip
        log.warn('Skipping prune of worktree with invalid baseOid', {
          sessionId: entry.sessionId,
        })
        continue
      }
      try {
        const ahead = await git.aheadCount(entry.path, entry.baseOid)
        if (ahead > 0) {
          log.warn('Skipping prune of dirty worktree (unpushed commits)', {
            sessionId: entry.sessionId,
            ahead,
          })
          continue
        }
        // CDX-3: Also check for uncommitted changes (dirty working tree)
        const statusResult = await git.status(entry.path)
        if (statusResult.hasChanges) {
          log.warn('Skipping prune of dirty worktree (uncommitted changes)', {
            sessionId: entry.sessionId,
          })
          continue
        }
      } catch (checkErr) {
        // R2-25: If the worktree directory no longer exists (manually deleted),
        // remove the registry entry since there's nothing to protect
        const errMsg = checkErr instanceof Error ? checkErr.message : String(checkErr)
        if (
          errMsg.includes('ENOENT') ||
          errMsg.includes('not a git repository') ||
          errMsg.includes('does not exist')
        ) {
          log.info('Removing orphan registry entry for deleted worktree directory', {
            sessionId: entry.sessionId,
          })
          removeEntry(entry.sessionId)
          pruned++
          continue
        }
        // For other errors, skip to be safe
        log.warn('Cannot check ahead count for orphan — skipping', {
          sessionId: entry.sessionId,
        })
        continue
      }

      // Clean and old enough — remove
      try {
        await git.removeWorktree(entry.repoRoot, entry.path)
        await git.deleteBranch(entry.repoRoot, entry.branch).catch(() => {
          // Best-effort
        })
        removeEntry(entry.sessionId)
        pruned++
        log.info('Pruned orphan worktree', { sessionId: entry.sessionId })
      } catch (err) {
        log.warn('Failed to prune orphan — marking pendingCleanup', {
          sessionId: entry.sessionId,
          err: String(err),
        })
        updateEntry(entry.sessionId, { pendingCleanup: true })
      }
    }

    return pruned
  }

  // ── releasePrimary ────────────────────────────────────────────

  function releasePrimary(projectId: string, sessionId: string): void {
    if (primaries.get(projectId) === sessionId) {
      primaries.delete(projectId)
      log.info('Primary slot released', { projectId, sessionId })
    }
  }

  return { acquire, inspect, discard, keep, releasePrimary, pruneOrphans }
}
