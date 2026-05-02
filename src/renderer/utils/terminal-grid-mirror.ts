/**
 * Parallel grid model that tracks where every `\t` byte landed in the
 * terminal cell grid, plus enough cursor state to stay correct under
 * cursor-positioning sequences, scroll regions, and alt-buffer toggles.
 *
 * Powers the tab-preservation copy path in `getLogicalSelection`: when a
 * selection covers an absolute row, the mirror returns the row's tab
 * spans (col + width pairs), and the copy emitter substitutes `\t` for
 * each spanned cell range in the cell-based text. Tabs that are
 * overwritten by later printable writes (TUI rewrites) are invalidated
 * automatically — partial-overlap kills the entire span, so we never
 * emit fragmented half-tabs that would mis-render on paste.
 *
 * Pure class — no DOM, no xterm import. Caller feeds `ingest(data)` with
 * the same byte stream xterm receives. Caller calls `resize(rows, cols)`
 * on every fit-driven resize. `getTabSpans(yBuffer)` is the read API for
 * the copy path; `yBuffer` is xterm's selection y (buffer-relative).
 */

import { wcwidth } from './wcwidth'

export interface TabSpan {
  /** Cell column where the tab span starts (inclusive). */
  col: number
  /** Number of cells the original `\t` byte filled. */
  width: number
}

interface MirrorRow {
  /** Sorted by col, non-overlapping. Empty array == no tabs on this row. */
  tabs: TabSpan[]
}

interface CursorSnapshot {
  rows: Map<number, MirrorRow>
  firstAbsRow: number
  cursorRow: number
  cursorCol: number
  savedCursorRow: number
  savedCursorCol: number
  viewportTopAbs: number
  scrollTopVp: number
  scrollBottomVp: number
}

const DEFAULT_TAB_SIZE = 8

/* ---------- Parser state machine ---------- */

const enum S {
  Ground = 0,
  Escape = 1,
  CsiEntry = 2,
  CsiParam = 3,
  CsiIntermediate = 4,
  CsiIgnore = 5,
  OscString = 6,
  StringSeq = 7, // DCS, APC, PM, SOS — all terminate with ST (ESC \)
}

const MAX_CSI_PARAMS = 16
const MAX_OSC_LEN = 4096
const MAX_TAB_SPANS_PER_ROW = 32 // safety against pathological inputs

export interface MirrorOptions {
  rows: number
  cols: number
  scrollback: number
  tabSize?: number
}

export class TerminalGridMirror {
  private rows: Map<number, MirrorRow> = new Map()
  private firstAbsRow = 0

  private cursorRow = 0 // absolute row index
  private cursorCol = 0

  private savedCursorRow = 0
  private savedCursorCol = 0

  // Viewport-relative scroll region [scrollTopVp, scrollBottomVp]
  private scrollTopVp = 0
  private scrollBottomVp = 0

  // Absolute row index of viewport row 0
  private viewportTopAbs = 0

  // Alt buffer
  private isAlt = false
  private mainSnapshot: CursorSnapshot | null = null

  private rowsCount: number
  private colsCount: number
  private readonly maxScrollback: number
  private readonly tabSize: number

  // Parser state
  private parserState: S = S.Ground
  private csiParams: number[] = []
  private csiCurrentParam = 0
  private csiHasCurrentParam = false
  private csiPrefix = '' // ?, >, !, etc.
  private csiIntermediates = ''
  private oscBuf = ''
  private oscPrevWasEsc = false

  constructor(opts: MirrorOptions) {
    this.rowsCount = Math.max(1, opts.rows)
    this.colsCount = Math.max(1, opts.cols)
    this.maxScrollback = Math.max(0, opts.scrollback)
    this.tabSize = opts.tabSize ?? DEFAULT_TAB_SIZE
    this.scrollBottomVp = this.rowsCount - 1
  }

  /* ---------- Public API ---------- */

  resize(rows: number, cols: number): void {
    rows = Math.max(1, rows)
    cols = Math.max(1, cols)
    this.rowsCount = rows
    this.colsCount = cols
    // Reset scroll region to full viewport on resize (xterm's behaviour)
    this.scrollTopVp = 0
    this.scrollBottomVp = rows - 1
    if (this.cursorCol >= cols) this.cursorCol = cols - 1
    // Trim tab spans that now extend past cols
    for (const row of this.rows.values()) {
      row.tabs = row.tabs
        .map((s) => (s.col + s.width <= cols ? s : { col: s.col, width: cols - s.col }))
        .filter((s) => s.width > 0 && s.col < cols)
    }
  }

  ingest(data: string): void {
    for (let i = 0; i < data.length; ) {
      const cp = data.codePointAt(i) ?? 0
      this.feedCodePoint(cp)
      i += cp > 0xffff ? 2 : 1
    }
  }

  /**
   * Tab spans for the row at xterm's selection-y (buffer-relative).
   * Empty array if no tabs on that row, or if the row has been evicted.
   */
  getTabSpans(yBuffer: number): readonly TabSpan[] {
    const absRow = this.firstAbsRow + yBuffer
    return this.rows.get(absRow)?.tabs ?? []
  }

  /** Total absolute rows known to the mirror (matches xterm.buffer.length). */
  get totalRows(): number {
    return this.cursorRow - this.firstAbsRow + 1
  }

  clear(): void {
    this.rows.clear()
    this.firstAbsRow = 0
    this.cursorRow = 0
    this.cursorCol = 0
    this.savedCursorRow = 0
    this.savedCursorCol = 0
    this.viewportTopAbs = 0
    this.scrollTopVp = 0
    this.scrollBottomVp = this.rowsCount - 1
    this.isAlt = false
    this.mainSnapshot = null
    this.parserState = S.Ground
    this.csiParams = []
    this.csiCurrentParam = 0
    this.csiHasCurrentParam = false
    this.csiPrefix = ''
    this.csiIntermediates = ''
    this.oscBuf = ''
    this.oscPrevWasEsc = false
  }

  /* ---------- Parser dispatch ---------- */

  private feedCodePoint(cp: number): void {
    // ESC always restarts (except inside string sequences where ESC \ ends them)
    if (cp === 0x1b) {
      if (this.parserState === S.OscString || this.parserState === S.StringSeq) {
        this.oscPrevWasEsc = true
        return
      }
      this.parserState = S.Escape
      return
    }

    switch (this.parserState) {
      case S.Ground:
        this.feedGround(cp)
        return
      case S.Escape:
        this.feedEscape(cp)
        return
      case S.CsiEntry:
      case S.CsiParam:
      case S.CsiIntermediate:
      case S.CsiIgnore:
        this.feedCsi(cp)
        return
      case S.OscString:
      case S.StringSeq:
        this.feedString(cp)
        return
    }
  }

  private feedGround(cp: number): void {
    // C0 control codes
    if (cp < 0x20) {
      switch (cp) {
        case 0x08: // BS
          if (this.cursorCol > 0) this.cursorCol -= 1
          return
        case 0x09: // HT (tab)
          this.handleTab()
          return
        case 0x0a: // LF
        case 0x0b: // VT
        case 0x0c: // FF
          this.handleLineFeed()
          return
        case 0x0d: // CR
          this.cursorCol = 0
          return
        default:
          return // BEL, NUL, etc. — ignore
      }
    }
    if (cp === 0x7f) return // DEL
    if (cp >= 0x80 && cp < 0xa0) return // C1
    // Printable
    this.handlePrintable(cp)
  }

  private feedEscape(cp: number): void {
    if (cp === 0x5b) {
      // [
      this.parserState = S.CsiEntry
      this.csiParams = []
      this.csiCurrentParam = 0
      this.csiHasCurrentParam = false
      this.csiPrefix = ''
      this.csiIntermediates = ''
      return
    }
    if (cp === 0x5d) {
      // ]
      this.parserState = S.OscString
      this.oscBuf = ''
      this.oscPrevWasEsc = false
      return
    }
    if (cp === 0x50 || cp === 0x58 || cp === 0x5e || cp === 0x5f) {
      // P (DCS), X (SOS), ^ (PM), _ (APC) — string sequences
      this.parserState = S.StringSeq
      this.oscPrevWasEsc = false
      return
    }
    // Two-char escapes (not exhaustive — we handle the cursor-relevant ones)
    switch (cp) {
      case 0x37: // ESC 7 — DECSC save cursor
        this.savedCursorRow = this.cursorRow
        this.savedCursorCol = this.cursorCol
        break
      case 0x38: // ESC 8 — DECRC restore cursor
        this.cursorRow = this.savedCursorRow
        this.cursorCol = this.savedCursorCol
        break
      case 0x44: // ESC D — IND, index (cursor down + scroll)
        this.handleLineFeed()
        break
      case 0x45: // ESC E — NEL, next line
        this.cursorCol = 0
        this.handleLineFeed()
        break
      case 0x4d: // ESC M — RI, reverse index
        this.handleReverseIndex()
        break
      case 0x63: // ESC c — RIS, full reset
        this.clear()
        break
      // Other (charset designators ESC ( ESC ) etc. are 3-char, but for our
      // purposes we treat the next char as silently consumed; simpler to
      // just go back to ground and let it process.
      default:
        break
    }
    this.parserState = S.Ground
  }

  private feedCsi(cp: number): void {
    // Parameter byte
    if (cp >= 0x30 && cp <= 0x39) {
      // 0-9
      if (this.parserState === S.CsiEntry) this.parserState = S.CsiParam
      if (this.parserState === S.CsiIgnore) return
      this.csiCurrentParam = this.csiCurrentParam * 10 + (cp - 0x30)
      this.csiHasCurrentParam = true
      return
    }
    if (cp === 0x3b) {
      // ;
      if (this.parserState === S.CsiIgnore) return
      this.pushCsiParam()
      this.parserState = S.CsiParam
      return
    }
    // Prefix bytes (?, >, !, =) only valid in CsiEntry
    if (cp >= 0x3c && cp <= 0x3f) {
      if (this.parserState === S.CsiEntry) {
        this.csiPrefix += String.fromCharCode(cp)
      } else {
        this.parserState = S.CsiIgnore
      }
      return
    }
    // Intermediate bytes (0x20-0x2F)
    if (cp >= 0x20 && cp <= 0x2f) {
      this.parserState = S.CsiIntermediate
      this.csiIntermediates += String.fromCharCode(cp)
      return
    }
    // Final byte (0x40-0x7E)
    if (cp >= 0x40 && cp <= 0x7e) {
      if (this.parserState !== S.CsiIgnore) {
        this.pushCsiParam()
        this.dispatchCsi(cp)
      }
      this.parserState = S.Ground
      return
    }
    // Anything else: malformed sequence, abandon
    this.parserState = S.Ground
  }

  private pushCsiParam(): void {
    if (this.csiHasCurrentParam) {
      if (this.csiParams.length < MAX_CSI_PARAMS) {
        this.csiParams.push(this.csiCurrentParam)
      }
    } else if (this.csiParams.length < MAX_CSI_PARAMS) {
      this.csiParams.push(0)
    }
    this.csiCurrentParam = 0
    this.csiHasCurrentParam = false
  }

  private feedString(cp: number): void {
    if (this.oscPrevWasEsc) {
      this.oscPrevWasEsc = false
      if (cp === 0x5c) {
        // ST: ESC \ — end of string sequence
        this.parserState = S.Ground
        this.oscBuf = ''
        return
      }
      // Not ST — treat as a fresh ESC dispatch
      this.parserState = S.Escape
      this.feedEscape(cp)
      return
    }
    if (cp === 0x07) {
      // BEL terminator (OSC only, but tolerate it for any string seq)
      this.parserState = S.Ground
      this.oscBuf = ''
      return
    }
    if (this.parserState === S.OscString && this.oscBuf.length < MAX_OSC_LEN) {
      this.oscBuf += String.fromCodePoint(cp)
    }
  }

  /* ---------- CSI dispatch ---------- */

  private dispatchCsi(final: number): void {
    const p = (i: number, def = 1): number => {
      const v = this.csiParams[i]
      return v === undefined || v === 0 ? def : v
    }
    const p0 = (i: number, def = 0): number => this.csiParams[i] ?? def

    // Private prefix dispatch
    if (this.csiPrefix === '?') {
      // DECSET / DECRST
      if (final === 0x68 /* h */ || final === 0x6c /* l */) {
        this.handleDecMode(this.csiParams, final === 0x68)
        return
      }
      return
    }

    switch (final) {
      case 0x40: // @ — ICH (insert chars) — invalidate tabs in cursor row past col
        this.invalidateTabsInRange(this.cursorRow, this.cursorCol, this.colsCount)
        return
      case 0x41: // A — CUU
        this.cursorRow = Math.max(this.viewportTopAbs, this.cursorRow - p(0))
        return
      case 0x42: // B — CUD
        this.cursorRow = Math.min(this.viewportTopAbs + this.rowsCount - 1, this.cursorRow + p(0))
        return
      case 0x43: // C — CUF
        this.cursorCol = Math.min(this.colsCount - 1, this.cursorCol + p(0))
        return
      case 0x44: // D — CUB
        this.cursorCol = Math.max(0, this.cursorCol - p(0))
        return
      case 0x45: // E — CNL
        this.cursorCol = 0
        this.cursorRow = Math.min(this.viewportTopAbs + this.rowsCount - 1, this.cursorRow + p(0))
        return
      case 0x46: // F — CPL
        this.cursorCol = 0
        this.cursorRow = Math.max(this.viewportTopAbs, this.cursorRow - p(0))
        return
      case 0x47: // G — CHA — cursor horizontal absolute (1-based)
        this.cursorCol = Math.min(this.colsCount - 1, Math.max(0, p(0) - 1))
        return
      case 0x48: // H — CUP
      case 0x66: {
        // f — HVP
        const row = p(0)
        const col = p(1)
        this.cursorRow = this.viewportTopAbs + Math.min(this.rowsCount - 1, Math.max(0, row - 1))
        this.cursorCol = Math.min(this.colsCount - 1, Math.max(0, col - 1))
        return
      }
      case 0x4a: // J — ED
        this.handleEraseDisplay(p0(0))
        return
      case 0x4b: // K — EL
        this.handleEraseLine(p0(0))
        return
      case 0x4c: // L — IL (insert lines): invalidate tabs in cursor row downward
        this.invalidateTabsInRows(this.cursorRow, this.viewportTopAbs + this.rowsCount - 1)
        return
      case 0x4d: // M — DL (delete lines): same
        this.invalidateTabsInRows(this.cursorRow, this.viewportTopAbs + this.rowsCount - 1)
        return
      case 0x50: // P — DCH (delete chars): invalidate tabs in cursor row past col
        this.invalidateTabsInRange(this.cursorRow, this.cursorCol, this.colsCount)
        return
      case 0x53: // S — SU (scroll up)
        this.scrollUp(p(0))
        return
      case 0x54: // T — SD (scroll down)
        this.scrollDown(p(0))
        return
      case 0x58: // X — ECH (erase chars): invalidate tabs in cursor row in range
        this.invalidateTabsInRange(this.cursorRow, this.cursorCol, this.cursorCol + p(0))
        return
      case 0x64: // d — VPA — vertical position absolute (1-based)
        this.cursorRow = this.viewportTopAbs + Math.min(this.rowsCount - 1, Math.max(0, p(0) - 1))
        return
      case 0x72: {
        // r — DECSTBM — set scroll region (1-based, viewport-relative)
        const top = p(0)
        const bot = p(1, this.rowsCount)
        const t = Math.max(0, top - 1)
        const b = Math.min(this.rowsCount - 1, bot - 1)
        if (t < b) {
          this.scrollTopVp = t
          this.scrollBottomVp = b
        }
        // Cursor goes to home after DECSTBM
        this.cursorRow = this.viewportTopAbs
        this.cursorCol = 0
        return
      }
      case 0x73: // s — SCOSC save cursor
        this.savedCursorRow = this.cursorRow
        this.savedCursorCol = this.cursorCol
        return
      case 0x75: // u — SCORC restore cursor
        this.cursorRow = this.savedCursorRow
        this.cursorCol = this.savedCursorCol
        return
      // SGR (m), DSR (n), and others — ignored (don't move cursor)
      default:
        return
    }
  }

  private handleDecMode(params: number[], set: boolean): void {
    for (const code of params) {
      if (code === 1047 || code === 1049) {
        if (set !== this.isAlt) this.toggleAltBuffer(set)
      } else if (code === 1048) {
        if (set) {
          this.savedCursorRow = this.cursorRow
          this.savedCursorCol = this.cursorCol
        } else {
          this.cursorRow = this.savedCursorRow
          this.cursorCol = this.savedCursorCol
        }
      } else if (code === 47) {
        if (set !== this.isAlt) this.toggleAltBuffer(set)
      }
    }
  }

  /* ---------- Cell operations ---------- */

  private handleTab(): void {
    const startCol = this.cursorCol
    if (startCol >= this.colsCount) return
    const stop = Math.floor(startCol / this.tabSize + 1) * this.tabSize
    const targetCol = Math.min(stop, this.colsCount)
    const width = targetCol - startCol
    if (width <= 0) return
    const row = this.getOrCreateRow(this.cursorRow)
    if (row.tabs.length < MAX_TAB_SPANS_PER_ROW) {
      row.tabs.push({ col: startCol, width })
      // Keep sorted (cheap — we almost always append in order)
      const n = row.tabs.length
      const last = row.tabs[n - 1]
      const prev = n > 1 ? row.tabs[n - 2] : undefined
      if (last && prev && last.col < prev.col) {
        row.tabs.sort((a, b) => a.col - b.col)
      }
    }
    this.cursorCol = targetCol
  }

  private handlePrintable(cp: number): void {
    const w = wcwidth(cp)
    if (w === 0) return // combining mark, doesn't move cursor
    const startCol = this.cursorCol
    const endCol = Math.min(startCol + w, this.colsCount)
    if (startCol >= this.colsCount) return // at right edge — auto-wrap not modeled here
    this.invalidateTabsInRange(this.cursorRow, startCol, endCol)
    this.cursorCol = endCol
  }

  private handleLineFeed(): void {
    const viewportRelRow = this.cursorRow - this.viewportTopAbs
    if (viewportRelRow >= this.scrollBottomVp) {
      // Scroll up: top row of scroll region scrolls into scrollback (or out)
      this.viewportTopAbs += 1
      // If we just exceeded scrollback cap, evict
      const lowestKept = this.cursorRow - this.maxScrollback - this.rowsCount
      if (lowestKept >= this.firstAbsRow) {
        for (let r = this.firstAbsRow; r <= lowestKept; r++) {
          this.rows.delete(r)
        }
        this.firstAbsRow = lowestKept + 1
      }
      this.cursorRow += 1
    } else {
      this.cursorRow += 1
    }
  }

  private handleReverseIndex(): void {
    const viewportRelRow = this.cursorRow - this.viewportTopAbs
    if (viewportRelRow <= this.scrollTopVp) {
      // Scroll down: insert blank line at top of region; bottom drops off
      // We don't need to model individual cell content, just invalidate any
      // tab spans in the affected rows.
      const top = this.viewportTopAbs + this.scrollTopVp
      const bot = this.viewportTopAbs + this.scrollBottomVp
      this.invalidateTabsInRows(top, bot)
    } else {
      this.cursorRow -= 1
    }
  }

  private scrollUp(n: number): void {
    const top = this.viewportTopAbs + this.scrollTopVp
    const bot = this.viewportTopAbs + this.scrollBottomVp
    this.invalidateTabsInRows(top, top + Math.min(n, bot - top))
  }

  private scrollDown(n: number): void {
    const top = this.viewportTopAbs + this.scrollTopVp
    const bot = this.viewportTopAbs + this.scrollBottomVp
    this.invalidateTabsInRows(bot - Math.min(n, bot - top), bot)
  }

  private handleEraseDisplay(mode: number): void {
    const vpTop = this.viewportTopAbs
    const vpBot = this.viewportTopAbs + this.rowsCount - 1
    if (mode === 0) {
      // Cursor to end of display
      this.invalidateTabsInRange(this.cursorRow, this.cursorCol, this.colsCount)
      this.invalidateTabsInRows(this.cursorRow + 1, vpBot)
    } else if (mode === 1) {
      // Start of display to cursor
      this.invalidateTabsInRows(vpTop, this.cursorRow - 1)
      this.invalidateTabsInRange(this.cursorRow, 0, this.cursorCol + 1)
    } else if (mode === 2) {
      // Entire display
      this.invalidateTabsInRows(vpTop, vpBot)
    } else if (mode === 3) {
      // Entire display + scrollback
      for (const k of this.rows.keys()) {
        if (k <= vpBot) this.rows.delete(k)
      }
    }
  }

  private handleEraseLine(mode: number): void {
    if (mode === 0) {
      this.invalidateTabsInRange(this.cursorRow, this.cursorCol, this.colsCount)
    } else if (mode === 1) {
      this.invalidateTabsInRange(this.cursorRow, 0, this.cursorCol + 1)
    } else if (mode === 2) {
      const r = this.rows.get(this.cursorRow)
      if (r) r.tabs = []
    }
  }

  private invalidateTabsInRange(row: number, fromCol: number, toCol: number): void {
    const r = this.rows.get(row)
    if (!r || r.tabs.length === 0) return
    if (toCol <= fromCol) return
    r.tabs = r.tabs.filter((s) => s.col + s.width <= fromCol || s.col >= toCol)
  }

  private invalidateTabsInRows(fromRow: number, toRow: number): void {
    if (toRow < fromRow) return
    for (let r = fromRow; r <= toRow; r++) {
      const row = this.rows.get(r)
      if (row) row.tabs = []
    }
  }

  private getOrCreateRow(absRow: number): MirrorRow {
    let r = this.rows.get(absRow)
    if (!r) {
      r = { tabs: [] }
      this.rows.set(absRow, r)
    }
    return r
  }

  /* ---------- Alt buffer ---------- */

  private toggleAltBuffer(toAlt: boolean): void {
    if (toAlt && !this.isAlt) {
      this.mainSnapshot = {
        rows: this.rows,
        firstAbsRow: this.firstAbsRow,
        cursorRow: this.cursorRow,
        cursorCol: this.cursorCol,
        savedCursorRow: this.savedCursorRow,
        savedCursorCol: this.savedCursorCol,
        viewportTopAbs: this.viewportTopAbs,
        scrollTopVp: this.scrollTopVp,
        scrollBottomVp: this.scrollBottomVp,
      }
      this.rows = new Map()
      this.firstAbsRow = 0
      this.viewportTopAbs = 0
      this.cursorRow = 0
      this.cursorCol = 0
      this.savedCursorRow = 0
      this.savedCursorCol = 0
      this.scrollTopVp = 0
      this.scrollBottomVp = this.rowsCount - 1
      this.isAlt = true
    } else if (!toAlt && this.isAlt && this.mainSnapshot) {
      this.rows = this.mainSnapshot.rows
      this.firstAbsRow = this.mainSnapshot.firstAbsRow
      this.cursorRow = this.mainSnapshot.cursorRow
      this.cursorCol = this.mainSnapshot.cursorCol
      this.savedCursorRow = this.mainSnapshot.savedCursorRow
      this.savedCursorCol = this.mainSnapshot.savedCursorCol
      this.viewportTopAbs = this.mainSnapshot.viewportTopAbs
      this.scrollTopVp = this.mainSnapshot.scrollTopVp
      this.scrollBottomVp = this.mainSnapshot.scrollBottomVp
      this.mainSnapshot = null
      this.isAlt = false
    }
  }
}
