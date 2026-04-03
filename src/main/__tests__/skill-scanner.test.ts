import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as cp from 'child_process'
import {
  SAFE_SKILL_RE,
  parseFrontmatter,
  invalidateAllCaches,
  scanSkillDirectory,
  getProjectSkills,
} from '../skill-scanner'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

/** Helper: configure the mocked execFile to call back with the given stdout */
function mockWslOutput(stdout: string): void {
  const mockExecFile = vi.mocked(cp.execFile)
  mockExecFile.mockImplementation((...args: unknown[]) => {
    // execFile(cmd, args, opts, cb) — callback is always the last argument
    const cb = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void
    cb(null, stdout, '')
    return {} as ReturnType<typeof cp.execFile>
  })
}

/** Helper: configure the mocked execFile to call back with an error */
function mockWslError(errMsg: string): void {
  const mockExecFile = vi.mocked(cp.execFile)
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void
    cb(new Error(errMsg), '', '')
    return {} as ReturnType<typeof cp.execFile>
  })
}

beforeEach(() => {
  invalidateAllCaches()
})

// ── SAFE_SKILL_RE ──────────────────────────────────────────────────

describe('SAFE_SKILL_RE', () => {
  it('accepts lowercase names', () => {
    expect(SAFE_SKILL_RE.test('lint-fix')).toBe(true)
  })

  it('accepts uppercase names', () => {
    expect(SAFE_SKILL_RE.test('LintFix')).toBe(true)
  })

  it('accepts names with underscores', () => {
    expect(SAFE_SKILL_RE.test('code_review')).toBe(true)
  })

  it('accepts names with digits', () => {
    expect(SAFE_SKILL_RE.test('fix2024')).toBe(true)
  })

  it('accepts single character', () => {
    expect(SAFE_SKILL_RE.test('a')).toBe(true)
  })

  it('rejects names with spaces', () => {
    expect(SAFE_SKILL_RE.test('lint fix')).toBe(false)
  })

  it('rejects names with dots', () => {
    expect(SAFE_SKILL_RE.test('lint.fix')).toBe(false)
  })

  it('rejects names with slashes', () => {
    expect(SAFE_SKILL_RE.test('lint/fix')).toBe(false)
  })

  it('rejects names with special chars', () => {
    expect(SAFE_SKILL_RE.test('lint@fix')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(SAFE_SKILL_RE.test('')).toBe(false)
  })

  it('rejects names with colons', () => {
    expect(SAFE_SKILL_RE.test('scope:name')).toBe(false)
  })
})

// ── parseFrontmatter ───────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with name and description', () => {
    const content = [
      '---',
      'name: lint-fix',
      'description: Run linter and auto-fix issues',
      '---',
      'Some body text',
    ].join('\n')

    const result = parseFrontmatter(content, 'fallback-dir')
    expect(result).toEqual({
      name: 'lint-fix',
      description: 'Run linter and auto-fix issues',
    })
  })

  it('canonicalizes name to lowercase', () => {
    const content = ['---', 'name: Lint-Fix', '---'].join('\n')

    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('lint-fix')
  })

  it('trims whitespace from name', () => {
    const content = ['---', 'name:   my-skill  ', '---'].join('\n')

    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
  })

  it('falls back to directory name when name field is missing', () => {
    const content = ['---', 'description: A skill', '---'].join('\n')

    const result = parseFrontmatter(content, 'code-review')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('code-review')
  })

  it('falls back to first non-empty line after closing --- when description missing', () => {
    const content = [
      '---',
      'name: my-skill',
      '---',
      '',
      'This is the first paragraph.',
      'More text.',
    ].join('\n')

    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.description).toBe('This is the first paragraph.')
  })

  it('returns empty description when no description field and no body text', () => {
    const content = ['---', 'name: my-skill', '---'].join('\n')

    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.description).toBe('')
  })

  it('returns null for content without opening ---', () => {
    const content = ['name: my-skill', '---'].join('\n')
    expect(parseFrontmatter(content, 'fallback')).toBeNull()
  })

  it('returns null when closing --- is missing within 100 lines', () => {
    const lines = ['---']
    for (let i = 0; i < 100; i++) {
      lines.push('key: value')
    }
    // No closing --- before line 101
    const content = lines.join('\n')
    expect(parseFrontmatter(content, 'fallback')).toBeNull()
  })

  it('finds closing --- at exactly line 100 (0-indexed)', () => {
    const lines = ['---']
    for (let i = 0; i < 99; i++) {
      lines.push(`line${i}: value`)
    }
    lines.push('---') // This is line 100 (0-indexed)
    const content = lines.join('\n')
    const result = parseFrontmatter(content, 'my-skill')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
  })

  it('rejects names with spaces', () => {
    const content = ['---', 'name: lint fix', '---'].join('\n')
    expect(parseFrontmatter(content, 'fallback')).toBeNull()
  })

  it('rejects names with special characters', () => {
    const content = ['---', 'name: lint@fix!', '---'].join('\n')
    expect(parseFrontmatter(content, 'fallback')).toBeNull()
  })

  it('rejects empty name from field', () => {
    const content = ['---', 'name: ', '---'].join('\n')
    // name field is empty string, fallback dir name also tested
    // With dirName='fallback', dirName should be used as fallback
    // But name: '' means field exists with empty value, so we use '' which is empty
    // Actually the logic: name = fields.get('name') ?? dirName -> '' ?? 'fallback' -> ''
    // '' is falsy so SAFE_SKILL_RE.test('') is false -> returns null
    expect(parseFrontmatter(content, 'fallback')).toBeNull()
  })

  it('rejects when directory name fallback also fails SAFE_SKILL_RE', () => {
    const content = ['---', 'description: A skill', '---'].join('\n')
    expect(parseFrontmatter(content, 'my skill dir')).toBeNull()
  })

  it('handles extra whitespace in opening delimiter', () => {
    // Opening --- must be exactly '---' when trimmed
    const content = ['  ---  ', 'name: my-skill', '---'].join('\n')
    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
  })

  it('ignores non-key-value lines in frontmatter', () => {
    const content = [
      '---',
      'name: my-skill',
      'just some random text',
      'description: A description',
      '---',
    ].join('\n')
    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
    expect(result!.description).toBe('A description')
  })

  it('handles frontmatter with extra fields', () => {
    const content = [
      '---',
      'name: my-skill',
      'description: Desc',
      'version: 1.0',
      'author: test',
      '---',
    ].join('\n')
    const result = parseFrontmatter(content, 'fallback')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
    expect(result!.description).toBe('Desc')
  })

  it('handles empty content', () => {
    expect(parseFrontmatter('', 'fallback')).toBeNull()
  })

  it('handles content with only opening delimiter', () => {
    expect(parseFrontmatter('---', 'fallback')).toBeNull()
  })

  it('canonicalizes directory name fallback to lowercase', () => {
    const content = ['---', 'description: A skill', '---'].join('\n')
    const result = parseFrontmatter(content, 'My-Skill')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-skill')
  })
})

// ── Cache helpers ──────────────────────────────────────────────────

describe('invalidateAllCaches', () => {
  it('forces a fresh WSL call after invalidation', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '/home/user/project/.agents/skills/deploy/SKILL.md',
      'deploy',
      '---',
      'name: deploy',
      'description: Deploy to prod',
      '---',
    ].join('\n')

    mockWslOutput(output)

    // First call populates the project cache
    await getProjectSkills('/home/user/project', 'Ubuntu')
    const callsAfterFirst = vi.mocked(cp.execFile).mock.calls.length

    // Second call should hit the cache — no new execFile call
    await getProjectSkills('/home/user/project', 'Ubuntu')
    expect(vi.mocked(cp.execFile).mock.calls.length).toBe(callsAfterFirst)

    // Invalidate and call again — must trigger a fresh WSL call
    invalidateAllCaches()
    mockWslOutput(output)
    await getProjectSkills('/home/user/project', 'Ubuntu')
    expect(vi.mocked(cp.execFile).mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})

// ── scanSkillDirectory (mocked WSL) ───────────────────────────────

describe('scanSkillDirectory', () => {
  beforeEach(() => {
    vi.mocked(cp.execFile).mockReset()
  })

  it('parses valid output with 2 skills into correct SkillInfo entries', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/lint-fix/SKILL.md',
      'lint-fix',
      '---',
      'name: lint-fix',
      'description: Auto-fix lint issues',
      '---',
      '',
      'Instructions here.',
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/review/SKILL.md',
      'review',
      '---',
      'name: code-review',
      'description: Review code quality',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('ok')
    expect(result.skills).toHaveLength(2)
    expect(result.skipped).toBe(0)

    expect(result.skills[0]).toEqual({
      id: 'global:lint-fix',
      name: 'lint-fix',
      description: 'Auto-fix lint issues',
      path: '/home/user/.codex/skills/lint-fix/SKILL.md',
      scope: 'global',
    })

    expect(result.skills[1]).toEqual({
      id: 'global:code-review',
      name: 'code-review',
      description: 'Review code quality',
      path: '/home/user/.codex/skills/review/SKILL.md',
      scope: 'global',
    })
  })

  it('uses project scope when scope argument is project', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '/home/user/project/.agents/skills/deploy/SKILL.md',
      'deploy',
      '---',
      'name: deploy',
      'description: Deploy to prod',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/project/.agents/skills', 'project')

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.id).toBe('project:deploy')
    expect(result.skills[0]!.scope).toBe('project')
  })

  it('returns empty skills with status ok for empty output (no SKILL.md files)', async () => {
    mockWslOutput('')

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('ok')
    expect(result.skills).toHaveLength(0)
    expect(result.skipped).toBe(0)
  })

  it('returns empty skills with status ok for __DIR_MISSING__ output', async () => {
    mockWslOutput('__DIR_MISSING__\n')

    const result = await scanSkillDirectory('/nonexistent/path', 'global')

    expect(result.status).toBe('ok')
    expect(result.skills).toHaveLength(0)
    expect(result.skipped).toBe(0)
  })

  it('returns status failed with error message when WSL exec fails', async () => {
    mockWslError('spawn wsl.exe ENOENT')

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('failed')
    expect(result.error).toBe('WSL is not running or timed out')
    expect(result.skills).toHaveLength(0)
    expect(result.skipped).toBe(0)
  })

  it('returns valid skills and increments skipped for mixed valid + malformed blocks', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/lint-fix/SKILL.md',
      'lint-fix',
      '---',
      'name: lint-fix',
      'description: Auto-fix lint issues',
      '---',
      '---SKILL-BLOCK---',
      // Malformed block: missing closing frontmatter delimiter (no content)
      '/home/user/.codex/skills/broken/SKILL.md',
      'broken',
      'no frontmatter here at all',
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/review/SKILL.md',
      'review',
      '---',
      'name: code-review',
      'description: Review code',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('partial')
    expect(result.skills).toHaveLength(2)
    expect(result.skipped).toBe(1)
    expect(result.skills[0]!.name).toBe('lint-fix')
    expect(result.skills[1]!.name).toBe('code-review')
  })

  it('skips duplicate names within the same scope', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/lint-fix/SKILL.md',
      'lint-fix',
      '---',
      'name: lint-fix',
      'description: First one',
      '---',
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/other-dir/SKILL.md',
      'other-dir',
      '---',
      'name: lint-fix',
      'description: Duplicate name',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('partial')
    expect(result.skills).toHaveLength(1)
    expect(result.skipped).toBe(1)
    expect(result.skills[0]!.description).toBe('First one')
  })

  it('skips blocks with missing path or dirname', async () => {
    const output = [
      '---SKILL-BLOCK---',
      // Only one line — missing dirname
      '/home/user/.codex/skills/lonely/SKILL.md',
      '---SKILL-BLOCK---',
      '/home/user/.codex/skills/valid/SKILL.md',
      'valid',
      '---',
      'name: valid-skill',
      'description: This one is fine',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('partial')
    expect(result.skills).toHaveLength(1)
    expect(result.skipped).toBe(1)
    expect(result.skills[0]!.name).toBe('valid-skill')
  })

  it('handles output with leading whitespace lines in blocks', async () => {
    const output = [
      '---SKILL-BLOCK---',
      '',
      '',
      '/home/user/.codex/skills/padded/SKILL.md',
      'padded',
      '---',
      'name: padded-skill',
      'description: Has leading blank lines',
      '---',
    ].join('\n')

    mockWslOutput(output)

    const result = await scanSkillDirectory('/home/user/.codex/skills', 'global')

    expect(result.status).toBe('ok')
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]!.name).toBe('padded-skill')
  })
})
