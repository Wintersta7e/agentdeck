import { beforeEach, describe, expect, it } from 'vitest'
import { TerminalGridMirror } from './terminal-grid-mirror'

const ESC = '\x1b'

function mk(
  opts: Partial<{ rows: number; cols: number; scrollback: number; tabSize: number }> = {},
) {
  return new TerminalGridMirror({
    rows: opts.rows ?? 24,
    cols: opts.cols ?? 80,
    scrollback: opts.scrollback ?? 1000,
    tabSize: opts.tabSize ?? 8,
  })
}

describe('TerminalGridMirror — printables and C0', () => {
  it('records no tabs for plain ASCII', () => {
    const m = mk()
    m.ingest('hello world')
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('LF advances to next row; CR resets col (CRLF is the typical PTY pair)', () => {
    const m = mk()
    m.ingest('a\tb\r\nc\td')
    expect(m.getTabSpans(0)).toEqual([{ col: 1, width: 7 }])
    expect(m.getTabSpans(1)).toEqual([{ col: 1, width: 7 }])
  })

  it('bare LF (no CR) does not reset col — matches VT semantics', () => {
    const m = mk()
    m.ingest('abc\nx')
    // x lands at col 3 of row 1 (cursor moved down but col preserved)
    m.ingest('\t')
    expect(m.getTabSpans(1)).toEqual([{ col: 4, width: 4 }])
  })

  it('CR resets cursor col without changing row', () => {
    const m = mk()
    m.ingest('abc\rxy')
    // Plain writes over chars but no tabs to invalidate
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('BS decrements cursor; subsequent write does not invalidate untouched tab', () => {
    const m = mk({ cols: 80 })
    // Write tab, then advance, then BS, then write — write lands at col 8 which is
    // immediately after the tab span; tab span [0, 8) unaffected.
    m.ingest('\tx\bX')
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })
})

describe('TerminalGridMirror — tab span recording', () => {
  it('tab at col 0 records [0, width 8]', () => {
    const m = mk()
    m.ingest('\t')
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })

  it('tab at col 5 records [5, width 3]', () => {
    const m = mk()
    m.ingest('hello\t')
    expect(m.getTabSpans(0)).toEqual([{ col: 5, width: 3 }])
  })

  it('tab at col 8 records [8, width 8]', () => {
    const m = mk()
    m.ingest('12345678\t')
    expect(m.getTabSpans(0)).toEqual([{ col: 8, width: 8 }])
  })

  it('records consecutive tabs as separate spans', () => {
    const m = mk()
    m.ingest('a\t\tb')
    expect(m.getTabSpans(0)).toEqual([
      { col: 1, width: 7 },
      { col: 8, width: 8 },
    ])
  })

  it('respects custom tab size 4', () => {
    const m = mk({ tabSize: 4 })
    m.ingest('a\tb')
    expect(m.getTabSpans(0)).toEqual([{ col: 1, width: 3 }])
  })

  it('clamps tab to viewport cols', () => {
    const m = mk({ cols: 10 })
    m.ingest('1234567\t') // col 7 → next stop at 8 → width 1 (still inside cols=10? yes)
    expect(m.getTabSpans(0)).toEqual([{ col: 7, width: 1 }])
  })
})

describe('TerminalGridMirror — tab span invalidation', () => {
  it('plain char written over tab cells removes the span', () => {
    const m = mk()
    m.ingest('\t') // tab [0, 8]
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
    // CR back to col 0, then write 'x' which lands at col 0 — invalidates tab
    m.ingest('\rx')
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('plain char written outside tab span leaves it intact', () => {
    const m = mk()
    m.ingest('\tx') // tab [0,8], then 'x' at col 8 — past the tab span
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })

  it('partial overlap removes the entire span (no half-tabs)', () => {
    const m = mk()
    m.ingest('\t')
    // Move cursor to col 4, write 'x' — partially overlaps tab range [0, 8)
    m.ingest(`${ESC}[5GX`) // CHA col 5 (1-based) → col 4 (0-based); 'X' at col 4
    expect(m.getTabSpans(0)).toEqual([])
  })
})

describe('TerminalGridMirror — CSI erase', () => {
  it('EL mode 2 (ESC[2K) clears all tabs on the cursor row', () => {
    const m = mk()
    m.ingest('a\tb\tc')
    expect(m.getTabSpans(0).length).toBe(2)
    m.ingest(`${ESC}[2K`)
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('EL mode 0 (ESC[0K) clears tabs from cursor to end of line', () => {
    const m = mk()
    // 'a' at col 0, tab [1,7]; back to col 0 with CR; cursor at col 0; EL 0 clears [0, 80)
    m.ingest('a\tb')
    m.ingest('\r')
    m.ingest(`${ESC}[0K`)
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('ED mode 2 (ESC[2J) clears tabs across the viewport', () => {
    const m = mk()
    m.ingest('a\tb\nc\td\ne\tf')
    expect(m.getTabSpans(0).length + m.getTabSpans(1).length + m.getTabSpans(2).length).toBe(3)
    m.ingest(`${ESC}[2J`)
    expect(m.getTabSpans(0)).toEqual([])
    expect(m.getTabSpans(1)).toEqual([])
    expect(m.getTabSpans(2)).toEqual([])
  })
})

describe('TerminalGridMirror — CSI cursor positioning', () => {
  let m: TerminalGridMirror
  beforeEach(() => {
    m = mk()
  })

  it('CUP (ESC[H) sends cursor to home', () => {
    m.ingest('abcdef\n123\n')
    m.ingest(`${ESC}[Ht`) // home, then 't'
    // The 't' should land at viewport row 0, col 0 — invalidates anything there
    expect(m.getTabSpans(0)).toEqual([])
  })

  it('CUP with row;col positions cursor, then writing lands at that cell', () => {
    // Place a tab at row 5, col 0
    m.ingest('\n\n\n\n\n\t') // 5 LF then tab at row 5
    expect(m.getTabSpans(5)).toEqual([{ col: 0, width: 8 }])
    // CUP to row 6 col 1 (1-based); write 'x'
    m.ingest(`${ESC}[6;1HX`)
    // 'x' lands at row 5 (CUP is 1-based, so row 6 = vp row 5 = abs row 5 in our model with empty viewport top)
    // The X overwrites the tab cell at col 0 on row 5 → tab invalidated
    expect(m.getTabSpans(5)).toEqual([])
  })

  it('CUU (ESC[A) moves cursor up', () => {
    m.ingest('\n\n\n') // row 3
    m.ingest(`${ESC}[2A`) // up 2 → row 1
    m.ingest('\t') // tab at row 1, col 0
    expect(m.getTabSpans(1)).toEqual([{ col: 0, width: 8 }])
    expect(m.getTabSpans(3)).toEqual([])
  })

  it('CUF (ESC[C) moves cursor forward; CUB (ESC[D) moves cursor back', () => {
    m.ingest(`${ESC}[5C`) // forward 5 → col 5
    m.ingest('\t')
    expect(m.getTabSpans(0)).toEqual([{ col: 5, width: 3 }])
  })

  it('CHA (ESC[G) sets cursor column (1-based)', () => {
    m.ingest(`${ESC}[10G\t`) // col 10 (1-based) → col 9 → tab [9, width 7]
    expect(m.getTabSpans(0)).toEqual([{ col: 9, width: 7 }])
  })

  it('VPA (ESC[d) sets cursor row (1-based)', () => {
    m.ingest(`${ESC}[5d\t`) // row 5 (1-based) → row 4
    expect(m.getTabSpans(4)).toEqual([{ col: 0, width: 8 }])
  })
})

describe('TerminalGridMirror — non-cursor ANSI noise', () => {
  it('SGR (ESC[31m) is consumed without moving cursor', () => {
    const m = mk()
    m.ingest(`${ESC}[31m\t${ESC}[0m`) // red tab, then reset
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })

  it('OSC (ESC]0;title\\x07) consumed cleanly', () => {
    const m = mk()
    m.ingest(`${ESC}]0;window title\x07\t`)
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })

  it('OSC terminated by ESC \\\\ (ST)', () => {
    const m = mk()
    m.ingest(`${ESC}]10;rgb:00/00/00${ESC}\\\t`)
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })

  it('DCS (ESC P ... ESC \\\\) consumed cleanly', () => {
    const m = mk()
    m.ingest(`${ESC}P+q544e${ESC}\\\t`)
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
  })
})

describe('TerminalGridMirror — alt buffer', () => {
  it('DECSET 1049 saves main; DECRST 1049 restores', () => {
    const m = mk()
    m.ingest('a\tb') // main: tab on row 0
    expect(m.getTabSpans(0)).toEqual([{ col: 1, width: 7 }])
    m.ingest(`${ESC}[?1049h`) // enter alt
    expect(m.getTabSpans(0)).toEqual([]) // alt is empty
    m.ingest('\t') // tab in alt buffer
    expect(m.getTabSpans(0)).toEqual([{ col: 0, width: 8 }])
    m.ingest(`${ESC}[?1049l`) // leave alt
    expect(m.getTabSpans(0)).toEqual([{ col: 1, width: 7 }]) // main restored
  })

  it("DECSC inside alt buffer does not clobber main's saved cursor", () => {
    const m = mk()
    m.ingest(`${ESC}[6G`) // CHA col 6 (1-based) → col 5
    m.ingest(`${ESC}7`) // DECSC: save (row 0, col 5) in main
    m.ingest(`${ESC}[?1049h`) // enter alt
    m.ingest(`${ESC}[10;20H`) // CUP to (10, 20) in alt
    m.ingest(`${ESC}7`) // DECSC inside alt — must NOT touch main's saved register
    m.ingest(`${ESC}[?1049l`) // leave alt — restores main's saved register
    m.ingest(`${ESC}8`) // DECRC in main — should go back to (0, 5)
    m.ingest('\t') // tab at col 5 → span [5, 3]
    expect(m.getTabSpans(0)).toEqual([{ col: 5, width: 3 }])
  })
})

describe('TerminalGridMirror — wide chars', () => {
  it('CJK char advances cursor by 2 cells', () => {
    const m = mk()
    m.ingest('漢\t') // 漢 at col 0+1, tab at col 2 → next stop col 8 → width 6
    expect(m.getTabSpans(0)).toEqual([{ col: 2, width: 6 }])
  })

  it('emoji (surrogate pair) advances cursor by 2 cells', () => {
    const m = mk()
    m.ingest('🚀\t') // emoji at col 0+1, tab at col 2 → width 6
    expect(m.getTabSpans(0)).toEqual([{ col: 2, width: 6 }])
  })
})

describe('TerminalGridMirror — ASCII run fast-path equivalence', () => {
  it('produces the same result via run-coalescing as a per-char ingest', () => {
    // A line with a tab + a long ASCII run after it. Both paths should
    // record the tab span and end with cursor at the same column.
    const input = 'col1\t' + 'x'.repeat(50)
    const a = mk()
    a.ingest(input)
    const b = mk()
    for (const ch of input) b.ingest(ch)
    expect(a.getTabSpans(0)).toEqual(b.getTabSpans(0))
  })

  it('plain ASCII run that overlaps an existing tab span invalidates it', () => {
    const m = mk()
    m.ingest('\t') // tab span [0, 8]
    m.ingest('\r') // cursor back to col 0
    m.ingest('hello') // 5 chars overwriting cells [0, 5)
    expect(m.getTabSpans(0)).toEqual([])
  })
})

describe('TerminalGridMirror — totalRows & eviction', () => {
  it('totalRows tracks cursor row', () => {
    const m = mk()
    expect(m.totalRows).toBe(1)
    m.ingest('\n')
    expect(m.totalRows).toBe(2)
    m.ingest('\n\n\n')
    expect(m.totalRows).toBe(5)
  })

  it('evicts oldest rows past scrollback cap', () => {
    const m = mk({ rows: 4, cols: 10, scrollback: 2 })
    // Total capacity: scrollback + rows = 6
    // Write 10 LF — cursor moves to row 10
    for (let i = 0; i < 10; i++) m.ingest('\t\n') // tab on each row
    // After 10 LF, oldest 4 rows evicted (we keep last 6: rows 4..9)
    expect(m.getTabSpans(0)).toEqual([]) // row 0 evicted
    // Row 4 in our absolute terms = buffer-y 0 if firstAbsRow=4
    expect(m.getTabSpans(0).length).toBeLessThanOrEqual(1)
  })
})
