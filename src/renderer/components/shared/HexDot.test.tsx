import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HexDot } from './HexDot'

describe('HexDot', () => {
  it('renders an SVG with a polygon', () => {
    const { container } = render(<HexDot status="idle" size={8} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('polygon')).not.toBeNull()
  })

  it('applies live class for running status', () => {
    const { container } = render(<HexDot status="live" size={8} />)
    expect(container.querySelector('svg')?.classList.contains('hex-dot--live')).toBe(true)
  })

  it('applies error class for error status', () => {
    const { container } = render(<HexDot status="error" size={8} />)
    expect(container.querySelector('svg')?.classList.contains('hex-dot--error')).toBe(true)
  })

  it('applies idle class for idle status', () => {
    const { container } = render(<HexDot status="idle" size={8} />)
    expect(container.querySelector('svg')?.classList.contains('hex-dot--idle')).toBe(true)
  })

  it('sets viewBox and dimensions from size prop', () => {
    const { container } = render(<HexDot status="live" size={12} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('width')).toBe('12')
    expect(svg.getAttribute('height')).toBe('14')
  })
})
