/**
 * Shared test harness for IPC handler tests.
 *
 * Replaces the per-file `const handlers = new Map(); vi.mock('electron', …); function call(){}`
 * boilerplate. Tests still own the `vi.mock` call (hoisting requirement), but the mock body
 * collapses to a single call into `makeIpcElectronMock(handlers, extras)`.
 *
 * Usage:
 *   const handlers = makeHandlersMap()
 *   vi.mock('electron', () => makeIpcElectronMock(handlers, {
 *     app: { getPath: () => '/tmp' }, // file-specific extras
 *   }))
 *   const call = makeIpcCall(handlers)
 */

export type IpcHandlerFn = (...args: unknown[]) => unknown
export type IpcHandlersMap = Map<string, IpcHandlerFn>

export function makeHandlersMap(): IpcHandlersMap {
  return new Map<string, IpcHandlerFn>()
}

export interface ElectronIpcMock {
  ipcMain: {
    handle: (channel: string, fn: IpcHandlerFn) => void
    on: (channel: string, fn: IpcHandlerFn) => void
  }
}

/**
 * Build the `electron` module shape used by `vi.mock('electron', …)`.
 * `extras` merges in module-specific surfaces (e.g. `app`, `dialog`, `BrowserWindow`).
 */
export function makeIpcElectronMock(
  handlers: IpcHandlersMap,
  extras: Record<string, unknown> = {},
): ElectronIpcMock & Record<string, unknown> {
  return {
    ipcMain: {
      handle: (channel: string, fn: IpcHandlerFn) => {
        handlers.set(channel, fn)
      },
      on: (channel: string, fn: IpcHandlerFn) => {
        handlers.set(channel, fn)
      },
    },
    ...extras,
  }
}

/**
 * Returns a `call(channel, ...args)` helper that invokes the registered handler
 * with a `null` event object (as Electron does for renderer-originated invocations).
 */
export function makeIpcCall(
  handlers: IpcHandlersMap,
): (channel: string, ...args: unknown[]) => unknown {
  return function call(channel: string, ...args: unknown[]): unknown {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`no handler registered for ${channel}`)
    return fn(null, ...args)
  }
}
