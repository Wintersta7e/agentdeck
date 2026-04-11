import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: vi
      .fn()
      .mockReturnValue([{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]),
  },
}))

import { loadOfficeWindowState, saveOfficeWindowState } from './office-window-state'

describe('office-window-state', () => {
  let storeData: Record<string, unknown>
  let fakeStore: { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

  beforeEach(() => {
    storeData = {}
    fakeStore = {
      get: (key: string) => storeData[key],
      set: (key: string, value: unknown) => {
        storeData[key] = value
      },
    }
  })

  it('returns undefined when nothing is saved', () => {
    expect(loadOfficeWindowState(fakeStore as never)).toBeUndefined()
  })

  it('returns saved bounds when they fit on a display', () => {
    storeData['officeWindowState'] = {
      bounds: { x: 100, y: 100, width: 800, height: 600 },
      maximized: false,
    }
    const loaded = loadOfficeWindowState(fakeStore as never)
    expect(loaded?.bounds).toEqual({ x: 100, y: 100, width: 800, height: 600 })
    expect(loaded?.maximized).toBe(false)
  })

  it('returns undefined when saved bounds are entirely off-screen', () => {
    storeData['officeWindowState'] = {
      bounds: { x: 5000, y: 5000, width: 800, height: 600 },
    }
    expect(loadOfficeWindowState(fakeStore as never)).toBeUndefined()
  })

  it('saves bounds and maximized state from a BrowserWindow', () => {
    const fakeWindow = {
      getBounds: () => ({ x: 50, y: 75, width: 1024, height: 768 }),
      isMaximized: () => true,
    } as never
    saveOfficeWindowState(fakeStore as never, fakeWindow)
    expect(storeData['officeWindowState']).toEqual({
      bounds: { x: 50, y: 75, width: 1024, height: 768 },
      maximized: true,
    })
  })
})
