import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelBox } from './PanelBox'

describe('PanelBox', () => {
  it('renders children', () => {
    render(
      <PanelBox corners={['tl']} glow="none">
        Hello
      </PanelBox>,
    )
    expect(screen.getByText('Hello')).not.toBeNull()
  })

  it('renders corner accents for each specified corner', () => {
    const { container } = render(
      <PanelBox corners={['tl', 'br']} glow="none">
        Content
      </PanelBox>,
    )
    expect(container.querySelector('.corner-accent--tl')).not.toBeNull()
    expect(container.querySelector('.corner-accent--br')).not.toBeNull()
    expect(container.querySelector('.corner-accent--tr')).toBeNull()
    expect(container.querySelector('.corner-accent--bl')).toBeNull()
  })

  it('renders all four corners when corners="all"', () => {
    const { container } = render(
      <PanelBox corners="all" glow="none">
        Content
      </PanelBox>,
    )
    expect(container.querySelector('.corner-accent--tl')).not.toBeNull()
    expect(container.querySelector('.corner-accent--tr')).not.toBeNull()
    expect(container.querySelector('.corner-accent--bl')).not.toBeNull()
    expect(container.querySelector('.corner-accent--br')).not.toBeNull()
  })

  it('applies glow class', () => {
    const { container } = render(
      <PanelBox corners={['tl']} glow="left">
        Content
      </PanelBox>,
    )
    expect(container.querySelector('.panel-box')?.classList.contains('panel-box--glow-left')).toBe(
      true,
    )
  })

  it('applies custom className', () => {
    const { container } = render(
      <PanelBox corners={['tl']} glow="none" className="my-class">
        Content
      </PanelBox>,
    )
    expect(container.querySelector('.panel-box')?.classList.contains('my-class')).toBe(true)
  })

  it('passes intensity to corner accents', () => {
    const { container } = render(
      <PanelBox corners={['tl']} glow="none" intensity={0.8}>
        Content
      </PanelBox>,
    )
    const accent = container.querySelector('.corner-accent') as HTMLElement
    expect(accent.style.getPropertyValue('--ca-intensity')).toBe('0.8')
  })

  it('applies pulse class when pulse prop is true', () => {
    const { container } = render(
      <PanelBox corners={['tl']} glow="none" pulse>
        Content
      </PanelBox>,
    )
    expect(container.querySelector('.panel-box')?.classList.contains('panel-box--pulse')).toBe(true)
  })
})
