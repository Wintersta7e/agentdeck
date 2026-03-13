import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AmbientGlow } from './AmbientGlow'

describe('AmbientGlow', () => {
  it('renders a div', () => {
    const { container } = render(
      <AmbientGlow color="#f5a623" position={[30, 20]} size={300} skew={-15} />,
    )
    expect(container.querySelector('.ambient-glow')).not.toBeNull()
  })

  it('applies position as percentage', () => {
    const { container } = render(
      <AmbientGlow color="#f5a623" position={[25, 50]} size={200} skew={0} />,
    )
    const el = container.querySelector('.ambient-glow') as HTMLElement
    expect(el.style.left).toBe('25%')
    expect(el.style.top).toBe('50%')
  })

  it('applies size in pixels', () => {
    const { container } = render(
      <AmbientGlow color="#f5a623" position={[0, 0]} size={400} skew={0} />,
    )
    const el = container.querySelector('.ambient-glow') as HTMLElement
    expect(el.style.width).toBe('400px')
    expect(el.style.height).toBe('400px')
  })

  it('applies skew transform', () => {
    const { container } = render(
      <AmbientGlow color="#f5a623" position={[50, 50]} size={200} skew={-12} />,
    )
    const el = container.querySelector('.ambient-glow') as HTMLElement
    expect(el.style.transform).toContain('skewX(-12deg)')
  })

  it('is non-interactive and absolutely positioned', () => {
    const { container } = render(
      <AmbientGlow color="#f5a623" position={[50, 50]} size={200} skew={0} />,
    )
    const el = container.querySelector('.ambient-glow') as HTMLElement
    expect(el.style.position).toBe('absolute')
    expect(el.style.pointerEvents).toBe('none')
  })
})
