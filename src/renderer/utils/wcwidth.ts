/**
 * Cell-width arithmetic for terminal cursor advancement.
 *
 * Returns:
 *   0 for combining marks, zero-width joiners, variation selectors
 *   2 for East Asian Wide / Fullwidth code points (CJK, Hangul, fullwidth
 *     punctuation) and the common emoji ranges
 *   1 for everything else (ASCII, Latin-1, etc.)
 *
 * Coverage matches xterm.js's resolution closely for the ranges that occur
 * in real terminal output. Edge-case codepoints (rare scripts, unassigned
 * code points) default to 1, same as xterm. The cursor mirror uses this to
 * keep its (row, col) state aligned with what xterm renders.
 */

/** Codepoint ranges (inclusive) whose chars have width 2. Sorted by start. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2329, 0x232a], // Angle brackets
  [0x2e80, 0x303e], // CJK Radicals + Kangxi + CJK Symbols
  [0x3041, 0x33ff], // Hiragana, Katakana, CJK punctuation, etc.
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables + Yi Radicals
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe52], // CJK Compatibility Forms + Small Form Variants
  [0xfe54, 0xfe66],
  [0xfe68, 0xfe6b],
  [0xff01, 0xff60], // Fullwidth ASCII
  [0xffe0, 0xffe6], // Fullwidth signs
  [0x1f300, 0x1f64f], // Emoji
  [0x1f680, 0x1f6ff], // Transport & Map
  [0x1f700, 0x1f77f], // Alchemical
  [0x1f780, 0x1f7ff], // Geometric Shapes Extended
  [0x1f800, 0x1f8ff], // Supplemental Arrows-C
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x1fa00, 0x1fa6f], // Chess Symbols, Symbols and Pictographs Extended-A
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
  [0x20000, 0x2fffd], // CJK Extensions B-F
  [0x30000, 0x3fffd], // CJK Extension G
]

/** Codepoint ranges (inclusive) whose chars have width 0 (combining marks). */
const ZERO_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489], // Cyrillic combining
  [0x0591, 0x05bd], // Hebrew points
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  [0x0610, 0x061a], // Arabic
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0711, 0x0711], // Syriac
  [0x0730, 0x074a],
  [0x07a6, 0x07b0],
  [0x07eb, 0x07f3],
  [0x0816, 0x0819],
  [0x081b, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082d],
  [0x0859, 0x085b],
  [0x0900, 0x0902], // Devanagari
  [0x093a, 0x093a],
  [0x093c, 0x093c],
  [0x0941, 0x0948],
  [0x094d, 0x094d],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x200b, 0x200f], // Zero-width space, joiner, mark
  [0x202a, 0x202e], // Bidi formatting
  [0x2060, 0x206f], // Word joiner, invisible, etc.
  [0xfe00, 0xfe0f], // Variation Selectors
  [0xfe20, 0xfe2f], // Combining Half Marks
  [0xfeff, 0xfeff], // BOM / ZWNBSP
  [0xe0100, 0xe01ef], // Variation Selectors Supplement
]

function inRange(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const range = ranges[mid]
    if (!range) return false
    const [start, end] = range
    if (cp < start) hi = mid - 1
    else if (cp > end) lo = mid + 1
    else return true
  }
  return false
}

/** Width in display cells for a single Unicode codepoint. */
export function wcwidth(cp: number): 0 | 1 | 2 {
  // ASCII fast-path — covers the bulk of terminal output without binary search.
  if (cp < 0x80) return cp >= 0x20 && cp !== 0x7f ? 1 : 0
  // C1 controls
  if (cp < 0xa0) return 0
  if (inRange(cp, ZERO_WIDTH_RANGES)) return 0
  if (inRange(cp, WIDE_RANGES)) return 2
  return 1
}

/** Sum of widths for a JS string (handles surrogate pairs). */
export function stringWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp !== undefined) w += wcwidth(cp)
  }
  return w
}
