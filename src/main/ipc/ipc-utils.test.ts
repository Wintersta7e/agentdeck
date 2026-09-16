import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CH } from '../../shared/ipc-channels'

/**
 * Registration kind matters here, so this file records `handle` and `on`
 * separately instead of using the shared harness (which merges them).
 */
const handled = new Map<string, (...args: unknown[]) => unknown>()
const listened = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handled.set(channel, fn)
    },
    on: (channel: string, fn: (...args: unknown[]) => unknown) => {
      listened.set(channel, fn)
    },
  },
}))

const loggers = new Map<string, Record<string, ReturnType<typeof vi.fn>>>()
vi.mock('../logger', () => ({
  createLogger: (name: string) => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    loggers.set(name, logger)
    return logger
  },
}))

vi.mock('../wsl-utils', () => ({ toWslPath: (p: string) => p }))

const { registerUtilHandlers } = await import('./ipc-utils')

describe('ipc-utils — renderer log relay', () => {
  beforeEach(() => {
    handled.clear()
    listened.clear()
    loggers.clear()
    registerUtilHandlers()
  })

  // The relay sends nothing back. Registering it with ipcMain.handle would
  // hand the renderer a promise it has to settle at ~45 call sites, every one
  // of which discards it — an unhandled rejection waiting for a disk-full log.
  it('registers the relay as a one-way listener, not a request handler', () => {
    expect(listened.has(CH.logRenderer)).toBe(true)
    expect(handled.has(CH.logRenderer)).toBe(false)
  })

  it('forwards a valid line to a per-module logger', () => {
    listened.get(CH.logRenderer)?.(null, 'warn', 'terminal', 'resize failed', { id: 's1' })
    expect(loggers.get('renderer:terminal')?.['warn']).toHaveBeenCalledWith('resize failed', {
      id: 's1',
    })
  })

  it('drops a line whose level is not an allowed log level', () => {
    listened.get(CH.logRenderer)?.(null, 'trace', 'terminal', 'nope')
    expect(loggers.has('renderer:terminal')).toBe(false)
  })

  it('sanitises the module name before using it as a logger name', () => {
    listened.get(CH.logRenderer)?.(null, 'info', 'ter/minal:1', 'hi')
    expect(loggers.has('renderer:ter_minal:1')).toBe(true)
  })
})
