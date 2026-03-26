import { describe, it, expect, beforeEach } from 'vitest'
import { SAFE_SKILL_RE, parseFrontmatter, invalidateAllCaches } from '../skill-scanner'

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
  it('resets state without errors', () => {
    // Should not throw even when caches are already empty
    expect(() => invalidateAllCaches()).not.toThrow()
  })

  it('can be called multiple times', () => {
    invalidateAllCaches()
    invalidateAllCaches()
    invalidateAllCaches()
    // No error means success
  })
})
