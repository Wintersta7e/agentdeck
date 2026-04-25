import { describe, it, expect } from 'vitest'
import { getXtermTheme, BASE_XTERM_THEME, XTERM_THEME_OVERRIDES } from './terminal-utils'

describe('getXtermTheme', () => {
  it('applies the tungsten default overrides for empty themeId', () => {
    const theme = getXtermTheme('')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['']?.foreground)
  })

  it('returns base theme for unknown themeId', () => {
    const theme = getXtermTheme('nonexistent-theme-id')
    expect(theme.background).toBe(BASE_XTERM_THEME.background)
    expect(theme.foreground).toBe(BASE_XTERM_THEME.foreground)
  })

  it('applies phosphor overrides', () => {
    const theme = getXtermTheme('phosphor')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['phosphor']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['phosphor']?.foreground)
  })

  it('applies dusk overrides', () => {
    const theme = getXtermTheme('dusk')
    expect(theme.background).toBe(XTERM_THEME_OVERRIDES['dusk']?.background)
    expect(theme.foreground).toBe(XTERM_THEME_OVERRIDES['dusk']?.foreground)
  })

  it('does not mutate BASE_XTERM_THEME', () => {
    const bgBefore = BASE_XTERM_THEME.background
    const fgBefore = BASE_XTERM_THEME.foreground
    getXtermTheme('phosphor')
    getXtermTheme('dusk')
    expect(BASE_XTERM_THEME.background).toBe(bgBefore)
    expect(BASE_XTERM_THEME.foreground).toBe(fgBefore)
  })

  it('returns a new object on each call', () => {
    const a = getXtermTheme('phosphor')
    const b = getXtermTheme('phosphor')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
