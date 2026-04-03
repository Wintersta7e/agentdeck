import { describe, it, expect } from 'vitest'
import {
  parseGitVersion,
  parseStatusPorcelain,
  parseAheadCount,
  hashId,
  makeBranchName,
} from './git-port'

describe('parseGitVersion', () => {
  it('parses normal git version output', () => {
    expect(parseGitVersion('git version 2.43.0\n')).toEqual({ major: 2, minor: 43 })
  })

  it('parses git version with platform suffix (windows extra text)', () => {
    expect(parseGitVersion('git version 2.39.1.windows.1\n')).toEqual({ major: 2, minor: 39 })
  })

  it('parses git version with additional build metadata', () => {
    expect(parseGitVersion('git version 2.40.0 (Apple Git-128)\n')).toEqual({ major: 2, minor: 40 })
  })

  it('throws on unparseable output', () => {
    expect(() => parseGitVersion('not a git version string')).toThrow()
  })

  it('throws on empty string', () => {
    expect(() => parseGitVersion('')).toThrow()
  })
})

describe('parseStatusPorcelain', () => {
  it('returns hasChanges=true for non-empty output', () => {
    expect(parseStatusPorcelain(' M src/main.ts\n')).toEqual({ hasChanges: true })
  })

  it('returns hasChanges=true for multiple changed files', () => {
    expect(parseStatusPorcelain(' M file1.ts\n?? file2.ts\n')).toEqual({ hasChanges: true })
  })

  it('returns hasChanges=false for empty output', () => {
    expect(parseStatusPorcelain('')).toEqual({ hasChanges: false })
  })

  it('returns hasChanges=false for whitespace-only output', () => {
    expect(parseStatusPorcelain('   \n  \n')).toEqual({ hasChanges: false })
  })
})

describe('parseAheadCount', () => {
  it('parses a normal number', () => {
    expect(parseAheadCount('3\n')).toBe(3)
  })

  it('parses zero', () => {
    expect(parseAheadCount('0\n')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseAheadCount('')).toBe(0)
  })

  it('returns 0 for non-numeric output', () => {
    expect(parseAheadCount('not a number')).toBe(0)
  })

  it('returns 0 for whitespace-only output', () => {
    expect(parseAheadCount('   ')).toBe(0)
  })
})

describe('hashId', () => {
  it('returns an 8-character hex string', () => {
    const result = hashId('some-id')
    expect(result).toHaveLength(8)
    expect(result).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns a deterministic result for the same input', () => {
    expect(hashId('my-project')).toBe(hashId('my-project'))
  })

  it('returns different results for different inputs', () => {
    expect(hashId('project-a')).not.toBe(hashId('project-b'))
  })
})

describe('makeBranchName', () => {
  it('returns the correct format without suffix', () => {
    const branch = makeBranchName('project-id', 'session-id')
    expect(branch).toMatch(/^agentdeck\/p-[0-9a-f]{8}\/s-[0-9a-f]{8}$/)
  })

  it('returns the correct format with suffix', () => {
    const branch = makeBranchName('project-id', 'session-id', 2)
    expect(branch).toMatch(/^agentdeck\/p-[0-9a-f]{8}\/s-[0-9a-f]{8}-2$/)
  })

  it('is deterministic for the same project and session', () => {
    expect(makeBranchName('proj', 'sess')).toBe(makeBranchName('proj', 'sess'))
  })

  it('produces different branch names for different session IDs', () => {
    expect(makeBranchName('proj', 'sess-a')).not.toBe(makeBranchName('proj', 'sess-b'))
  })

  it('produces different branch names for different project IDs', () => {
    expect(makeBranchName('proj-a', 'sess')).not.toBe(makeBranchName('proj-b', 'sess'))
  })
})
