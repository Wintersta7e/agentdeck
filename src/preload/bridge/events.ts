import { ipcRenderer } from 'electron'

export function onIpc<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export function onIpcNoData(channel: string, cb: () => void): () => void {
  const listener = (): void => cb()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
