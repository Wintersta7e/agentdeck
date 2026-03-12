import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CornerAccent } from './CornerAccent'

describe('CornerAccent', () => {
  it('renders with correct position class', () => {
    const { container } = render(<CornerAccent position="tl" />)
    const el = container.querySelector('.corner-accent')
    expect(el).not.toBeNull()
    expect(el?.classList.contains('corner-accent--tl')).toBe(true)
  })

  it('applies custom size via CSS variable', () => {
    const { container } = render(<CornerAccent position="br" size={30} />)
    const el = container.querySelector('.corner-accent') as HTMLElement
    expect(el.style.getPropertyValue('--ca-size')).toBe('30px')
  })

  it('applies custom intensity via CSS variable', () => {
    const { container } = render(<CornerAccent position="tl" intensity={0.5} />)
    const el = container.querySelector('.corner-accent') as HTMLElement
    expect(el.style.getPropertyValue('--ca-intensity')).toBe('0.5')
  })

  it('uses default size and intensity when not provided', () => {
    const { container } = render(<CornerAccent position="tr" />)
    const el = container.querySelector('.corner-accent') as HTMLElement
    expect(el.style.getPropertyValue('--ca-size')).toBe('')
    expect(el.style.getPropertyValue('--ca-intensity')).toBe('')
  })
})
