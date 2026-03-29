import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import type { GitPort } from './git-port'
import { createWorktreeManager } from './worktree-manager'

// ── fs mock ──────────────────────────────────────────────────────────────────

// vi.hoisted runs before vi.mock hoisting, so fsStore is available in the factory
const { fsStore } = vi.hoisted(() => {
  const fsStore = new Map<string, string>()
  return { fsStore }
})

vi.mock('fs', () => {
  return {
    readFileSync: vi.fn((filepath: string) => {
      const data = fsStore.get(filepath)
      if (data === undefined) {
        const err = new Error(`ENOENT: no such file`) as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }
      return data
    }),
    writeFileSync: vi.fn((filepath: string, data: string) => {
      fsStore.set(filepath, data)
    }),
    renameSync: vi.fn((src: string, dest: string) => {
      const data = fsStore.get(src)
      if (data !== undefined) {
        fsStore.delete(src)
        fsStore.set(dest, data)
      }
    }),
    mkdirSync: vi.fn(),
  }
})

// ── logger mock ──────────────────────────────────────────────────────────────

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockGit(overrides: Partial<GitPort> = {}): GitPort {
  return {
    isGitRepo: vi.fn(async () => true),
    getRepoRoot: vi.fn(async (p: string) => p),
    addWorktree: vi.fn(async () => {}),
    removeWorktree: vi.fn(async () => {}),
    deleteBranch: vi.fn(async () => {}),
    status: vi.fn(async () => ({ hasChanges: false })),
    aheadCount: vi.fn(async () => 0),
    currentOid: vi.fn(async () => 'abc123def456'),
    gitVersion: vi.fn(async () => ({ major: 2, minor: 43 })),
    ...overrides,
  }
}

const REGISTRY_DIR = '/tmp/test-worktrees'

function createLookup(map: Record<string, string>): (projectId: string) => string | undefined {
  return (projectId: string) => map[projectId]
}

describe('WorktreeManager — acquire', () => {
  beforeEach(() => {
    fsStore.clear()
    vi.mocked(fs.readFileSync).mockClear()
    vi.mocked(fs.writeFileSync).mockClear()
    vi.mocked(fs.renameSync).mockClear()
    vi.mocked(fs.mkdirSync).mockClear()
  })

  it('first session gets original path (primary)', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    const result = await mgr.acquire('proj1', 'sess-1')

    expect(result.path).toBe('/home/user/project-a')
    expect(result.isolated).toBe(false)
    expect(result.branch).toBeUndefined()
  })

  it('second session on same project gets worktree', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // First session claims primary
    const r1 = await mgr.acquire('proj1', 'sess-1')
    expect(r1.isolated).toBe(false)

    // Second session gets isolated worktree
    const r2 = await mgr.acquire('proj1', 'sess-2')
    expect(r2.isolated).toBe(true)
    expect(r2.path).toContain('proj1')
    expect(r2.path).toContain('sess-2')
    expect(r2.branch).toBeDefined()
    expect(r2.branch!.startsWith('agentdeck/')).toBe(true)
    expect(git.addWorktree).toHaveBeenCalledTimes(1)
  })

  it('idempotent: same sessionId returns same result', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Primary
    await mgr.acquire('proj1', 'sess-1')
    // Worktree session
    const first = await mgr.acquire('proj1', 'sess-2')
    // Same session again — should not call addWorktree again
    const second = await mgr.acquire('proj1', 'sess-2')

    expect(second.path).toBe(first.path)
    expect(second.branch).toBe(first.branch)
    expect(second.isolated).toBe(true)
    // Only one addWorktree call (from the first acquire of sess-2)
    expect(git.addWorktree).toHaveBeenCalledTimes(1)
  })

  it('non-git repo returns original path, isolated: false', async () => {
    const git = createMockGit({
      isGitRepo: vi.fn(async () => false),
    })
    const lookup = createLookup({ proj1: '/home/user/plain-dir' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    const result = await mgr.acquire('proj1', 'sess-1')

    expect(result.path).toBe('/home/user/plain-dir')
    expect(result.isolated).toBe(false)
    expect(git.addWorktree).not.toHaveBeenCalled()
  })

  it('git version < 2.17 throws for non-primary', async () => {
    const git = createMockGit({
      gitVersion: vi.fn(async () => ({ major: 2, minor: 15 })),
    })
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Primary succeeds (no version check needed)
    await mgr.acquire('proj1', 'sess-1')

    // Non-primary needs worktree — should fail on version check
    await expect(mgr.acquire('proj1', 'sess-2')).rejects.toThrow(
      'Git 2.17+ required for worktree isolation',
    )
  })

  it('fails closed when worktree add fails', async () => {
    const git = createMockGit({
      addWorktree: vi.fn(async () => {
        throw new Error('fatal: worktree path already exists')
      }),
    })
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Primary
    await mgr.acquire('proj1', 'sess-1')

    // All retry attempts fail — should propagate error
    await expect(mgr.acquire('proj1', 'sess-2')).rejects.toThrow(
      /Failed to create worktree after 3 attempts/,
    )
  })

  it('throws when projectPath cannot be resolved', async () => {
    const git = createMockGit()
    const lookup = createLookup({}) // empty — no projects
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    await expect(mgr.acquire('nonexistent', 'sess-1')).rejects.toThrow(
      'Cannot resolve project path for projectId: nonexistent',
    )
  })

  it('serializes concurrent acquires (Promise.all, exactly 1 primary)', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Fire multiple acquires concurrently for the same project
    const results = await Promise.all([
      mgr.acquire('proj1', 'sess-1'),
      mgr.acquire('proj1', 'sess-2'),
      mgr.acquire('proj1', 'sess-3'),
    ])

    // Exactly one should be primary (isolated: false)
    const primaries = results.filter((r) => !r.isolated)
    const worktrees = results.filter((r) => r.isolated)

    expect(primaries).toHaveLength(1)
    expect(worktrees).toHaveLength(2)
    expect(primaries[0]!.path).toBe('/home/user/project-a')

    // Each worktree should have a unique path
    const wtPaths = worktrees.map((r) => r.path)
    expect(new Set(wtPaths).size).toBe(2)
  })

  it('cross-project acquires are concurrent (both get primary)', async () => {
    const git = createMockGit()
    const lookup = createLookup({
      proj1: '/home/user/project-a',
      proj2: '/home/user/project-b',
    })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Fire acquires for different projects concurrently
    const [r1, r2] = await Promise.all([
      mgr.acquire('proj1', 'sess-1'),
      mgr.acquire('proj2', 'sess-2'),
    ])

    // Both should be primaries (no worktree needed)
    expect(r1.isolated).toBe(false)
    expect(r1.path).toBe('/home/user/project-a')
    expect(r2.isolated).toBe(false)
    expect(r2.path).toBe('/home/user/project-b')

    // No worktrees created
    expect(git.addWorktree).not.toHaveBeenCalled()
  })
})

// ── Helper to set up a primary + worktree session ────────────────────────────

async function setupWorktreeSession(
  git: ReturnType<typeof createMockGit>,
  projectPath: string = '/home/user/project-a',
): Promise<{
  mgr: ReturnType<typeof createWorktreeManager>
  primaryId: string
  worktreeId: string
}> {
  const lookup = createLookup({ proj1: projectPath })
  const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

  // Session 1 gets primary
  await mgr.acquire('proj1', 'sess-primary')
  // Session 2 gets worktree
  await mgr.acquire('proj1', 'sess-worktree')

  return { mgr, primaryId: 'sess-primary', worktreeId: 'sess-worktree' }
}

// ── inspect ───────────────────────────────────────────────────────────────────

describe('WorktreeManager — inspect', () => {
  beforeEach(() => {
    fsStore.clear()
  })

  it('detects uncommitted changes', async () => {
    const git = createMockGit({
      status: vi.fn(async () => ({ hasChanges: true })),
      aheadCount: vi.fn(async () => 0),
    })
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    const result = await mgr.inspect(worktreeId)

    expect(result.hasChanges).toBe(true)
    expect(result.hasUnmerged).toBe(false)
    expect(result.branch).toBeDefined()
    expect(result.branch.startsWith('agentdeck/')).toBe(true)
  })

  it('detects unmerged commits', async () => {
    const git = createMockGit({
      status: vi.fn(async () => ({ hasChanges: false })),
      aheadCount: vi.fn(async () => 3),
    })
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    const result = await mgr.inspect(worktreeId)

    expect(result.hasChanges).toBe(false)
    expect(result.hasUnmerged).toBe(true)
    expect(git.aheadCount).toHaveBeenCalledWith(
      expect.stringContaining('sess-worktree'),
      expect.any(String),
    )
  })

  it('reports clean when no changes and no unmerged commits', async () => {
    const git = createMockGit({
      status: vi.fn(async () => ({ hasChanges: false })),
      aheadCount: vi.fn(async () => 0),
    })
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    const result = await mgr.inspect(worktreeId)

    expect(result.hasChanges).toBe(false)
    expect(result.hasUnmerged).toBe(false)
  })

  it('throws for unknown sessionId', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    await expect(mgr.inspect('nonexistent-session')).rejects.toThrow(
      'No worktree entry found for sessionId: nonexistent-session',
    )
  })
})

// ── discard ───────────────────────────────────────────────────────────────────

describe('WorktreeManager — discard', () => {
  beforeEach(() => {
    fsStore.clear()
  })

  it('removes worktree, deletes branch, and evicts registry entry', async () => {
    const git = createMockGit()
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    // Verify entry exists before discard
    await expect(mgr.inspect(worktreeId)).resolves.toBeDefined()

    await mgr.discard(worktreeId)

    expect(git.removeWorktree).toHaveBeenCalledTimes(1)
    expect(git.deleteBranch).toHaveBeenCalledTimes(1)

    // Entry should be gone — inspect should throw
    await expect(mgr.inspect(worktreeId)).rejects.toThrow(
      `No worktree entry found for sessionId: ${worktreeId}`,
    )
  })

  it('marks pendingCleanup when removeWorktree rejects', async () => {
    const git = createMockGit({
      removeWorktree: vi.fn(async () => {
        throw new Error('fatal: not a git worktree')
      }),
    })
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    // discard should NOT throw — it degrades gracefully
    await expect(mgr.discard(worktreeId)).resolves.toBeUndefined()

    // deleteBranch should NOT have been called — discard returned early
    expect(git.deleteBranch).not.toHaveBeenCalled()

    // Entry is still in the registry (pendingCleanup=true), so inspect still works
    const result = await mgr.inspect(worktreeId)
    expect(result).toBeDefined()
    expect(result.branch).toBeDefined()
  })

  it('is a no-op for unknown sessionId', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    // Should resolve without throwing
    await expect(mgr.discard('nonexistent-session')).resolves.toBeUndefined()

    expect(git.removeWorktree).not.toHaveBeenCalled()
    expect(git.deleteBranch).not.toHaveBeenCalled()
  })
})

// ── keep ──────────────────────────────────────────────────────────────────────

describe('WorktreeManager — keep', () => {
  beforeEach(() => {
    fsStore.clear()
  })

  it('marks the entry as kept so pruneOrphans skips it', async () => {
    const git = createMockGit()
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    await mgr.keep(worktreeId)

    // Even if the entry is old, pruneOrphans should skip it
    // Simulate an old lastUsed by discarding and re-checking prune count
    // pruneOrphans returns 0 — kept entries are never pruned
    const pruned = await mgr.pruneOrphans()
    expect(pruned).toBe(0)

    // The entry is still inspectable
    const result = await mgr.inspect(worktreeId)
    expect(result).toBeDefined()
  })

  it('throws for unknown sessionId', async () => {
    const git = createMockGit()
    const lookup = createLookup({ proj1: '/home/user/project-a' })
    const mgr = createWorktreeManager(git, lookup, REGISTRY_DIR)

    await expect(mgr.keep('nonexistent-session')).rejects.toThrow(
      'No worktree entry found for sessionId: nonexistent-session',
    )
  })
})

// ── pruneOrphans ──────────────────────────────────────────────────────────────

describe('WorktreeManager — pruneOrphans', () => {
  beforeEach(() => {
    fsStore.clear()
  })

  it('returns 0 when there are no stale entries', async () => {
    const git = createMockGit()
    const { mgr } = await setupWorktreeSession(git)

    // Fresh worktree — lastUsed is now, not old enough to prune
    const pruned = await mgr.pruneOrphans()
    expect(pruned).toBe(0)
  })

  it('returns 0 when the only worktree entry is kept', async () => {
    const git = createMockGit()
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    await mgr.keep(worktreeId)

    const pruned = await mgr.pruneOrphans()
    expect(pruned).toBe(0)
    // removeWorktree should never have been called
    expect(git.removeWorktree).not.toHaveBeenCalled()
  })

  it('retries and removes a pendingCleanup entry on success', async () => {
    // First removeWorktree call fails (simulating original discard failure),
    // second call succeeds (pruneOrphans retry).
    let callCount = 0
    const git = createMockGit({
      removeWorktree: vi.fn(async () => {
        callCount++
        if (callCount === 1) throw new Error('transient error')
        // second call succeeds
      }),
    })
    const { mgr, worktreeId } = await setupWorktreeSession(git)

    // Trigger the initial failure to mark pendingCleanup
    await mgr.discard(worktreeId)
    expect(callCount).toBe(1)

    // pruneOrphans should retry and succeed
    const pruned = await mgr.pruneOrphans()
    expect(pruned).toBe(1)
    expect(callCount).toBe(2)

    // Entry should be gone
    await expect(mgr.inspect(worktreeId)).rejects.toThrow(
      `No worktree entry found for sessionId: ${worktreeId}`,
    )
  })
})
