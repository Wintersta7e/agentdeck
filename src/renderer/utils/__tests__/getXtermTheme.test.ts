import { describe, it, expect } from 'vitest'
import { getXtermTheme, BASE_XTERM_THEME, XTERM_THEME_OVERRIDES } from '../terminal-utils'

describe('getXtermTheme', () => {
  it('returns base theme for empty string themeId', () => {
    const theme = getXtermTheme('')
    expect(theme.background).toBe(BASE_XTERM_THEME.background)
    expect(theme.foreground).toBe(BASE_XTERM_THEME.foreground)
  })

  it('returns base theme for unknown themeId', () => {
    const theme = getXtermTheme('nonexistent-theme-id')
    expect(theme.background).toBe(BASE_XTERM_THEME.background)
    expect(theme.foreground).toBe(BASE_XTERM_THEME.foreground)
  })

  it('applies cyan overrides', () => {
    const theme = getXtermTheme('cyan')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['cyan']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['cyan']?.foreground)
  })

  it('applies violet overrides', () => {
    const theme = getXtermTheme('violet')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['violet']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['violet']?.foreground)
  })

  it('applies ice overrides', () => {
    const theme = getXtermTheme('ice')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['ice']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['ice']?.foreground)
  })

  it('applies parchment (light theme) overrides', () => {
    const theme = getXtermTheme('parchment')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['parchment']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['parchment']?.foreground)
  })

  it('does not mutate BASE_XTERM_THEME', () => {
    const bgBefore = BASE_XTERM_THEME.background
    const fgBefore = BASE_XTERM_THEME.foreground
    getXtermTheme('cyan')
    getXtermTheme('violet')
    expect(BASE_XTERM_THEME.background).toBe(bgBefore)
    expect(BASE_XTERM_THEME.foreground).toBe(fgBefore)
  })

  it('returns a new object on each call', () => {
    const a = getXtermTheme('cyan')
    const b = getXtermTheme('cyan')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
