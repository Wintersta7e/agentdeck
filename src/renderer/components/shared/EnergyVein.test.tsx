import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EnergyVein } from './EnergyVein'

describe('EnergyVein', () => {
  it('renders an SVG', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={3} speed={0.3} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders two layers per path (base + highlight)', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={3} speed={0.5} />)
    // 3 paths × 2 layers each = 6 path elements
    expect(container.querySelectorAll('path').length).toBe(6)
    // 3 groups
    expect(container.querySelectorAll('g').length).toBe(3)
  })

  it('pauses animation when speed is 0', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={2} speed={0} />)
    // Highlight layer (2nd path per group) has animation
    const groups = container.querySelectorAll('g')
    groups.forEach((g) => {
      const paths = g.querySelectorAll('path')
      const highlight = paths[1]
      if (!highlight) throw new Error('Expected highlight path')
      expect(highlight.style.animationPlayState).toBe('paused')
    })
  })

  it('sets animation duration based on speed', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={1} speed={1} />)
    // speed=1 → duration = 8 + (1-1)*20 = 8s
    const group = container.querySelector('g') as SVGGElement
    const highlight = group.querySelectorAll('path')[1]
    if (!highlight) throw new Error('Expected highlight path')
    expect(highlight.style.animationDuration).toBe('8s')
  })

  it('is non-interactive and absolutely positioned', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={2} speed={0.3} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.style.pointerEvents).toBe('none')
    expect(svg.style.position).toBe('absolute')
  })
})
