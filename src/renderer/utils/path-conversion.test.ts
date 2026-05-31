import { describe, it, expect } from 'vitest'
import { windowsToWsl } from './path-conversion'

describe('windowsToWsl', () => {
  it('converts a drive-letter path with backslashes', () => {
    expect(windowsToWsl('C:\\foo\\bar')).toBe('/mnt/c/foo/bar')
  })

  it('converts a drive-letter path with forward slashes', () => {
    expect(windowsToWsl('C:/foo/bar')).toBe('/mnt/c/foo/bar')
  })

  it('lowercases the drive letter', () => {
    expect(windowsToWsl('D:\\foo\\bar')).toBe('/mnt/d/foo/bar')
  })

  it('leaves WSL POSIX paths untouched', () => {
    expect(windowsToWsl('/home/user/proj')).toBe('/home/user/proj')
  })

  it('converts stray backslashes in already-POSIX-ish input', () => {
    // Defensive: if the caller pastes a half-converted path we still produce
    // a path the IPC validator accepts.
    expect(windowsToWsl('/home/user\\proj')).toBe('/home/user/proj')
  })

  it('returns empty for empty input', () => {
    expect(windowsToWsl('')).toBe('')
  })
})
