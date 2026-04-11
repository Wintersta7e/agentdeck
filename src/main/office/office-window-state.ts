import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import type { OfficeWindowStateSchema } from '../project-store'

interface AppStoreLike {
  get(key: 'officeWindowState'): OfficeWindowStateSchema | undefined
  set(key: 'officeWindowState', value: OfficeWindowStateSchema): void
}

function boundsIntersectsAnyDisplay(bounds: {
  x: number
  y: number
  width: number
  height: number
}): boolean {
  const displays = screen.getAllDisplays()
  for (const display of displays) {
    const d = display.bounds
    const left = Math.max(bounds.x, d.x)
    const top = Math.max(bounds.y, d.y)
    const right = Math.min(bounds.x + bounds.width, d.x + d.width)
    const bottom = Math.min(bounds.y + bounds.height, d.y + d.height)
    if (right > left && bottom > top) return true
  }
  return false
}

export function loadOfficeWindowState(store: AppStoreLike): OfficeWindowStateSchema | undefined {
  const saved = store.get('officeWindowState')
  if (!saved) return undefined
  if (saved.bounds && !boundsIntersectsAnyDisplay(saved.bounds)) {
    return undefined
  }
  return saved
}

export function saveOfficeWindowState(store: AppStoreLike, window: BrowserWindow): void {
  const bounds = window.getBounds()
  const maximized = window.isMaximized()
  store.set('officeWindowState', { bounds, maximized })
}
