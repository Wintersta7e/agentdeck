import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { atomicWrite } from './fs-atomic'

describe('atomicWrite', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-atomic-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes the target file with the given content', async () => {
    const target = path.join(tmpDir, 'out.json')
    await atomicWrite(target, '{"hello":1}')

    expect(fs.readFileSync(target, 'utf-8')).toBe('{"hello":1}')
  })

  it('returns the modified time (mtimeMs) of the written file', async () => {
    const target = path.join(tmpDir, 'out.txt')
    const before = Date.now()
    const mtime = await atomicWrite(target, 'data')
    const after = Date.now()

    expect(mtime).toBeGreaterThan(0)
    // mtime should be within a reasonable window of "now" (allow filesystem skew)
    expect(mtime).toBeGreaterThanOrEqual(before - 5_000)
    expect(mtime).toBeLessThanOrEqual(after + 5_000)
  })

  it('overwrites an existing file atomically (no partial state visible)', async () => {
    const target = path.join(tmpDir, 'out.txt')
    fs.writeFileSync(target, 'original')

    await atomicWrite(target, 'replaced')

    expect(fs.readFileSync(target, 'utf-8')).toBe('replaced')
  })

  it('cleans up the .tmp file after rename', async () => {
    const target = path.join(tmpDir, 'out.txt')
    await atomicWrite(target, 'x')

    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('handles concurrent writes without interleaving content', async () => {
    const target = path.join(tmpDir, 'out.txt')
    // Each call uses a unique random-suffixed temp file, so concurrent writes
    // race only on the final rename — readers see one of the writes, never partial.
    await Promise.all([
      atomicWrite(target, 'AAAAA'),
      atomicWrite(target, 'BBBBB'),
      atomicWrite(target, 'CCCCC'),
    ])

    const final = fs.readFileSync(target, 'utf-8')
    expect(['AAAAA', 'BBBBB', 'CCCCC']).toContain(final)
  })

  it('rejects when the target directory does not exist', async () => {
    const bogus = path.join(tmpDir, 'nope', 'out.txt')
    await expect(atomicWrite(bogus, 'x')).rejects.toThrow()
  })

  it('writes utf-8 multi-byte content correctly', async () => {
    const target = path.join(tmpDir, 'unicode.txt')
    const payload = '日本語テスト 🚀 emoji'
    await atomicWrite(target, payload)

    expect(fs.readFileSync(target, 'utf-8')).toBe(payload)
  })
})
