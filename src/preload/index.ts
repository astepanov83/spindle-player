import { contextBridge, ipcRenderer } from 'electron'
import {
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel,
  type PlaybackApi,
  type PlaylistsApi,
  type SettingsApi,
  type WinApi
} from '../shared/ipc'
import { invoke, send } from './ipc'
import { pluginApis } from './plugins'

// The window is sandboxed, so this file may only use contextBridge, ipcRenderer
// and webUtils.

const win: WinApi = {
  minimize: () => send(WinChannel.minimize),
  toggleMaximize: () => send(WinChannel.toggleMaximize),
  close: () => send(WinChannel.close),
  isMaximized: () => invoke(WinChannel.isMaximized),
  onMaximized: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean): void => listener(maximized)
    ipcRenderer.on(WinChannel.maximized, handler)
    return () => ipcRenderer.off(WinChannel.maximized, handler)
  },
  onAskClose: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(WinChannel.askClose, handler)
    return () => ipcRenderer.off(WinChannel.askClose, handler)
  },
  closeShown: () => send(WinChannel.closeShown),
  closeAnswer: (action) => send(WinChannel.closeAnswer, action)
}

// Asked for now, while the page scripts are still loading, so the answer is
// there when main.ts waits for it and the first paint has the saved template.
const saved = invoke(SettingsChannel.load)

const settingsApi: SettingsApi = {
  load: () => saved,
  save: (settings, toFile) => send(SettingsChannel.save, settings, toFile)
}

// Each plugin's API, asked for here so the library's early ask comes before
// the playlists', as before.
const apis = pluginApis()

// Asked for early too, so the first paint has the playlists and the last queue.
const playlists = invoke(PlaylistChannel.load)
const savedQueue = invoke(PlaybackChannel.loadQueue)

const playlistsApi: PlaylistsApi = {
  load: () => playlists,
  save: (list) => send(PlaylistChannel.save, list)
}

const playbackApi: PlaybackApi = {
  loadQueue: () => savedQueue,
  saveQueue: (q) => send(PlaybackChannel.saveQueue, q),
  savePlace: (place) => send(PlaybackChannel.savePlace, place),
  savePlaying: (playing) => send(PlaybackChannel.savePlaying, playing),
  playing: (playing) => send(PlaybackChannel.playing, playing),
  log: (text) => send(PlaybackChannel.log, text)
}

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('playlistsApi', playlistsApi)
contextBridge.exposeInMainWorld('playbackApi', playbackApi)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
for (const [name, api] of Object.entries(apis)) contextBridge.exposeInMainWorld(name, api)
