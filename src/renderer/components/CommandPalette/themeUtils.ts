import { THEME_IDS, type ThemeId } from '../../../shared/themes'

export interface ThemeOption {
  id: ThemeId
  label: string
  accent: string
}

export interface ThemeGroup {
  label: string
  themes: ThemeOption[]
}

/**
 * UI metadata for each theme. Keyed by ThemeId so adding a theme to
 * THEME_IDS in shared/themes triggers a TypeScript error here until the
 * label/accent pair is added.
 *
 * Accent hex values intentionally duplicate the `--accent` token defined for
 * each theme in `styles/tokens.css`. They are read by the theme picker
 * (CommandPalette) before the theme is applied to the document, so resolving
 * them via getComputedStyle would require a hidden probe element per theme.
 * Keep this map in sync with the `--accent` declaration per [data-theme=...]
 * block in tokens.css.
 */
const THEME_METADATA: Record<ThemeId, { label: string; accent: string }> = {
  '': { label: 'Tungsten', accent: '#f5a623' },
  phosphor: { label: 'Phosphor', accent: '#4aff90' },
  dusk: { label: 'Dusk', accent: '#c49cff' },
}

export const THEME_GROUPS: ThemeGroup[] = [
  {
    label: 'Themes',
    themes: THEME_IDS.map((id) => ({ id, ...THEME_METADATA[id] })),
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
