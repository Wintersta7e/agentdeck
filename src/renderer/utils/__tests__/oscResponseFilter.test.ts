import { describe, it, expect } from 'vitest'
import { OSC_RESPONSE_RE } from '../terminal-utils'

/** Helper: strip OSC sequences using the exported regex */
function stripOsc(input: string): string {
  return input.replace(OSC_RESPONSE_RE, '')
}

describe('OSC_RESPONSE_RE', () => {
  it('filters BEL-terminated OSC sequences', () => {
    expect(stripOsc('\x1b]10;rgb:ffff/ffff/ffff\x07')).toBe('')
  })

  it('filters ST-terminated OSC sequences', () => {
    expect(stripOsc('\x1b]11;rgb:0000/0000/0000\x1b\\')).toBe('')
  })

  it('preserves normal text without OSC sequences', () => {
    const text = 'Hello, world! Regular terminal output.'
    expect(stripOsc(text)).toBe(text)
  })

  it('filters OSC from mixed content', () => {
    const input = 'before\x1b]10;rgb:abcd/1234/5678\x07after'
    expect(stripOsc(input)).toBe('beforeafter')
  })

  it('filters multiple OSC sequences in one string', () => {
    const input = 'start\x1b]10;rgb:aaaa/bbbb/cccc\x07middle\x1b]11;rgb:0000/0000/0000\x1b\\end'
    expect(stripOsc(input)).toBe('startmiddleend')
  })
})
