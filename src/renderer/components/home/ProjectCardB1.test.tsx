import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ProjectCardB1 } from './ProjectCardB1'
import { useAppStore } from '../../store/appStore'
import type { Project } from '../../../shared/types'
import type { AgentDescriptorWire } from '../../../shared/custom-agents'

const customAgent: AgentDescriptorWire = {
  id: 'my-bot',
  binary: 'mybot',
  name: 'My Custom Bot',
  icon: '★',
  short: 'MB',
  colorVar: '--green',
  description: 'A user-defined console agent',
  contextWindow: 0,
  source: 'user',
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Proj One',
    path: '/repo/one',
    ...over,
  } as Project
}

describe('ProjectCardB1', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      agentRegistry: [...useAppStore.getInitialState().agentRegistry, customAgent],
    } as never)
  })

  it('renders a custom default agent glyph (no longer filtered out)', () => {
    const p = project({
      agents: [{ agent: 'my-bot' as never, isDefault: true }],
    })
    const { container } = render(<ProjectCardB1 project={p} onOpen={vi.fn()} />)
    const glyphs = container.querySelectorAll('.pc-b1__agent-glyph')
    // Previously `.filter((a) => a.agent)` dropped non-builtin agents → 0 glyphs.
    expect(glyphs).toHaveLength(1)
    const glyph = glyphs[0] as HTMLElement
    expect(glyph.textContent).toBe('★')
    expect(glyph.style.getPropertyValue('--glyph-color')).toBe('var(--green)')
  })

  it('still renders built-in agent glyphs', () => {
    const p = project({
      agents: [{ agent: 'claude-code', isDefault: true }],
    })
    const { container } = render(<ProjectCardB1 project={p} onOpen={vi.fn()} />)
    const glyphs = container.querySelectorAll('.pc-b1__agent-glyph')
    expect(glyphs).toHaveLength(1)
    expect((glyphs[0] as HTMLElement).textContent).toBe('⬡')
  })
})
