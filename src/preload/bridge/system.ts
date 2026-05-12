import { ipcRenderer } from 'electron'
import type { AgentDeckBridge } from '../../shared/bridge'
import { onIpc, onIpcNoData } from './events'

type SystemBridge = Pick<
  AgentDeckBridge,
  | 'app'
  | 'window'
  | 'zoom'
  | 'theme'
  | 'layout'
  | 'pickFolder'
  | 'log'
  | 'clipboard'
  | 'wsl'
  | 'security'
  | 'onFileDrop'
>

export function createSystemBridge(): SystemBridge {
  return {
    app: {
      version: () => ipcRenderer.invoke('app:version'),
      versions: () => ipcRenderer.invoke('app:versions'),
      wslUsername: () => ipcRenderer.invoke('app:wslUsername'),
    },
    window: {
      close: () => ipcRenderer.invoke('window:close'),
      minimize: () => ipcRenderer.invoke('window:minimize'),
      maximize: () => ipcRenderer.invoke('window:maximize'),
    },
    zoom: {
      get: () => ipcRenderer.invoke('zoom:get'),
      set: (factor) => ipcRenderer.invoke('zoom:set', factor),
      reset: () => ipcRenderer.invoke('zoom:reset'),
    },
    theme: {
      get: () => ipcRenderer.invoke('theme:get'),
      set: (name) => ipcRenderer.invoke('theme:set', name),
      popMigration: () => ipcRenderer.invoke('theme:popMigration'),
    },
    layout: {
      get: () => ipcRenderer.invoke('layout:get'),
      set: (patch) => ipcRenderer.invoke('layout:set', patch),
    },
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    log: {
      send: (level, mod, message, data) =>
        ipcRenderer.invoke('log:renderer', level, mod, message, data),
    },
    clipboard: {
      readFilePaths: () => ipcRenderer.invoke('clipboard:readFilePaths'),
    },
    wsl: {
      onStatus: (cb) => onIpc('wsl:status', cb),
    },
    security: {
      onEncryptionUnavailable: (cb) => onIpcNoData('security:encryption-unavailable', cb),
    },
    onFileDrop: (cb) => onIpc('file-dropped', cb),
  }
}
