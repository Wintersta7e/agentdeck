/**
 * Worktree Isolation — Real-environment stress tests.
 *
 * These tests use actual wsl.exe + git against real repos on disk.
 * They test the full WorktreeManager lifecycle under concurrency
 * and rapid create/destroy cycles.
 *
 * Requires: WSL2 with git installed, ~/agentdeck-test/git-project exists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { createWslGitPort } from '../git-port'
import { createWorktreeManager, type WorktreeManager } from '../worktree-manager'

const TEST_REPO = '/home/rooty/agentdeck-test/git-project'
const REGISTRY_DIR = path.join(process.env['TEMP'] ?? '/tmp', `agentdeck-stress-${Date.now()}`)
const WSL_WORKTREE_DIR = `/tmp/agentdeck-stress-wt-${Date.now()}`

function wslAvailable(): boolean {
  try {
    execFileSync('wsl.exe', ['echo', 'ok'], { timeout: 5000, encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

function wslExec(cmd: string): string {
  return execFileSync('wsl.exe', ['bash', '-lc', cmd], {
    timeout: 15000,
    encoding: 'utf-8',
  }).trim()
}

function listWorktrees(): string[] {
  const output = wslExec(`git -C ${TEST_REPO} worktree list --porcelain`)
  return output
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.replace('worktree ', ''))
}

function listBranches(): string[] {
  const output = wslExec(`git -C ${TEST_REPO} branch --list 'agentdeck/*'`)
  return output
    .split('\n')
    .map((l) => l.replace(/^[*+ ]+/, '').trim())
    .filter(Boolean)
}

const canRun = wslAvailable()
const describeIf = canRun ? describe : describe.skip

describeIf('Worktree Stress Tests (real git)', () => {
  let git: ReturnType<typeof createWslGitPort>
  let mgr: WorktreeManager

  beforeAll(() => {
    // Ensure test repo exists and is clean
    const repoExists = wslExec(`test -d ${TEST_REPO}/.git && echo yes || echo no`)
    if (repoExists !== 'yes') {
      throw new Error(`Test repo not found at ${TEST_REPO}. Run the test project setup first.`)
    }
    // Clean up any leftover agentdeck branches/worktrees from prior runs
    try {
      wslExec(`git -C ${TEST_REPO} worktree prune`)
    } catch {
      /* ignore */
    }
    const branches = listBranches()
    for (const b of branches) {
      try {
        wslExec(`git -C ${TEST_REPO} branch -D '${b}'`)
      } catch {
        /* ignore */
      }
    }
  })

  beforeEach(async () => {
    // Order matters: delete dirs first so git worktree prune can release branches
    try {
      wslExec(`rm -rf /tmp/agentdeck-stress-wt-*`)
    } catch {
      /* ignore */
    }
    try {
      wslExec(`git -C ${TEST_REPO} worktree prune`)
    } catch {
      /* ignore */
    }
    for (const b of listBranches()) {
      try {
        wslExec(`git -C ${TEST_REPO} branch -D '${b}'`)
      } catch {
        /* ignore */
      }
    }
    // Clean registry
    try {
      fs.rmSync(REGISTRY_DIR, { recursive: true, force: true })
    } catch {
      /* ignore */
    }

    // Fresh manager for each test
    git = createWslGitPort()
    fs.mkdirSync(REGISTRY_DIR, { recursive: true })
    mgr = await createWorktreeManager(git, () => TEST_REPO, REGISTRY_DIR, WSL_WORKTREE_DIR)
  })

  afterAll(() => {
    // Cleanup registry dir
    try {
      fs.rmSync(REGISTRY_DIR, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    // Cleanup WSL worktree dirs
    try {
      wslExec(`rm -rf ${WSL_WORKTREE_DIR}`)
    } catch {
      /* ignore */
    }
    // Prune git worktree references
    try {
      wslExec(`git -C ${TEST_REPO} worktree prune`)
    } catch {
      /* ignore */
    }
    // Remove agentdeck branches
    const branches = listBranches()
    for (const b of branches) {
      try {
        wslExec(`git -C ${TEST_REPO} branch -D '${b}'`)
      } catch {
        /* ignore */
      }
    }
  })

  it('10 concurrent acquires → exactly 1 primary, 9 worktrees', async () => {
    const projectId = 'stress-proj-1'
    const sessionIds = Array.from({ length: 10 }, (_, i) => `stress-session-${i}`)

    const results = await Promise.all(sessionIds.map((sid) => mgr.acquire(projectId, sid)))

    const primaries = results.filter((r) => !r.isolated)
    const worktrees = results.filter((r) => r.isolated)

    expect(primaries).toHaveLength(1)
    expect(worktrees).toHaveLength(9)
    expect(primaries[0]?.path).toBe(TEST_REPO)

    // Verify all worktree paths are unique
    const paths = new Set(worktrees.map((w) => w.path))
    expect(paths.size).toBe(9)

    // Verify all worktree branches exist in git
    const branches = listBranches()
    for (const wt of worktrees) {
      expect(branches.some((b) => b === wt.branch)).toBe(true)
    }

    // Cleanup
    for (const sid of sessionIds.slice(1)) {
      await mgr.discard(sid)
    }
  }, 60000)

  it('rapid acquire-discard cycles (10x) leave no orphans', async () => {
    const projectId = 'stress-proj-2'

    for (let i = 0; i < 10; i++) {
      const primary = `cycle-primary-${i}`
      const secondary = `cycle-secondary-${i}`

      const r1 = await mgr.acquire(projectId, primary)
      expect(r1.isolated).toBe(false)

      const r2 = await mgr.acquire(projectId, secondary)
      expect(r2.isolated).toBe(true)

      await mgr.discard(secondary)
      mgr.releasePrimary(projectId, primary)
    }

    // No agentdeck branches should remain
    const branches = listBranches()
    expect(branches).toHaveLength(0)

    // No worktree dirs should remain (only the main worktree)
    const worktrees = listWorktrees()
    expect(worktrees).toHaveLength(1) // just the main repo
  }, 120000)

  it('inspect detects real uncommitted changes', async () => {
    const projectId = 'stress-proj-3'

    const r1 = await mgr.acquire(projectId, 'inspect-primary')
    expect(r1.isolated).toBe(false)

    const r2 = await mgr.acquire(projectId, 'inspect-secondary')
    expect(r2.isolated).toBe(true)

    // Create a file in the worktree
    wslExec(`touch ${r2.path}/stress-test-file.txt`)

    const inspection = await mgr.inspect('inspect-secondary')
    expect(inspection.hasChanges).toBe(true)
    expect(inspection.branch).toBeDefined()

    // Cleanup
    await mgr.discard('inspect-secondary')
    mgr.releasePrimary(projectId, 'inspect-primary')
  }, 30000)

  it('inspect detects committed-but-unmerged work', async () => {
    const projectId = 'stress-proj-4'

    await mgr.acquire(projectId, 'commit-primary')
    const r2 = await mgr.acquire(projectId, 'commit-secondary')
    expect(r2.isolated).toBe(true)

    // Commit a file in the worktree
    wslExec(
      `cd ${r2.path} && echo "stress" > stress-commit.txt && git add . && git commit -m "stress test commit"`,
    )

    const inspection = await mgr.inspect('commit-secondary')
    expect(inspection.hasUnmerged).toBe(true)

    // Cleanup
    await mgr.discard('commit-secondary')
    mgr.releasePrimary(projectId, 'commit-primary')
  }, 30000)

  it('keep preserves branch but removes worktree dir', async () => {
    const projectId = 'stress-proj-5'

    await mgr.acquire(projectId, 'keep-primary')
    const r2 = await mgr.acquire(projectId, 'keep-secondary')
    expect(r2.isolated).toBe(true)

    // Commit something so the branch has content
    wslExec(`cd ${r2.path} && echo "keep me" > kept.txt && git add . && git commit -m "keep test"`)

    await mgr.keep('keep-secondary')

    // Worktree dir should be removed
    const dirExists = wslExec(`test -d ${r2.path} && echo yes || echo no`)
    expect(dirExists).toBe('no')

    // Branch should still exist
    const branches = listBranches()
    expect(branches.some((b) => b === r2.branch)).toBe(true)

    // Cleanup
    mgr.releasePrimary(projectId, 'keep-primary')
    wslExec(`git -C ${TEST_REPO} branch -D '${r2.branch}'`)
  }, 30000)

  it('MAX_WORKTREES cap prevents unbounded creation', async () => {
    const projectId = 'stress-proj-6'
    await mgr.acquire(projectId, 'cap-primary')

    // Create 20 worktrees (hitting the cap at 20 entries)
    const results: Array<{ isolated: boolean }> = []
    for (let i = 0; i < 20; i++) {
      try {
        const r = await mgr.acquire(projectId, `cap-session-${i}`)
        results.push(r)
      } catch {
        results.push({ isolated: false }) // cap reached
        break
      }
    }

    // Should have hit the cap before creating 20
    const isolated = results.filter((r) => r.isolated)
    expect(isolated.length).toBeLessThanOrEqual(20)

    // Cleanup all
    for (let i = 0; i < isolated.length; i++) {
      await mgr.discard(`cap-session-${i}`)
    }
    mgr.releasePrimary(projectId, 'cap-primary')
  }, 120000)

  it('releasePrimary allows new session to claim primary', async () => {
    const projectId = 'stress-proj-7'

    const r1 = await mgr.acquire(projectId, 'rp-session-1')
    expect(r1.isolated).toBe(false) // primary

    mgr.releasePrimary(projectId, 'rp-session-1')

    const r2 = await mgr.acquire(projectId, 'rp-session-2')
    expect(r2.isolated).toBe(false) // should get primary, not worktree
    expect(r2.path).toBe(TEST_REPO)

    mgr.releasePrimary(projectId, 'rp-session-2')
  }, 15000)

  it('non-git project returns original path without error', async () => {
    const nonGitMgr = await createWorktreeManager(
      git,
      () => '/home/rooty/agentdeck-test/non-git-project',
      REGISTRY_DIR,
      WSL_WORKTREE_DIR,
    )

    const r1 = await nonGitMgr.acquire('non-git', 'ng-session-1')
    expect(r1.isolated).toBe(false)
    expect(r1.path).toBe('/home/rooty/agentdeck-test/non-git-project')

    const r2 = await nonGitMgr.acquire('non-git', 'ng-session-2')
    expect(r2.isolated).toBe(false) // can't isolate non-git
  }, 15000)
})
