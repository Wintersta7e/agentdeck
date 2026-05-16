import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { KbdHint } from './KbdHint'

describe('KbdHint', () => {
  it('renders a single key as one pill', () => {
    const { container } = render(<KbdHint keys="ESC" />)
    expect(container.querySelectorAll('.kbd-hint-key')).toHaveLength(1)
    expect(container.querySelector('.kbd-hint-key')?.textContent).toBe('ESC')
    expect(container.querySelectorAll('.kbd-hint-sep')).toHaveLength(0)
  })

  it('splits Ctrl+N into two keys with a + separator', () => {
    const { container } = render(<KbdHint keys="Ctrl+N" />)
    const keys = Array.from(container.querySelectorAll('.kbd-hint-key')).map((e) => e.textContent)
    const seps = Array.from(container.querySelectorAll('.kbd-hint-sep')).map((e) => e.textContent)
    expect(keys).toEqual(['Ctrl', 'N'])
    expect(seps).toEqual(['+'])
  })

  it('splits Ctrl+Shift+F into three keys', () => {
    const { container } = render(<KbdHint keys="Ctrl+Shift+F" />)
    const keys = Array.from(container.querySelectorAll('.kbd-hint-key')).map((e) => e.textContent)
    expect(keys).toEqual(['Ctrl', 'Shift', 'F'])
    expect(container.querySelectorAll('.kbd-hint-sep')).toHaveLength(2)
  })

  it('renders Ctrl+1 / 2 / 3 with / separators between alternates', () => {
    const { container } = render(<KbdHint keys="Ctrl+1 / 2 / 3" />)
    const keys = Array.from(container.querySelectorAll('.kbd-hint-key')).map((e) => e.textContent)
    const seps = Array.from(container.querySelectorAll('.kbd-hint-sep')).map((e) => e.textContent)
    expect(keys).toEqual(['Ctrl', '1', '2', '3'])
    expect(seps).toEqual(['+', '/', '/'])
  })

  it('tolerates spaces around + (e.g. "Ctrl + S")', () => {
    const { container } = render(<KbdHint keys="Ctrl + S" />)
    const keys = Array.from(container.querySelectorAll('.kbd-hint-key')).map((e) => e.textContent)
    expect(keys).toEqual(['Ctrl', 'S'])
  })

  it('applies the size modifier class', () => {
    const { container } = render(<KbdHint keys="ESC" size="md" />)
    expect(container.querySelector('.kbd-hint')?.classList.contains('kbd-hint-md')).toBe(true)
  })
})
