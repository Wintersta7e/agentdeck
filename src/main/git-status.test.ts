import { describe, it, expect } from 'vitest'
import { parseGitStatusPorcelainV2, parseGitDiffStat } from './git-status'

describe('parseGitStatusPorcelainV2', () => {
  it('parses branch info and file counts', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 abc123 def456 src/index.ts',
      '1 .M N... 100644 100644 100644 abc123 def456 src/app.ts',
      '1 .M N... 100644 100644 100644 abc123 def456 src/utils.ts',
      '? untracked.txt',
    ].join('\n')

    const result = parseGitStatusPorcelainV2(output)
    expect(result.branch).toBe('main')
    expect(result.ahead).toBe(2)
    expect(result.behind).toBe(1)
    expect(result.staged).toBe(1)
    expect(result.unstaged).toBe(2)
    expect(result.untracked).toBe(1)
  })

  it('handles detached HEAD', () => {
    const output = ['# branch.oid abc123', '# branch.head (detached)'].join('\n')

    const result = parseGitStatusPorcelainV2(output)
    expect(result.branch).toBe('(detached)')
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })

  it('handles empty repo', () => {
    const output = '# branch.oid (initial)\n# branch.head main\n'
    const result = parseGitStatusPorcelainV2(output)
    expect(result.branch).toBe('main')
    expect(result.staged).toBe(0)
  })
})

describe('parseGitDiffStat', () => {
  it('parses insertions and deletions from --stat output', () => {
    const output = [
      ' src/index.ts | 10 +++++++---',
      ' src/app.ts   |  5 +++++',
      ' 2 files changed, 12 insertions(+), 3 deletions(-)',
    ].join('\n')

    const result = parseGitDiffStat(output)
    expect(result.insertions).toBe(12)
    expect(result.deletions).toBe(3)
  })

  it('handles no changes', () => {
    const result = parseGitDiffStat('')
    expect(result.insertions).toBe(0)
    expect(result.deletions).toBe(0)
  })
})
