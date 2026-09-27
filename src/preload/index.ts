import { contextBridge, ipcRenderer } from 'electron'
import { SettingsChannel, WinChannel, type SettingsApi, type WinApi } from '../shared/ipc'

// The window is sandboxed, so this file may only use contextBridge and ipcRenderer.
const win: WinApi = {
  minimize: () => ipcRenderer.send(WinChannel.minimize),
  toggleMaximize: () => ipcRenderer.send(WinChannel.toggleMaximize),
  close: () => ipcRenderer.send(WinChannel.close),
  isMaximized: () => ipcRenderer.invoke(WinChannel.isMaximized),
  onMaximized: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean): void => listener(maximized)
    ipcRenderer.on(WinChannel.maximized, handler)
    return () => ipcRenderer.off(WinChannel.maximized, handler)
  }
}

// Asked for now, while the page scripts are still loading, so the answer is
// there when main.ts waits for it and the first paint has the saved template.
const saved = ipcRenderer.invoke(SettingsChannel.load)

const settingsApi: SettingsApi = {
  load: () => saved,
  save: (settings) => ipcRenderer.send(SettingsChannel.save, settings)
}

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
