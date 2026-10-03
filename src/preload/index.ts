import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  LibraryChannel,
  maxDropped,
  MfpChannel,
  PlaybackChannel,
  PlaylistChannel,
  RadioChannel,
  SettingsChannel,
  WinChannel,
  type InvokeChannel,
  type LibraryApi,
  type MfpApi,
  type PageChannels,
  type PlaybackApi,
  type PlaylistsApi,
  type RadioApi,
  type RadioCover,
  type RadioLogo,
  type RadioTitle,
  type SendChannel,
  type SettingsApi,
  type WinApi
} from '../shared/ipc'
import { mergeMoves, type IdMoves } from '../shared/id-moves'
import { keepEarly } from './early'
import type { ScanStatus } from '../shared/library'
import type { MfpEpisodes, MfpStatus } from '../shared/plugins/mfp/mfp'

// The window is sandboxed, so this file may only use contextBridge, ipcRenderer
// and webUtils.

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

// Asked for early too: the first paint shows the library from the index.
const library = invoke(LibraryChannel.load)

// Listens from the start; see keepEarly for what is kept until the page listens.
function latest<T>(
  channel: string,
  merge?: (early: T, next: T) => T
): (listener: (value: T) => void) => () => void {
  return keepEarly<T>((onValue) => ipcRenderer.on(channel, (_, value: T) => onValue(value)), merge)
}

// Paths only for files dragged in from the system: a file the page made
// itself has none, so the page can't name a path for main to add. One more
// than main takes is enough for main to turn a big drop down.
function droppedPaths(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files.slice(0, maxDropped + 1).map((f) => {
    try {
      return webUtils.getPathForFile(f)
    } catch {
      return ''
    }
  })
}

const onLibraryChanged = latest<Uint8Array>(LibraryChannel.changed)
const onScanStatus = latest<ScanStatus>(LibraryChannel.status)
// each map matters, so two that come early are joined
const onIdsMoved = latest<IdMoves>(LibraryChannel.idsMoved, mergeMoves)

const libraryApi: LibraryApi = {
  load: () => library,
  get: () => invoke(LibraryChannel.get),
  addFolder: () => invoke(LibraryChannel.addFolder),
  addDropped: (files) => invoke(LibraryChannel.addDropped, droppedPaths(files)),
  removeFolder: (path) => send(LibraryChannel.removeFolder, path),
  rescan: () => send(LibraryChannel.rescan),
  setArtists: (changes) => send(LibraryChannel.setArtists, changes),
  showFolder: (parts) => invoke(LibraryChannel.showFolder, parts),
  onChanged: onLibraryChanged,
  onStatus: onScanStatus,
  onIdsMoved
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
  savePlaying: (playing) => send(PlaybackChannel.savePlaying, playing),
  playing: (playing) => send(PlaybackChannel.playing, playing),
  log: (text) => send(PlaybackChannel.log, text)
}

const radioApi: RadioApi = {
  stations: () => invoke(RadioChannel.stations),
  save: (station) => invoke(RadioChannel.save, station),
  remove: (id) => invoke(RadioChannel.remove, id),
  restore: (id) => invoke(RadioChannel.restore, id),
  move: (id, by) => invoke(RadioChannel.move, id, by),
  choose: (id, url) => invoke(RadioChannel.choose, id, url),
  history: (id) => invoke(RadioChannel.history, id),
  play: (station) => invoke(RadioChannel.play, station),
  lastAnswer: (id) => invoke(RadioChannel.lastAnswer, id),
  stop: () => send(RadioChannel.stop),
  search: (q) => invoke(RadioChannel.search, q),
  onTitle: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, title: RadioTitle): void => listener(title)
    ipcRenderer.on(RadioChannel.title, handler)
    return () => ipcRenderer.off(RadioChannel.title, handler)
  },
  onLogo: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, logo: RadioLogo): void => listener(logo)
    ipcRenderer.on(RadioChannel.logo, handler)
    return () => ipcRenderer.off(RadioChannel.logo, handler)
  },
  onCover: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, cover: RadioCover): void => listener(cover)
    ipcRenderer.on(RadioChannel.cover, handler)
    return () => ipcRenderer.off(RadioChannel.cover, handler)
  }
}

const mfpApi: MfpApi = {
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

contextBridge.exposeInMainWorld('win', win)
contextBridge.exposeInMainWorld('mfpApi', mfpApi)
contextBridge.exposeInMainWorld('playlistsApi', playlistsApi)
contextBridge.exposeInMainWorld('playbackApi', playbackApi)
contextBridge.exposeInMainWorld('radioApi', radioApi)
contextBridge.exposeInMainWorld('libraryApi', libraryApi)
contextBridge.exposeInMainWorld('settingsApi', settingsApi)
