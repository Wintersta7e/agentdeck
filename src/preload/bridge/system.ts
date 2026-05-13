import { CH } from '../../shared/ipc-channels'
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
      version: () => ipcRenderer.invoke(CH.appVersion),
      versions: () => ipcRenderer.invoke(CH.appVersions),
      wslUsername: () => ipcRenderer.invoke(CH.appWslUsername),
    },
    window: {
      close: () => ipcRenderer.invoke(CH.windowClose),
      minimize: () => ipcRenderer.invoke(CH.windowMinimize),
      maximize: () => ipcRenderer.invoke(CH.windowMaximize),
    },
    zoom: {
      get: () => ipcRenderer.invoke(CH.zoomGet),
      set: (factor) => ipcRenderer.invoke(CH.zoomSet, factor),
      reset: () => ipcRenderer.invoke(CH.zoomReset),
    },
    theme: {
      get: () => ipcRenderer.invoke(CH.themeGet),
      set: (name) => ipcRenderer.invoke(CH.themeSet, name),
      popMigration: () => ipcRenderer.invoke(CH.themePopMigration),
    },
    layout: {
      get: () => ipcRenderer.invoke(CH.layoutGet),
      set: (patch) => ipcRenderer.invoke(CH.layoutSet, patch),
    },
    pickFolder: () => ipcRenderer.invoke(CH.dialogPickFolder),
    log: {
      send: (level, mod, message, data) =>
        ipcRenderer.invoke(CH.logRenderer, level, mod, message, data),
    },
    clipboard: {
      readFilePaths: () => ipcRenderer.invoke(CH.clipboardReadFilePaths),
    },
    wsl: {
      onStatus: (cb) => onIpc(CH.wslStatus, cb),
    },
    security: {
      onEncryptionUnavailable: (cb) => onIpcNoData(CH.securityEncryptionUnavailable, cb),
    },
    onFileDrop: (cb) => onIpc(CH.fileDropped, cb),
  }
}
