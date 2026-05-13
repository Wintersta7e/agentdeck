import { describe, expect, it } from 'vitest'
import { stringWidth, wcwidth } from './wcwidth'

describe('wcwidth', () => {
  it('returns 1 for ASCII printable', () => {
    expect(wcwidth(0x20)).toBe(1) // space
    expect(wcwidth('a'.codePointAt(0) ?? 0)).toBe(1)
    expect(wcwidth('Z'.codePointAt(0) ?? 0)).toBe(1)
    expect(wcwidth(0x7e)).toBe(1) // ~
  })

  it('returns 0 for C0 / C1 control codes and DEL', () => {
    expect(wcwidth(0x00)).toBe(0) // NUL
    expect(wcwidth(0x09)).toBe(0) // HT (cursor handler decides advance)
    expect(wcwidth(0x0a)).toBe(0) // LF
    expect(wcwidth(0x1b)).toBe(0) // ESC
    expect(wcwidth(0x7f)).toBe(0) // DEL
    expect(wcwidth(0x80)).toBe(0) // C1 begin
    expect(wcwidth(0x9f)).toBe(0) // C1 end
  })

  it('returns 2 for CJK ideographs', () => {
    expect(wcwidth(0x4e00)).toBe(2) // 一
    expect(wcwidth(0x9fff)).toBe(2)
    expect(wcwidth('漢'.codePointAt(0) ?? 0)).toBe(2)
    expect(wcwidth('日'.codePointAt(0) ?? 0)).toBe(2)
  })

  it('returns 2 for Hangul syllables', () => {
    expect(wcwidth(0xac00)).toBe(2) // 가
    expect(wcwidth(0xd7a3)).toBe(2)
  })

  it('returns 2 for Hiragana / Katakana', () => {
    expect(wcwidth('あ'.codePointAt(0) ?? 0)).toBe(2)
    expect(wcwidth('カ'.codePointAt(0) ?? 0)).toBe(2)
  })

  it('returns 2 for fullwidth ASCII', () => {
    expect(wcwidth(0xff21)).toBe(2) // Ａ (fullwidth A)
  })

  it('returns 2 for common emoji', () => {
    expect(wcwidth(0x1f600)).toBe(2) // 😀
    expect(wcwidth(0x1f680)).toBe(2) // 🚀
    expect(wcwidth(0x1f9d1)).toBe(2) // 🧑
  })

  it('returns 0 for combining marks', () => {
    expect(wcwidth(0x0301)).toBe(0) // combining acute accent
    expect(wcwidth(0x0307)).toBe(0)
  })

  it('returns 0 for variation selectors', () => {
    expect(wcwidth(0xfe0f)).toBe(0)
    expect(wcwidth(0xe0101)).toBe(0)
  })

  it('returns 0 for zero-width space and joiner', () => {
    expect(wcwidth(0x200b)).toBe(0)
    expect(wcwidth(0x200d)).toBe(0)
  })

  it('returns 1 for Latin-1 supplement printable', () => {
    expect(wcwidth(0x00e9)).toBe(1) // é
    expect(wcwidth(0x00e0)).toBe(1) // à
  })
})

describe('stringWidth', () => {
  it('returns 0 for empty string', () => {
    expect(stringWidth('')).toBe(0)
  })

  it('counts ASCII as 1 per char', () => {
    expect(stringWidth('hello')).toBe(5)
  })

  it('counts CJK as 2 per char', () => {
    expect(stringWidth('漢字')).toBe(4)
  })

  it('mixes widths correctly', () => {
    expect(stringWidth('a漢b')).toBe(4)
  })

  it('treats surrogate pair emoji as a single 2-cell char', () => {
    expect(stringWidth('🚀')).toBe(2)
  })

  it('subtracts zero-width combining marks', () => {
    // e + combining acute → still width 1 (the e), combining is 0
    expect(stringWidth('é')).toBe(1)
  })
})
