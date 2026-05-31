import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { SearchAddon } from '@xterm/addon-search'
import type { WebglAddon } from '@xterm/addon-webgl'
import { TerminalGridMirror } from '../../utils/terminal-grid-mirror'

export interface CachedTerminal {
  term: Terminal
  fit: FitAddon
  webgl: WebglAddon | null
  search: SearchAddon | null
  hiddenBuffer: string[]
  mirror: TerminalGridMirror
}

// Module-scoped maps shared between TerminalPane's effect cleanup, its remount
// path, and external close handlers (session-close.ts, the sessions slice
// eviction path). Keeping them here lets non-component utilities dispose
// cached terminals without importing the component file.
export const terminalCache = new Map<string, CachedTerminal>()
export const searchAddonMap = new Map<string, SearchAddon>()

/**
 * Dispose any cached xterm + addons for `sessionId` and clear the search-addon
 * lookup. Safe to call when no entry exists. Call this from any path that
 * removes a session from the store, otherwise sessions cached during a
 * tab-switch unmount leak xterm + WebGL until process exit.
 */
export function disposeCachedTerminal(sessionId: string): void {
  const cached = terminalCache.get(sessionId)
  if (cached) {
    terminalCache.delete(sessionId)
    try {
      cached.webgl?.dispose()
    } catch {
      /* WebGL context already lost */
    }
    try {
      cached.term.dispose()
    } catch {
      /* host element already detached */
    }
  }
  searchAddonMap.delete(sessionId)
}
