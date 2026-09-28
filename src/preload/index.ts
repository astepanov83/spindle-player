import { contextBridge, ipcRenderer } from 'electron'
import {
  LibraryChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel,
  type LibraryApi,
  type PlaybackApi,
  type PlaylistsApi,
  type SettingsApi,
  type WinApi
} from '../shared/ipc'
import type { ScanStatus } from '../shared/library'

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

// Asked for early too: the first paint shows the library from the index.
const library = ipcRenderer.invoke(LibraryChannel.load)

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
  addFolder: () => ipcRenderer.invoke(LibraryChannel.addFolder),
  removeFolder: (path) => ipcRenderer.send(LibraryChannel.removeFolder, path),
  rescan: () => ipcRenderer.send(LibraryChannel.rescan),
  onChanged: onLibraryChanged,
  onStatus: onScanStatus
}

// Asked for early too, so the first paint has the playlists and the last queue.
const playlists = ipcRenderer.invoke(PlaylistChannel.load)
const savedQueue = ipcRenderer.invoke(PlaybackChannel.loadQueue)

const playlistsApi: PlaylistsApi = {
  load: () => playlists,
  save: (list) => ipcRenderer.send(PlaylistChannel.save, list)
}

const playbackApi: PlaybackApi = {
  loadQueue: () => savedQueue,
  saveQueue: (q) => ipcRenderer.send(PlaybackChannel.saveQueue, q),
  savePos: (pos) => ipcRenderer.send(PlaybackChannel.savePos, pos),
  log: (text) => ipcRenderer.send(PlaybackChannel.log, text)
}

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('playlistsApi', playlistsApi)
contextBridge.exposeInMainWorld('playbackApi', playbackApi)
contextBridge.exposeInMainWorld('libraryApi', libraryApi)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
