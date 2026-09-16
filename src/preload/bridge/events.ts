import { ipcRenderer } from 'electron'

// T is caller-supplied on purpose: an IPC payload has no type to infer at this
// boundary, and AgentDeckBridge is where the per-channel shape is declared.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function onIpc<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => {
    cb(data)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export function onIpcNoData(channel: string, cb: () => void): () => void {
  const listener = (): void => {
    cb()
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
