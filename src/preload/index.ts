import { contextBridge, ipcRenderer } from 'electron'
import {
  LibraryChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel,
  type InvokeChannel,
  type LibraryApi,
  type PageChannels,
  type PlaybackApi,
  type PlaylistsApi,
  type SendChannel,
  type SettingsApi,
  type WinApi
} from '../shared/ipc'
import type { ScanStatus } from '../shared/library'

// The window is sandboxed, so this file may only use contextBridge and ipcRenderer.

// Typed from PageChannels, like main's handlers, so both sides agree.
function invoke<K extends InvokeChannel>(
  channel: K,
  ...args: Parameters<PageChannels[K]>
): ReturnType<PageChannels[K]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<PageChannels[K]>
}
function send<K extends SendChannel>(channel: K, ...args: Parameters<PageChannels[K]>): void {
  ipcRenderer.send(channel, ...args)
}

const win: WinApi = {
  minimize: () => send(WinChannel.minimize),
  toggleMaximize: () => send(WinChannel.toggleMaximize),
  close: () => send(WinChannel.close),
  isMaximized: () => invoke(WinChannel.isMaximized),
  onMaximized: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, maximized: boolean): void => listener(maximized)
    ipcRenderer.on(WinChannel.maximized, handler)
    return () => ipcRenderer.off(WinChannel.maximized, handler)
  }
}

// Asked for now, while the page scripts are still loading, so the answer is
// there when main.ts waits for it and the first paint has the saved template.
const saved = invoke(SettingsChannel.load)

const settingsApi: SettingsApi = {
  load: () => saved,
  save: (settings) => send(SettingsChannel.save, settings)
}

// Asked for early too: the first paint shows the library from the index.
const library = invoke(LibraryChannel.load)

// Listens from the start. A value that comes before the page subscribes is
// kept for it, so a scan that ends early is not lost. Once the page listens,
// nothing is kept, since a library can be tens of MB.
function latest<T>(channel: string): (listener: (value: T) => void) => () => void {
  let early: { value: T } | undefined
  const listeners = new Set<(value: T) => void>()
  ipcRenderer.on(channel, (_, value: T) => {
    if (!listeners.size) early = { value }
    for (const l of listeners) l(value)
  })
  return (listener) => {
    listeners.add(listener)
    if (early) listener(early.value)
    early = undefined
    return () => void listeners.delete(listener)
  }
}

const onLibraryChanged = latest<Uint8Array>(LibraryChannel.changed)
const onScanStatus = latest<ScanStatus>(LibraryChannel.status)

const libraryApi: LibraryApi = {
  load: () => library,
  addFolder: () => invoke(LibraryChannel.addFolder),
  removeFolder: (path) => send(LibraryChannel.removeFolder, path),
  rescan: () => send(LibraryChannel.rescan),
  onChanged: onLibraryChanged,
  onStatus: onScanStatus
}

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
  playing: (playing) => send(PlaybackChannel.playing, playing),
  log: (text) => send(PlaybackChannel.log, text)
}

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('playlistsApi', playlistsApi)
contextBridge.exposeInMainWorld('playbackApi', playbackApi)
contextBridge.exposeInMainWorld('libraryApi', libraryApi)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
