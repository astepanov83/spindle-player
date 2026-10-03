// Music For Programming's part of the preload: `window.mfpApi`. Runs in the
// page's sandboxed preload, so it may only use ipcRenderer.
import { ipcRenderer } from 'electron'
import { MfpChannel, type MfpApi } from '../../../shared/plugins/mfp/ipc'
import type { MfpEpisodes, MfpStatus } from '../../../shared/plugins/mfp/mfp'
import { invoke, send } from '../../../preload/ipc'

export function mfpPreload(): MfpApi {
  return {
    get: () => invoke(MfpChannel.get),
    refresh: () => send(MfpChannel.refresh),
    onEpisodes: (listener) => {
      const handler = (_: Electron.IpcRendererEvent, data: MfpEpisodes): void => listener(data)
      ipcRenderer.on(MfpChannel.episodes, handler)
      return () => ipcRenderer.off(MfpChannel.episodes, handler)
    },
    onStatus: (listener) => {
      const handler = (_: Electron.IpcRendererEvent, s: MfpStatus | undefined): void => listener(s)
      ipcRenderer.on(MfpChannel.status, handler)
      return () => ipcRenderer.off(MfpChannel.status, handler)
    }
  }
}
