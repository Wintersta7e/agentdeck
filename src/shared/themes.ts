/**
 * Shared theme metadata.
 *
 * AgentDeck v6.x ships three themes — the empty-string id is the default
 * "Tungsten" palette, with `phosphor` and `dusk` as alternates. Tokens are
 * defined in `src/renderer/styles/tokens.css`; the renderer-facing label
 * registry lives in `src/renderer/components/CommandPalette/themeUtils.ts`.
 *
 * @invariant THEME_STARTUP_BG keys must match the `[data-theme='...']`
 * selectors in `tokens.css`. Each value must equal the `--bg0` hex
 * declared in that theme's block. When you add or rename a theme, update
 * both files together — there is no compile-time check that they agree.
 */

export const THEME_IDS = ['', 'phosphor', 'dusk'] as const

export type ThemeId = (typeof THEME_IDS)[number]

/**
 * `--bg0` value per theme, used by the main process to set the
 * BrowserWindow's background color before the renderer mounts. This
 * eliminates the white-flash effect during app startup. The empty-string
 * id is the default Tungsten palette.
 */
export const THEME_STARTUP_BG: Readonly<Record<ThemeId, string>> = Object.freeze({
  '': '#100d0b',
  phosphor: '#05080a',
  dusk: '#0d0812',
})

/** Conservative fallback when persisted theme is unreadable or unknown. */
export const DEFAULT_STARTUP_BG = '#100d0b'
