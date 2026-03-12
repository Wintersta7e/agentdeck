import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EnergyVein } from './EnergyVein'

describe('EnergyVein', () => {
  it('renders an SVG', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={3} speed={0.3} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders the correct number of paths', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={3} speed={0.5} />)
    expect(container.querySelectorAll('path').length).toBe(3)
  })

  it('pauses animation when speed is 0', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={2} speed={0} />)
    container.querySelectorAll('path').forEach((p) => {
      expect(p.style.animationPlayState).toBe('paused')
    })
  })

  it('sets animation duration based on speed', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={1} speed={1} />)
    const path = container.querySelector('path') as SVGPathElement
    expect(path.style.animationDuration).toBe('12s')
  })

  it('is non-interactive and absolutely positioned', () => {
    const { container } = render(<EnergyVein color="#f5a623" count={2} speed={0.3} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.style.pointerEvents).toBe('none')
    expect(svg.style.position).toBe('absolute')
  })
})
