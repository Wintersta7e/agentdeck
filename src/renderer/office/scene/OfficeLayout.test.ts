import { describe, it, expect } from 'vitest'
import { getDeskPositions, getOfficeZones } from './OfficeLayout'

describe('OfficeLayout', () => {
  // COV-10: Desk count must match MAX_DESKS = 20 in the registry
  it('generates exactly 20 desk positions', () => {
    const desks = getDeskPositions()
    expect(desks).toHaveLength(20)
  })

  it('desk indices are sequential 0-19', () => {
    const desks = getDeskPositions()
    const indices = desks.map((d) => d.index).sort((a, b) => a - b)
    expect(indices).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('all desk indices are unique', () => {
    const desks = getDeskPositions()
    const indexSet = new Set(desks.map((d) => d.index))
    expect(indexSet.size).toBe(20)
  })

  it('getOfficeZones returns at least a floor zone', () => {
    const zones = getOfficeZones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones.find((z) => z.name === 'floor')).toBeDefined()
  })
})
