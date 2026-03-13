import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HexGrid } from './HexGrid'

describe('HexGrid', () => {
  it('renders an SVG with a pattern and rect', () => {
    const { container } = render(<HexGrid rotation={15} opacity={0.02} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('pattern')).not.toBeNull()
    expect(container.querySelector('rect')).not.toBeNull()
  })

  it('applies rotation to patternTransform', () => {
    const { container } = render(<HexGrid rotation={30} opacity={0.02} />)
    expect(container.querySelector('pattern')?.getAttribute('patternTransform')).toBe('rotate(30)')
  })

  it('applies opacity to SVG element', () => {
    const { container } = render(<HexGrid rotation={15} opacity={0.05} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.style.opacity).toBe('0.05')
  })

  it('is positioned absolute and non-interactive', () => {
    const { container } = render(<HexGrid rotation={15} opacity={0.02} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.style.pointerEvents).toBe('none')
    expect(svg.style.position).toBe('absolute')
  })
})
