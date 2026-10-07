import { contextBridge, ipcRenderer } from 'electron'
import {
  AiChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel,
  type AiApi,
  type PlaybackApi,
  type PlayControl,
  type PlaylistsApi,
  type SettingsApi,
  type WinApi
} from '../shared/ipc'
import type { AiState } from '../shared/ai'
import { invoke, latest, send } from './ipc'
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
const plays = invoke(PlaybackChannel.loadPlays)

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
  log: (text) => send(PlaybackChannel.log, text),
  state: (state) => send(PlaybackChannel.state, state),
  onControl: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, control: PlayControl): void => listener(control)
    ipcRenderer.on(PlaybackChannel.control, handler)
    return () => ipcRenderer.off(PlaybackChannel.control, handler)
  },
  loadPlays: () => plays,
  played: (key) => send(PlaybackChannel.played, key)
}

// Asked for early like the settings; a state pushed before the page listens is kept.
const aiState = invoke(AiChannel.load)
const onAiState = latest<AiState>(AiChannel.state)

const aiApi: AiApi = {
  load: () => aiState,
  onState: onAiState,
  act: (provider, id, actionId, value) => send(AiChannel.act, provider, id, actionId, value),
  setTask: (task, on) => send(AiChannel.setTask, task, on),
  setProvider: (id) => send(AiChannel.setProvider, id)
}

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('aiApi', aiApi)
contextBridge.exposeInMainWorld('playlistsApi', playlistsApi)
contextBridge.exposeInMainWorld('playbackApi', playbackApi)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
for (const [name, api] of Object.entries(apis)) contextBridge.exposeInMainWorld(name, api)
