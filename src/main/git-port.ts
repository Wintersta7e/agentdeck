import { execFile, type ExecFileOptions } from 'child_process'
import { createHash } from 'crypto'
import { createLogger } from './logger'
import { toWslPath } from './wsl-utils'

const log = createLogger('git-port')

const EXEC_TIMEOUT_MS = 15_000

// ─── Interface ────────────────────────────────────────────────────────────────

export interface GitPort {
  isGitRepo(path: string): Promise<boolean>
  getRepoRoot(path: string): Promise<string>
  addWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void>
  removeWorktree(repoRoot: string, worktreePath: string): Promise<void>
  deleteBranch(repoRoot: string, branch: string): Promise<void>
  status(path: string): Promise<{ hasChanges: boolean }>
  aheadCount(path: string, baseOid: string): Promise<number>
  currentOid(path: string): Promise<string>
  gitVersion(): Promise<{ major: number; minor: number }>
}

// ─── Parser functions (exported for unit testing) ─────────────────────────────

/**
 * Extracts major/minor from "git version 2.43.0" (or platform variant).
 * Throws if the output doesn't contain a recognisable version.
 */
export function parseGitVersion(output: string): { major: number; minor: number } {
  const match = output.match(/git version (\d+)\.(\d+)/)
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Cannot parse git version from output: ${JSON.stringify(output)}`)
  }
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) }
}

/**
 * Non-empty trimmed porcelain output means there are changes.
 */
export function parseStatusPorcelain(output: string): { hasChanges: boolean } {
  return { hasChanges: output.trim().length > 0 }
}

/**
 * Parses the integer output of `git rev-list --count`.
 * Returns 0 for empty or non-numeric output.
 */
export function parseAheadCount(output: string): number {
  const n = parseInt(output.trim(), 10)
  return Number.isFinite(n) ? n : 0
}

// ─── Helpers (exported) ───────────────────────────────────────────────────────

/**
 * Returns the first 8 hex characters of the SHA-256 digest of `id`.
 */
export function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 8)
}

/**
 * Builds a branch name in the form `agentdeck/p-<8hex>/s-<8hex>[-N]`.
 */
export function makeBranchName(projectId: string, sessionId: string, suffix?: number): string {
  const p = hashId(projectId)
  const s = hashId(sessionId)
  const base = `agentdeck/p-${p}/s-${s}`
  return suffix !== undefined ? `${base}-${suffix}` : base
}

// ─── WSL implementation ───────────────────────────────────────────────────────

/**
 * Runs `wsl.exe git <args>` in the given working directory.
 * Resolves with trimmed stdout; rejects with a descriptive Error on non-zero exit.
 */
function wslExec(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: ExecFileOptions & { encoding: 'utf8' } = {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS,
      ...(cwd !== undefined ? { cwd } : {}),
    }
    execFile('wsl.exe', ['git', ...args], opts, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || String(err)
        log.debug('wsl git failed', { args, detail })
        reject(new Error(`wsl git ${args[0] ?? ''}: ${detail}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

/** Ensure a path is in WSL format (convert Windows paths like C:\... to /mnt/c/...) */
function ensureWslPath(p: string): string {
  // Already a WSL/Unix path
  if (p.startsWith('/')) return p
  return toWslPath(p)
}

/**
 * Creates a GitPort that shells out to `wsl.exe git ...` for all operations.
 */
export function createWslGitPort(): GitPort {
  return {
    async isGitRepo(path: string): Promise<boolean> {
      try {
        await wslExec(['-C', ensureWslPath(path), 'rev-parse', '--git-dir'])
        return true
      } catch {
        return false
      }
    },

    async getRepoRoot(path: string): Promise<string> {
      return wslExec(['-C', ensureWslPath(path), 'rev-parse', '--show-toplevel'])
    },

    async addWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void> {
      await wslExec([
        '-C',
        ensureWslPath(repoRoot),
        'worktree',
        'add',
        '-b',
        branch,
        ensureWslPath(worktreePath),
      ])
      log.info('worktree added', { repoRoot, worktreePath, branch })
    },

    async removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
      await wslExec([
        '-C',
        ensureWslPath(repoRoot),
        'worktree',
        'remove',
        '--force',
        ensureWslPath(worktreePath),
      ])
      log.info('worktree removed', { repoRoot, worktreePath })
    },

    async deleteBranch(repoRoot: string, branch: string): Promise<void> {
      await wslExec(['-C', ensureWslPath(repoRoot), 'branch', '-D', branch])
      log.info('branch deleted', { repoRoot, branch })
    },

    async status(path: string): Promise<{ hasChanges: boolean }> {
      const output = await wslExec([
        '-C',
        ensureWslPath(path),
        'status',
        '--porcelain=v2',
        '-z',
        '--untracked-files=normal',
      ])
      return parseStatusPorcelain(output)
    },

    async aheadCount(path: string, baseOid: string): Promise<number> {
      const output = await wslExec([
        '-C',
        ensureWslPath(path),
        'rev-list',
        '--count',
        `${baseOid}..HEAD`,
      ])
      return parseAheadCount(output)
    },

    async currentOid(path: string): Promise<string> {
      return wslExec(['-C', ensureWslPath(path), 'rev-parse', 'HEAD'])
    },

    async gitVersion(): Promise<{ major: number; minor: number }> {
      const output = await wslExec(['version'])
      return parseGitVersion(output)
    },
  }
}
