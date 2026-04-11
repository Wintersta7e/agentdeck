import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OfficeWindowManager } from './office-window-manager'

// Track created instances and mock session for assertions
let instances: Array<{
  focus: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  webContents: { send: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn> }
}> = []
let capturedSessionHandlers: {
  onHeadersReceived: ReturnType<typeof vi.fn>
  setPermissionRequestHandler: ReturnType<typeof vi.fn>
}

vi.mock('electron', async () => {
  const { EventEmitter } = await import('events')
  const onHeadersReceived = vi.fn()
  const setPermissionRequestHandler = vi.fn()
  capturedSessionHandlers = { onHeadersReceived, setPermissionRequestHandler }

  class FakeBrowserWindow extends EventEmitter {
    webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      once: vi.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === 'did-finish-load') queueMicrotask(cb)
      }),
      on: vi.fn(),
    }
    constructor() {
      super()
      instances.push(this as never)
    }
    loadURL = vi.fn().mockResolvedValue(undefined)
    loadFile = vi.fn().mockResolvedValue(undefined)
    focus = vi.fn()
    show = vi.fn()
    maximize = vi.fn()
    close = vi.fn(function (this: FakeBrowserWindow) {
      this.emit('closed')
    })
    isDestroyed = () => false
    isMinimized = () => false
    getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 })
    isMaximized = () => false
  }
  return {
    BrowserWindow: FakeBrowserWindow,
    session: {
      fromPartition: vi.fn().mockReturnValue({
        webRequest: { onHeadersReceived },
        setPermissionRequestHandler,
      }),
    },
    screen: {
      getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
    },
    app: { isPackaged: false },
  }
})

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { createOfficeWindowManager } = await import('./office-window-manager')
const { session } = await import('electron')

describe('OfficeWindowManager', () => {
  let mgr: OfficeWindowManager

  async function makeDeps() {
    const { EventEmitter } = await import('events')
    return {
      mainWindow: new EventEmitter() as never,
      aggregator: {
        resume: vi.fn(),
        pause: vi.fn(),
        tick: vi.fn(),
        startTimer: vi.fn(),
        dispose: vi.fn(),
      } as never,
      appStore: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'appPrefs') return { officeEnabled: true, theme: 'amber' }
          return undefined
        }),
        set: vi.fn(),
      } as never,
      registry: { hasActiveWorker: vi.fn().mockReturnValue(true) } as never,
    }
  }

  beforeEach(() => {
    instances = []
    vi.mocked(session.fromPartition).mockClear()
    capturedSessionHandlers.onHeadersReceived.mockClear()
    capturedSessionHandlers.setPermissionRequestHandler.mockClear()
  })

  it('open() creates a BrowserWindow with ephemeral office partition', async () => {
    mgr = createOfficeWindowManager(await makeDeps())
    await mgr.open()
    expect(session.fromPartition).toHaveBeenCalledWith('office')
    expect(instances).toHaveLength(1)
  })

  it('open() twice focuses existing window', async () => {
    mgr = createOfficeWindowManager(await makeDeps())
    await mgr.open()
    await mgr.open()
    expect(instances).toHaveLength(1)
    expect(instances[0]!.focus).toHaveBeenCalled()
  })

  it('applies CSP on the office partition', async () => {
    mgr = createOfficeWindowManager(await makeDeps())
    await mgr.open()
    expect(capturedSessionHandlers.onHeadersReceived).toHaveBeenCalled()
  })

  it('denies all permission requests', async () => {
    mgr = createOfficeWindowManager(await makeDeps())
    await mgr.open()
    expect(capturedSessionHandlers.setPermissionRequestHandler).toHaveBeenCalled()
    const handler = capturedSessionHandlers.setPermissionRequestHandler.mock.calls[0]![0] as (
      wc: unknown,
      perm: string,
      cb: (granted: boolean) => void,
    ) => void
    const callback = vi.fn()
    handler({}, 'notifications', callback)
    expect(callback).toHaveBeenCalledWith(false)
  })

  it('isEnabled returns false when officeEnabled is false', async () => {
    const deps = await makeDeps()
    const appStore = deps.appStore as unknown as { get: ReturnType<typeof vi.fn> }
    appStore.get.mockImplementation((key: string) => {
      if (key === 'appPrefs') return { officeEnabled: false }
      return undefined
    })
    mgr = createOfficeWindowManager(deps)
    expect(mgr.isEnabled()).toBe(false)
  })

  it('mainWindow close cascades to office window close', async () => {
    const deps = await makeDeps()
    mgr = createOfficeWindowManager(deps)
    await mgr.open()
    const officeWin = instances[0]!
    ;(deps.mainWindow as unknown as import('events').EventEmitter).emit('closed')
    expect(officeWin.close).toHaveBeenCalled()
  })
})
