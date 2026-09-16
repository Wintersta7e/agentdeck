import { describe, it, expect } from 'vitest'
import { errText } from './errors'

describe('errText', () => {
  it('uses the message of an Error', () => {
    expect(errText(new Error('boom'))).toBe('boom')
  })

  it('serialises a rejected plain object instead of "[object Object]"', () => {
    expect(errText({ code: 'ENOENT', path: '/tmp/x' })).toBe('{"code":"ENOENT","path":"/tmp/x"}')
  })

  it('reports an unserialisable object rather than throwing', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(errText(circular)).toBe('[unserializable]')
  })

  it('falls back to String() for a non-object, non-Error value', () => {
    expect(errText(Symbol('sig'))).toBe('Symbol(sig)')
  })

  it('stringifies primitives and nullish values', () => {
    expect(errText('plain')).toBe('plain')
    expect(errText(42)).toBe('42')
    expect(errText(undefined)).toBe('undefined')
    expect(errText(null)).toBe('null')
  })
})
