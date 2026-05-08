/**
 * Shared theme metadata.
 *
 * AgentDeck ships 8 themes (4 dark + 4 light) defined as CSS custom-property
 * blocks in `src/renderer/styles/tokens.css` — see `[data-theme="..."]`.
 * This module exists so non-renderer code (the Electron main process) can
 * read theme-related constants without parsing CSS at runtime.
 *
 * @invariant THEME_STARTUP_BG keys must match the `[data-theme="..."]`
 * selectors in `tokens.css`. Each value must equal the `--bg0` hex declared
 * in that theme's block. When you add or rename a theme, update both files
 * together — there is no compile-time check that they agree.
 */

export const THEME_IDS = [
  'amber',
  'cyan',
  'violet',
  'ice',
  'parchment',
  'fog',
  'lavender',
  'stone',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

/**
 * `--bg0` value per theme, used by the main process to set the
 * BrowserWindow's background color before the renderer mounts. This
 * eliminates the white-flash effect during app startup. Empty-string key is
 * the pre-theme-migration fallback (defaults to the historical dark base).
 */
export const THEME_STARTUP_BG: Readonly<Record<ThemeId | '', string>> = Object.freeze({
  '': '#0d0e0f',
  amber: '#0d0e0f',
  cyan: '#080b14',
  violet: '#0a0a12',
  ice: '#0c0d10',
  parchment: '#f5f0e8',
  fog: '#f0f4f8',
  lavender: '#f4f2f8',
  stone: '#f2f1ef',
})

/** Conservative fallback when persisted theme is unreadable or unknown. */
export const DEFAULT_STARTUP_BG = '#0d0e0f'
