import { contextBridge, ipcRenderer } from 'electron'
import { WinChannel, type WinApi } from '../shared/ipc'

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

contextBridge.exposeInMainWorld('win', win)
