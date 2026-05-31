import { describe, it, expect } from 'vitest'
import { SAFE_ID_RE, MAX_SAFE_ID_LEN, validateId } from './validation'

describe('SAFE_ID_RE', () => {
  it.each([
    ['abc'],
    ['ABC'],
    ['0'],
    ['snake_case'],
    ['kebab-case'],
    ['Mixed-123_underscore'],
    ['a'.repeat(128)],
  ])('accepts safe id %p', (id) => {
    expect(SAFE_ID_RE.test(id)).toBe(true)
  })

  it.each([
    [''],
    [' '],
    ['has space'],
    ['./traversal'],
    ['../up'],
    ['/abs'],
    ['back\\slash'],
    ['dot.in.middle'],
    ['unicode-é'],
    ['unicode-中'],
    ['null\0byte'],
    ['tab\tchar'],
    ['newline\n'],
    ['quote"x'],
    ["apos'x"],
    ['semi;colon'],
    ['pipe|x'],
    ['amp&x'],
    ['paren(x)'],
    ['brace{x}'],
    ['bracket[x]'],
  ])('rejects unsafe id %p', (id) => {
    expect(SAFE_ID_RE.test(id)).toBe(false)
  })
})

describe('MAX_SAFE_ID_LEN', () => {
  it('is exactly 128', () => {
    // Pinning this — many call sites depend on the upper bound and a silent
    // change here would alter IPC contract behaviour across the codebase.
    expect(MAX_SAFE_ID_LEN).toBe(128)
  })
})

describe('validateId', () => {
  it('returns the validated id unchanged when safe', () => {
    expect(validateId('valid-id_42')).toBe('valid-id_42')
  })

  it('uses the kind label in the thrown error', () => {
    expect(() => validateId('./bad', 'workflowId')).toThrow(/workflowId/)
  })

  it('defaults the kind label to "id"', () => {
    expect(() => validateId('./bad')).toThrow(/id/)
  })

  it.each([
    [undefined, 'non-string'],
    [null, 'null'],
    [42, 'number'],
    [{}, 'object'],
    [[], 'array'],
    [true, 'boolean'],
  ] as const)('rejects %p (%s)', (value, _label) => {
    expect(() => validateId(value)).toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => validateId('')).toThrow()
  })

  it('rejects an id longer than MAX_SAFE_ID_LEN', () => {
    const tooLong = 'a'.repeat(MAX_SAFE_ID_LEN + 1)
    expect(() => validateId(tooLong)).toThrow()
  })

  it('accepts an id at exactly MAX_SAFE_ID_LEN', () => {
    const limit = 'a'.repeat(MAX_SAFE_ID_LEN)
    expect(validateId(limit)).toBe(limit)
  })

  it('rejects path-traversal characters', () => {
    expect(() => validateId('../etc/passwd')).toThrow()
    expect(() => validateId('a/b')).toThrow()
    expect(() => validateId('a\\b')).toThrow()
  })

  it('rejects whitespace-only and whitespace-padded ids', () => {
    expect(() => validateId('   ')).toThrow()
    expect(() => validateId(' valid ')).toThrow()
    expect(() => validateId('valid\t')).toThrow()
  })
})
