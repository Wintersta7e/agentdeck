export interface ThemeOption {
  id: string
  label: string
  accent: string
}

export interface ThemeGroup {
  label: string
  themes: ThemeOption[]
}

export const THEME_GROUPS: ThemeGroup[] = [
  {
    label: 'Themes',
    themes: [
      { id: '', label: 'Tungsten', accent: '#f5a623' },
      { id: 'phosphor', label: 'Phosphor', accent: '#4aff90' },
      { id: 'dusk', label: 'Dusk', accent: '#c49cff' },
    ],
  },
]

export const ALL_THEMES: ThemeOption[] = THEME_GROUPS.flatMap((g) => g.themes)

/**
 * Apply a theme using the View Transition API (circular clip reveal).
 * Falls back to instant swap when View Transitions are unavailable.
 */
export function applyThemeWithTransition(
  themeId: string,
  onApply?: () => void,
  x?: number,
  y?: number,
): void {
  const apply = (): void => {
    document.documentElement.dataset.theme = themeId
    onApply?.()
  }

  if (!document.startViewTransition) {
    apply()
    return
  }

  // Set custom properties for the circular clip origin
  document.documentElement.style.setProperty('--reveal-x', `${x ?? window.innerWidth / 2}px`)
  document.documentElement.style.setProperty('--reveal-y', `${y ?? window.innerHeight / 2}px`)

  const transition = document.startViewTransition({
    update: apply,
    types: ['theme-reveal'],
  })
  const cleanupRevealProps = (): void => {
    document.documentElement.style.removeProperty('--reveal-x')
    document.documentElement.style.removeProperty('--reveal-y')
  }
  transition.finished.then(cleanupRevealProps).catch(cleanupRevealProps)
}
