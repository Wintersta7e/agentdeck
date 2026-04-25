import { describe, it, expect } from 'vitest'
import { parseNameStatus } from './ipc-pty'

describe('parseNameStatus', () => {
  it('parses single-tab entries for added/modified/deleted files', () => {
    const out = 'A\tnew.txt\nM\tchanged.ts\nD\tgone.md\n'
    expect(parseNameStatus(out)).toEqual([
      { path: 'new.txt', insertions: 0, deletions: 0, status: 'added' },
      { path: 'changed.ts', insertions: 0, deletions: 0, status: 'modified' },
      { path: 'gone.md', insertions: 0, deletions: 0, status: 'deleted' },
    ])
  })

  it('takes the new path for rename/copy lines (two tabs)', () => {
    const out = 'R100\told/path.ts\tnew/path.ts\nC080\tsrc/orig.ts\tsrc/copy.ts\n'
    expect(parseNameStatus(out)).toEqual([
      { path: 'new/path.ts', insertions: 0, deletions: 0, status: 'modified' },
      { path: 'src/copy.ts', insertions: 0, deletions: 0, status: 'modified' },
    ])
  })

  it('returns empty array for empty or whitespace-only output', () => {
    expect(parseNameStatus('')).toEqual([])
    expect(parseNameStatus('   \n\n   \n')).toEqual([])
  })

  it('skips malformed lines without a tab separator', () => {
    expect(parseNameStatus('no-tab\nM\tvalid.ts\n')).toEqual([
      { path: 'valid.ts', insertions: 0, deletions: 0, status: 'modified' },
    ])
  })

  it('skips lines where the filename portion is blank after trimming', () => {
    expect(parseNameStatus('M\t\nM\t\t\nA\treal.ts')).toEqual([
      { path: 'real.ts', insertions: 0, deletions: 0, status: 'added' },
    ])
  })

  it('caps output at MAX_REVIEW_FILES entries (SEC2-03)', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `M\tfile_${i}.ts`).join('\n')
    const result = parseNameStatus(lines)
    expect(result.length).toBe(500)
  })

  it('skips paths exceeding MAX_REVIEW_PATH_LEN (SEC2-03)', () => {
    const longPath = 'a'.repeat(1025)
    const input = `M\t${longPath}\nM\tshort.ts`
    const result = parseNameStatus(input)
    expect(result.map((f) => f.path)).toEqual(['short.ts'])
  })

  it('strips null bytes from paths (SEC2-03)', () => {
    const input = 'M\tfi\0le.ts'
    const result = parseNameStatus(input)
    expect(result[0]?.path).toBe('file.ts')
  })
})
