import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  app: { getVersion: () => '5.0.1' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

const { registerWindowHandlers } = await import('./ipc-window')

function call(channel: string, ...args: unknown[]): unknown {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn(null, ...args)
}

interface MiniPrefs {
  zoomFactor?: number
  theme?: string
  rightPanelWidth?: number
  wfLogPanelWidth?: number
}

function makeStore(initial: MiniPrefs = {}): {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  _prefs: MiniPrefs
} {
  const s = {
    _prefs: initial as MiniPrefs,
    get: vi.fn((key: string) => (key === 'appPrefs' ? s._prefs : undefined)),
    set: vi.fn((key: string, val: MiniPrefs) => {
      if (key === 'appPrefs') s._prefs = val
    }),
  }
  return s
}

describe('ipc-window', () => {
  beforeEach(() => {
    handlers.clear()
  })

  describe('zoom:set', () => {
    it('clamps factor below 0.5 to 0.5', () => {
      const store = makeStore({ zoomFactor: 1 })
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      expect(call('zoom:set', 0.1)).toBe(0.5)
      expect(store._prefs.zoomFactor).toBe(0.5)
    })

    it('clamps factor above 2.5 to 2.5', () => {
      const store = makeStore({ zoomFactor: 1 })
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      expect(call('zoom:set', 5)).toBe(2.5)
    })
  })

  describe('theme:set', () => {
    it('rejects unknown themes (returns empty and stores empty)', () => {
      const store = makeStore({ theme: 'amber' })
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      expect(call('theme:set', 'not-a-real-theme')).toBe('')
      expect(store._prefs.theme).toBe('')
    })

    it('accepts known themes', () => {
      const store = makeStore()
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      expect(call('theme:set', 'phosphor')).toBe('phosphor')
    })
  })

  describe('layout:set', () => {
    it('ignores unknown keys', () => {
      const store = makeStore({ rightPanelWidth: 240 })
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      call('layout:set', { arbitraryKey: 123, rightPanelWidth: 300 })
      expect(store._prefs).toMatchObject({ rightPanelWidth: 300 })
      expect('arbitraryKey' in store._prefs).toBe(false)
    })

    it('rejects rightPanelWidth outside [0, 5000]', () => {
      const store = makeStore({ rightPanelWidth: 200 })
      registerWindowHandlers(
        () => null,
        store as unknown as Parameters<typeof registerWindowHandlers>[1],
      )
      call('layout:set', { rightPanelWidth: -10 })
      expect(store._prefs.rightPanelWidth).toBe(200)
      call('layout:set', { rightPanelWidth: 6000 })
      expect(store._prefs.rightPanelWidth).toBe(200)
      call('layout:set', { rightPanelWidth: 300 })
      expect(store._prefs.rightPanelWidth).toBe(300)
    })
  })
})
