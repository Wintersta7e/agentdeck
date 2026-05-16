import { describe, expect, it } from 'vitest'
import {
  getClaudePricing,
  getCodexPricing,
  PRICING_METADATA,
  type ModelRate,
} from './model-pricing'

describe('model-pricing JSON', () => {
  it('exposes metadata: lastUpdated, currency, perTokens', () => {
    expect(PRICING_METADATA.currency).toBe('USD')
    expect(PRICING_METADATA.perTokens).toBe(1_000_000)
    expect(PRICING_METADATA.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  describe('getClaudePricing', () => {
    it('matches opus by substring (e.g. claude-opus-4-7)', () => {
      const rate = getClaudePricing('claude-opus-4-7')
      expect(rate).toBeDefined()
      expect(rate?.outputPer1M).toBeGreaterThan(rate?.inputPer1M ?? 0)
    })

    it('matches sonnet across version variants', () => {
      const a = getClaudePricing('claude-sonnet-4-6')
      const b = getClaudePricing('claude-sonnet-4-5')
      expect(a).toEqual(b)
    })

    it('matches haiku (cheapest tier)', () => {
      const haiku = getClaudePricing('claude-haiku-4-5')
      const opus = getClaudePricing('claude-opus-4-7')
      expect(haiku?.inputPer1M).toBeLessThan(opus?.inputPer1M ?? Infinity)
    })

    it('returns undefined for unknown models', () => {
      expect(getClaudePricing('gpt-4o')).toBeUndefined()
      expect(getClaudePricing('')).toBeUndefined()
    })
  })

  describe('getCodexPricing', () => {
    it('matches gpt-4o exactly', () => {
      const rate = getCodexPricing('gpt-4o')
      expect(rate).toBeDefined()
      expect(rate?.outputPer1M).toBeGreaterThan(rate?.inputPer1M ?? 0)
    })

    it('matches gpt-5.4 (current codex default)', () => {
      const rate = getCodexPricing('gpt-5.4')
      expect(rate).toBeDefined()
    })

    it('returns undefined for unknown models', () => {
      expect(getCodexPricing('claude-opus')).toBeUndefined()
      expect(getCodexPricing('')).toBeUndefined()
    })
  })

  it('all rates are positive finite numbers', () => {
    const allRates: ModelRate[] = [
      getClaudePricing('claude-opus-4-7'),
      getClaudePricing('claude-sonnet-4-6'),
      getClaudePricing('claude-haiku-4-5'),
      getCodexPricing('gpt-4o'),
      getCodexPricing('gpt-5.4'),
    ].filter((r): r is ModelRate => r !== undefined)

    for (const r of allRates) {
      expect(r.inputPer1M).toBeGreaterThan(0)
      expect(r.outputPer1M).toBeGreaterThan(0)
      expect(Number.isFinite(r.inputPer1M)).toBe(true)
      expect(Number.isFinite(r.outputPer1M)).toBe(true)
    }
  })
})
