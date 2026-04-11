import { describe, it, expect, vi, beforeEach } from 'vitest'

type HandlerFn = (...args: unknown[]) => unknown

const handlers = new Map<string, HandlerFn>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler)
    },
    on: (channel: string, handler: HandlerFn) => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { registerOfficeHandlers } from '../ipc-office'

describe('ipc-office handlers', () => {
  let fakeWindowManager: {
    open: ReturnType<typeof vi.fn<() => Promise<void>>>
    isEnabled: ReturnType<typeof vi.fn<() => boolean>>
  }
  let fakeRegistry: { hasActiveWorker: ReturnType<typeof vi.fn<(id: string) => boolean>> }

  beforeEach(() => {
    handlers.clear()
    fakeWindowManager = {
      open: vi.fn<() => Promise<void>>(),
      isEnabled: vi.fn<() => boolean>().mockReturnValue(true),
    }
    fakeRegistry = {
      hasActiveWorker: vi.fn<(id: string) => boolean>().mockReturnValue(true),
    }
  })

  it('registers office:open handler', () => {
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => null,
    })
    expect(handlers.get('office:open')).toBeDefined()
  })

  it('registers office:focus-session handler', () => {
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => null,
    })
    expect(handlers.get('office:focus-session')).toBeDefined()
  })

  it('office:open rejects when kill switch is off', async () => {
    fakeWindowManager.isEnabled.mockReturnValue(false)
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => null,
    })
    const handler = handlers.get('office:open')!
    await expect(handler({})).rejects.toThrow(/disabled/i)
    expect(fakeWindowManager.open).not.toHaveBeenCalled()
  })

  it('office:open calls windowManager.open when enabled', async () => {
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => null,
    })
    const handler = handlers.get('office:open')!
    await handler({})
    expect(fakeWindowManager.open).toHaveBeenCalledTimes(1)
  })

  it('office:focus-session validates sessionId against SAFE_ID_RE', async () => {
    const fakeMainWindow = { focus: vi.fn(), webContents: { send: vi.fn() } }
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => fakeMainWindow as never,
    })
    const handler = handlers.get('office:focus-session')!
    await expect(handler({}, '; rm -rf /')).rejects.toThrow()
    expect(fakeMainWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('office:focus-session ignores when registry has no active worker', async () => {
    fakeRegistry.hasActiveWorker.mockReturnValue(false)
    const fakeMainWindow = { focus: vi.fn(), webContents: { send: vi.fn() } }
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => fakeMainWindow as never,
    })
    const handler = handlers.get('office:focus-session')!
    await handler({}, 'sess-gone')
    expect(fakeMainWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('office:focus-session pushes window:focus-session on valid input', async () => {
    const fakeMainWindow = {
      focus: vi.fn(),
      webContents: { send: vi.fn() },
      isMinimized: () => false,
    }
    registerOfficeHandlers({
      windowManager: fakeWindowManager,
      registry: fakeRegistry,
      getMainWindow: () => fakeMainWindow as never,
    })
    const handler = handlers.get('office:focus-session')!
    await handler({}, 'sess-1')
    expect(fakeMainWindow.focus).toHaveBeenCalled()
    expect(fakeMainWindow.webContents.send).toHaveBeenCalledWith('window:focus-session', 'sess-1')
  })
})
