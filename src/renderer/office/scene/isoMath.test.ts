import { describe, it, expect } from 'vitest'
import { toIso, fromIso, TILE_W, TILE_H } from './isoMath'

describe('isoMath', () => {
  it('converts origin (0,0) to screen (0,0)', () => {
    const { x, y } = toIso(0, 0)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('converts (1,0) correctly', () => {
    const { x, y } = toIso(1, 0)
    expect(x).toBe(TILE_W / 2)
    expect(y).toBe(TILE_H / 2)
  })

  it('converts (0,1) correctly', () => {
    const { x, y } = toIso(0, 1)
    expect(x).toBe(-TILE_W / 2)
    expect(y).toBe(TILE_H / 2)
  })

  it('round-trips through toIso and fromIso', () => {
    const col = 3
    const row = 5
    const { x, y } = toIso(col, row)
    const back = fromIso(x, y)
    expect(back.col).toBeCloseTo(col, 5)
    expect(back.row).toBeCloseTo(row, 5)
  })
})
