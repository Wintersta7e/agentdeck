import { describe, it, expect } from 'vitest'
import {
  getLogicalSelection,
  type LogicalSelectionOptions,
  type SelectionBufferLine,
  type TabSpan,
} from './terminal-utils'

interface FakeLine {
  text: string
  isWrapped: boolean
}

function buildTerm(
  lines: FakeLine[],
  selection: { start: { x: number; y: number }; end: { x: number; y: number } } | undefined,
): Parameters<typeof getLogicalSelection>[0] {
  return {
    getSelectionPosition: () => selection,
    buffer: {
      active: {
        getLine: (y: number): SelectionBufferLine | undefined => {
          const l = lines[y]
          if (!l) return undefined
          return {
            isWrapped: l.isWrapped,
            translateToString: (_trimRight, startColumn, endColumn) => {
              const start = startColumn ?? 0
              const end = endColumn ?? l.text.length
              return l.text.slice(start, end)
            },
          }
        },
      },
    },
  }
}

describe('getLogicalSelection', () => {
  it('returns empty string when no selection', () => {
    expect(getLogicalSelection(buildTerm([], undefined))).toBe('')
  })

  it('extracts a single non-wrapped row in full', () => {
    const term = buildTerm([{ text: 'hello world', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 11, y: 0 },
    })
    expect(getLogicalSelection(term)).toBe('hello world')
  })

  it('extracts a partial selection within a single row', () => {
    const term = buildTerm([{ text: 'hello world', isWrapped: false }], {
      start: { x: 6, y: 0 },
      end: { x: 11, y: 0 },
    })
    expect(getLogicalSelection(term)).toBe('world')
  })

  it('joins consecutive rows that are soft-wrap continuations into one logical line', () => {
    // A line of 30 chars wrapped to 10-col width: 3 visual rows, rows 1+2 wrapped.
    const term = buildTerm(
      [
        { text: '0123456789', isWrapped: false },
        { text: 'abcdefghij', isWrapped: true },
        { text: 'ABCDEFGHIJ', isWrapped: true },
      ],
      { start: { x: 0, y: 0 }, end: { x: 10, y: 2 } },
    )
    expect(getLogicalSelection(term)).toBe('0123456789abcdefghijABCDEFGHIJ')
  })

  it('separates two distinct logical lines with a single newline', () => {
    const term = buildTerm(
      [
        { text: 'first', isWrapped: false },
        { text: 'second', isWrapped: false },
      ],
      { start: { x: 0, y: 0 }, end: { x: 6, y: 1 } },
    )
    expect(getLogicalSelection(term)).toBe('first\nsecond')
  })

  it('strips trailing spaces on each logical line', () => {
    const term = buildTerm(
      [
        { text: 'foo                ', isWrapped: false },
        { text: 'bar       ', isWrapped: false },
      ],
      { start: { x: 0, y: 0 }, end: { x: 10, y: 1 } },
    )
    expect(getLogicalSelection(term)).toBe('foo\nbar')
  })

  it('preserves leading whitespace (e.g. indented code)', () => {
    const term = buildTerm([{ text: '    indented', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 12, y: 0 },
    })
    expect(getLogicalSelection(term)).toBe('    indented')
  })

  it('handles a multi-row block with mixed wrapped + non-wrapped lines', () => {
    const term = buildTerm(
      [
        { text: 'short', isWrapped: false },
        { text: 'long-line-', isWrapped: false },
        { text: 'continued', isWrapped: true },
        { text: 'tail', isWrapped: false },
      ],
      { start: { x: 0, y: 0 }, end: { x: 4, y: 3 } },
    )
    expect(getLogicalSelection(term)).toBe('short\nlong-line-continued\ntail')
  })

  it('respects start/end column on the first and last selected rows', () => {
    const term = buildTerm(
      [
        { text: 'AAAAAA', isWrapped: false },
        { text: 'BBBBBB', isWrapped: false },
        { text: 'CCCCCC', isWrapped: false },
      ],
      { start: { x: 2, y: 0 }, end: { x: 4, y: 2 } },
    )
    expect(getLogicalSelection(term)).toBe('AAAA\nBBBBBB\nCCCC')
  })
})

describe('getLogicalSelection — tab span substitution via mirror provider', () => {
  /** Build a tab provider from a per-row map of spans. */
  function provider(spansByRow: Record<number, TabSpan[]>): LogicalSelectionOptions {
    return { tabSpansForRow: (y) => spansByRow[y] ?? [] }
  }

  it('substitutes \\t for a tab span fully inside the row selection', () => {
    // cellText for row 0 = "a       b" (a at col 0, tab to col 8 fills 7 spaces, b at col 8)
    const term = buildTerm([{ text: 'a       b', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 9, y: 0 },
    })
    expect(getLogicalSelection(term, provider({ 0: [{ col: 1, width: 7 }] }))).toBe('a\tb')
  })

  it('substitutes multiple tab spans on one row', () => {
    // "a       b       c" — tabs at [1,7] and [9,7]
    const term = buildTerm([{ text: 'a       b       c', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 17, y: 0 },
    })
    expect(
      getLogicalSelection(
        term,
        provider({
          0: [
            { col: 1, width: 7 },
            { col: 9, width: 7 },
          ],
        }),
      ),
    ).toBe('a\tb\tc')
  })

  it('substitutes tabs across multiple rows in a multi-row selection', () => {
    const term = buildTerm(
      [
        { text: 'col1    col2', isWrapped: false }, // tab [4,4]
        { text: 'AAAA    BBBB', isWrapped: false }, // tab [4,4]
      ],
      { start: { x: 0, y: 0 }, end: { x: 12, y: 1 } },
    )
    expect(
      getLogicalSelection(
        term,
        provider({
          0: [{ col: 4, width: 4 }],
          1: [{ col: 4, width: 4 }],
        }),
      ),
    ).toBe('col1\tcol2\nAAAA\tBBBB')
  })

  it('does NOT substitute when a tab span starts before the row slice', () => {
    // Row 0 has tab span [1, 7] but selection starts at x=3 → span partially inside.
    // cellText for [3, 9) = 5 spaces + 'b'.
    const term = buildTerm([{ text: 'a       b', isWrapped: false }], {
      start: { x: 3, y: 0 },
      end: { x: 9, y: 0 },
    })
    expect(getLogicalSelection(term, provider({ 0: [{ col: 1, width: 7 }] }))).toBe('     b')
  })

  it('does NOT substitute when a tab span extends past the row slice', () => {
    // Row 0 has tab span [4, 4] but selection ends at x=6 → partially overlaps
    const term = buildTerm([{ text: 'col1    col2', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
    })
    expect(getLogicalSelection(term, provider({ 0: [{ col: 4, width: 4 }] }))).toBe('col1')
  })

  it('joins a soft-wrapped tab line and substitutes \\t', () => {
    // Logical line "a\tbcdefghijklmn" wrapped to 10 cols:
    //   row 0 (not wrapped): "a       bc"  (a + tab[1,7] + "bc")
    //   row 1 (wrapped): "defghijklmn"
    const term = buildTerm(
      [
        { text: 'a       bc', isWrapped: false },
        { text: 'defghijklmn', isWrapped: true },
      ],
      { start: { x: 0, y: 0 }, end: { x: 11, y: 1 } },
    )
    expect(
      getLogicalSelection(
        term,
        provider({
          0: [{ col: 1, width: 7 }],
          1: [], // wrap continuation has no tabs
        }),
      ),
    ).toBe('a\tbcdefghijklmn')
  })

  it('emits cell-text spaces when the row has no tab spans (e.g. plain text)', () => {
    const term = buildTerm([{ text: 'plain    text', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 13, y: 0 },
    })
    expect(getLogicalSelection(term, provider({}))).toBe('plain    text')
  })

  it('rstrips trailing tab when the line ends in a tab span', () => {
    // "a\tb\t" → cellText "a       b       "
    // Tab spans at [1,7] and [9,7]. Selection covers full line.
    // After substitution: "a\tb\t" → rstrip strips trailing \t → "a\tb"
    const term = buildTerm([{ text: 'a       b       ', isWrapped: false }], {
      start: { x: 0, y: 0 },
      end: { x: 16, y: 0 },
    })
    expect(
      getLogicalSelection(
        term,
        provider({
          0: [
            { col: 1, width: 7 },
            { col: 9, width: 7 },
          ],
        }),
      ),
    ).toBe('a\tb')
  })

  it('with omitted provider, behaves identically to today (parity check)', () => {
    const term = buildTerm(
      [
        { text: 'col1    col2', isWrapped: false },
        { text: 'AAAA    BBBB', isWrapped: false },
      ],
      { start: { x: 0, y: 0 }, end: { x: 12, y: 1 } },
    )
    expect(getLogicalSelection(term)).toBe('col1    col2\nAAAA    BBBB')
  })
})
