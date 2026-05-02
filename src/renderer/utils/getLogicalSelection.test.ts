import { describe, it, expect } from 'vitest'
import { getLogicalSelection, type SelectionBufferLine } from './terminal-utils'

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
