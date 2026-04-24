import { describe, expect, it } from 'vitest'
import { inferContextFromModelId } from './model-heuristic'

describe('inferContextFromModelId', () => {
  describe('bracket tag', () => {
    it('[1m] → 1M', () => expect(inferContextFromModelId('foo[1m]')).toBe(1_000_000))
    it('[2m] → 2M', () => expect(inferContextFromModelId('foo[2m]')).toBe(2_000_000))
    it('[128k] → 128K', () => expect(inferContextFromModelId('foo[128k]')).toBe(128_000))
    it('[1M] case-insensitive', () => expect(inferContextFromModelId('foo[1M]')).toBe(1_000_000))
  })
  describe('trailing dash suffix', () => {
    it('-128k at end', () => expect(inferContextFromModelId('gpt-7o-128k')).toBe(128_000))
    it('-1m at end', () => expect(inferContextFromModelId('some-model-1m')).toBe(1_000_000))
  })
  describe('colon suffix', () => {
    it(':1m', () => expect(inferContextFromModelId('some-model:1m')).toBe(1_000_000))
    it(':200k', () => expect(inferContextFromModelId('some-model:200k')).toBe(200_000))
  })
  describe('rejections', () => {
    it('rejects bare version numbers', () => {
      expect(inferContextFromModelId('gpt-4o-2026-03')).toBeUndefined()
      expect(inferContextFromModelId('gemini-2.5-pro')).toBeUndefined()
    })
    it('rejects empty', () => expect(inferContextFromModelId('')).toBeUndefined())
    it('returns undefined for unrelated', () =>
      expect(inferContextFromModelId('claude-opus-4-7')).toBeUndefined())
  })
  describe('ReDoS safety', () => {
    it('linear on 10 KB inputs', () => {
      const payloads = [
        'a'.repeat(10_000) + '[1m]',
        'a'.repeat(10_000) + '-128k',
        'a'.repeat(10_000) + ':1m',
      ]
      for (const p of payloads) {
        const start = performance.now()
        inferContextFromModelId(p)
        expect(performance.now() - start).toBeLessThan(10)
      }
    })
  })
})
